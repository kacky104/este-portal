# タスク：サロン詳細ページ＋サブページの表示速度改善（ISR化・クエリ並列化・保存時即時反映）

## 目的
トップページからサロン詳細ページ（/salon/[id]）への遷移が遅い。原因はトップで解決したのと同じ：
1. 詳細ページが cookie を読む createClient を使っており動的（dynamic）描画になっていて、ISR キャッシュに乗らない。
2. revalidate 未設定。
3. Supabase クエリが直列（await の連続）。

これをトップと同じ方式で解消し、詳細ページの遷移・表示を高速化する。
さらに、オーナーが店舗情報・料金・クーポン等を編集したら、該当サロンの詳細ページ（とその配下サブページ）に**即時反映**されるようにする。

## 対象範囲
サロン詳細ページ本体と、その配下のサブページすべて：
- 本体：`src/app/salon/[id]/page.tsx`
- サブページ：`src/app/salon/[id]/` 配下の各 page.tsx
  - price（料金）/ coupon（クーポン）/ news（お知らせ）/ info（店舗情報）/ diary（写メ日記）/ schedule（スケジュール）/ therapists（セラピスト一覧）/ imasugu（今すぐ）
  - ※ 実際に存在するサブページをディレクトリで確認してから作業すること。

## 前提（既存の仕組みを再利用する）
- トップページ最適化（task-top-performance.md）で、cookie を読まない匿名クライアント **createPublicClient** を作成済み。**これを詳細ページでも使う。** 場所が不明なら検索して特定すること（createPublicClient で全体検索）。
- on-demand revalidate 用の API ルート `src/app/api/revalidate`（POST、認証オーナーのみ許可）が既に存在する。**今回はこれを拡張する。**
- `next.config.ts` の images 設定は変更不要。

## ルール
- 見た目・レイアウト・表示内容は一切変えない。
- DB スキーマ変更なし。環境変数の変更なし。
- 完了後に型チェック・lint・build クリーンを確認し、feedback_auto_deploy.md の手順で自動コミット→プッシュ→デプロイまで進める。

---

## 実装ステップ

### 1. cookie レスクライアントへの置き換え（本体＋全サブページ）
- 各ページの `@/app/lib/supabase/server` の createClient（cookie を読む版）を、トップで作った cookie レスの **createPublicClient** に置き換える。
- これらのページの公開データ（サロン情報・画像・セラピスト・スケジュール・料金・クーポン等）は匿名でも SELECT できる（公開ページで既に表示されているため）。
- ヘッダーの SavedSalonsMenu / AccountMenu はクライアントコンポーネントなので、サーバー側で cookie を読む必要はない（認証はブラウザ側で従来通り動く）。

### 2. revalidate の追加（本体＋全サブページ）
- 各ページの先頭付近に `export const revalidate = 600;`（10分）を追加する。

### 3. クエリの並列化（本体＋全サブページ）
- 各ページのデータ取得を確認し、**互いに依存しないクエリは Promise.all でまとめて並列実行**する。
- ファイルごとにクエリ構造が異なるので、各ファイルの実際の依存関係を読み取って判断すること（依存があるものは後段に残す）。
- 例（本体 page.tsx の場合）：salons 本体・salon_images・therapists（在籍）は互いに独立なので Promise.all でまとめられる。row が無ければ notFound する分岐は維持する。
- 並列化しても結果・表示は変えないこと。

### 4. 静的パラメータの事前生成（本体のみ）
- `src/app/salon/[id]/page.tsx` に `generateStaticParams` を追加し、ビルド時に全サロンの id を列挙して各ページを事前生成する。
  - 取得には createPublicClient を使い、salons テーブルから全 id を取得して `{ id: String(id) }[]` を返す。
- ビルド後に新規追加されたサロンは、デフォルトの dynamicParams（true）により初回アクセス時に生成され以降キャッシュされるので、generateStaticParams に無い id でも 404 にしないこと（デフォルト挙動のままで良い。dynamicParams = false にはしない）。
- サブページへの generateStaticParams 追加は任意。付けなくてもデフォルト dynamicParams により初回アクセスで生成・キャッシュされる。まずは本体のみで良い。

### 5. revalidate API をサロンID対応に拡張
- 既存 `src/app/api/revalidate`（POST）を拡張する。
  - 認証チェック（認証済みオーナーのみ・未認証は 401）は**そのまま維持**する。
  - リクエストボディで対象を受け取れるようにする。例：`{ salonId?: number | string }`。
  - salonId が指定されたら、そのサロン配下をまとめて無効化する：`revalidatePath('/salon/' + salonId, 'layout')`（本体＋サブページが一括で対象になる）。
  - 従来通りトップも無効化する場合に備え、`revalidatePath('/')` も呼べるようにする（salonId 有無に応じて適切に。サロン編集はトップのカード表示にも影響しうるため、サロン編集系では '/' も無効化して良い）。
  - 後方互換：salonId 無しで呼ばれた既存の呼び出し（トップ用）は今まで通り '/' を無効化する。

### 6. 保存処理から該当サロンの revalidate を呼ぶ
- サロン情報・料金（courses）・クーポン・お知らせ・スケジュール・セラピスト等、サロン詳細の表示に影響する保存（update/insert/upsert/delete）の成功直後に、**編集中のサロンID** を渡して revalidate を呼ぶ。
  - 既存の revalidateTop ヘルパー（task-top-performance.md で作成）を拡張するか、salonId を受け取る形の薄いヘルパーにする。例：`revalidateSalon(salonId)`。
  - 対象の保存箇所（検索 `.update(` / `.insert(` / `.upsert(` でヒットし、かつサロン詳細の表示に関わるもの）：
    - `src/app/mypage/page.tsx`（salon_images / coupons / announcements / サロン情報）
    - `src/app/components/SalonEditModal.tsx`
    - `src/app/components/FeaturedSalonsManager.tsx`（ピックアップはトップにも影響するので '/' も）
    - その他、サロンに紐づく情報を保存している箇所
  - 編集対象のサロンIDがその場で分かる場合はそれを渡す。分からない場合は、保存しているレコードの salon_id を使う。
  - revalidate 呼び出しは try/catch で失敗を握りつぶし、ユーザー操作は止めない。

---

## やってはいけないこと
- next.config を触らない。
- dynamicParams = false にしない（新規サロンが 404 になる）。
- 認証チェックを外さない（revalidate API は認証オーナーのみ）。
- 表示内容・レイアウトを変えない。
- 依存関係のあるクエリを無理に並列化して結果を壊さない。

---

## 完了後の検証
- `npx tsc --noEmit`：エラーなし。
- `npm run lint`：エラーなし。
- `npm run build`：成功。出力で /salon/[id] が ISR（revalidate）として生成されていること（ƒ Dynamic ではない）。generateStaticParams により複数のサロンページが事前生成されていることを確認。
- 本番反映後、トップからサロンをクリックして詳細へ遷移し、表示が速くなっていること（2回目以降が特に速い）。
- マイページ（/mypage）でそのサロンの情報を編集 → 該当の詳細ページを再読込 → 変更が即反映されること。
- 詳細ページとサブページ（料金・クーポン等）の見た目・内容が以前と同じであること。

## 効果測定（手動・参考）
- DevTools の Network で「すべて」または「Fetch/XHR」フィルタにし、トップからサロンをクリックした際に飛ぶ遷移リクエスト（salon / _rsc 等）の「時間」が、最適化前より大きく短縮されていることを確認する。