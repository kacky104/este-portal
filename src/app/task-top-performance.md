# タスク：トップページの表示速度改善（ISRキャッシュ化＋クエリ並列化）

## 目的
トップページ（ルート /）の TTFB が約3.1秒と遅い。原因は2つ：
1. サーバー側で `Math.random()` シャッフルをしているためページが毎回フル動的描画になり、CDN/ISR キャッシュに乗らない。
2. Supabase クエリが直列（await の連続）で、往復が積み上がっている。

これを解消し、トップの TTFB を数百ms以下にする。
表示上の「並び順が読み込みのたびに変わる」体験は**維持する**。
オーナーが情報を編集したら、トップに**即反映**されるようにする。

対象：主に `src/app/page.tsx`（トップページ）と、各オーナー編集の保存処理。

## ルール
- 見た目は変えない（並び順がランダムに見える挙動は維持）。
- DB スキーマ変更なし。
- 新規の環境変数は不要（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY は既存のものを使う）。
- 完了後に型チェック・lint クリーンを確認し、feedback_auto_deploy.md の手順で自動コミット→プッシュ→デプロイまで進める。

---

## 実装ステップ

### 1. サーバー側の Math.random() シャッフルを削除（`src/app/page.tsx`）
- ピックアップサロンの Fisher-Yates シャッフル（`built` 配列を for ループで入れ替えている箇所）を削除する。featuredSalons は display_order 順のまま返す。
- 掲載サロン一覧側：`ShuffledSalons` コンポーネントの中身を確認する。
  - すでにクライアント側（'use client'）でシャッフルしているなら、page.tsx 側は変更不要。
  - もしシャッフルがサーバー側（page.tsx か fetchSalons 内）で行われているなら、それを削除しサーバーは固定順で返すようにする。

### 2. シャッフルをクライアントコンポーネントへ移設
- ピックアップ：`FeaturedSalonSlider`（'use client'）の中で、受け取った salons をシャッフルして表示する。
- 掲載一覧：`ShuffledSalons` が未シャッフルなら同様にクライアント側でシャッフルする。
- **ハイドレーション不一致を必ず避けること。**
  - サーバーの初回HTMLは「渡された順（固定）」でレンダリングし、クライアントのマウント後（useEffect 内）にシャッフルして並べ替える実装にする。
  - useState の初期化関数内で Math.random() を呼ぶと、サーバーとクライアントで結果が食い違いハイドレーションエラーになるので**やらない**。
- 体験として「ページを開くたびに順番が変わる」を維持する。

### 3. クエリの並列化（`src/app/page.tsx`）
- 互いに依存しない最初の3クエリを Promise.all でまとめて同時実行する：
  - `fetchSalons(supabase)`（掲載サロン）
  - `featured_salons` の取得
  - 本日出勤総数（todaySchedules）の取得
- featured の詳細取得（salons・therapists・各スケジュール）は featuredRows に依存するため、その後段で実行する（既存の Promise.all はそのまま活かす）。

### 4. ISR キャッシュを有効化
- `src/app/page.tsx` の先頭付近に次を追加：
  ```ts
  export const revalidate = 600; // 10分
  ```
- 【重要・要検証】`./lib/supabase/server` の createClient は内部で cookies() を読むため、これを使うとルートが動的（dynamic）扱いになり revalidate が効かない。
  - トップページの公開データ取得は、**cookie を読まない匿名クライアント**に切り替える。具体的には `@supabase/supabase-js` の createClient に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を渡したクライアントを使う。
  - これらのテーブルは匿名でも SELECT できる（公開トップで既に表示されているため、anon の SELECT ポリシーは通っているはず）。
  - SavedSalonsMenu / AccountMenu はクライアントコンポーネントなので、認証はブラウザ側で従来通り動く。サーバー側で cookie を読む必要はない。
- **検証**：`npm run build` の出力で、トップルート（/）が `ƒ (Dynamic)` ではなく `○`（Static）/ `●`（SSG）/ revalidate 付きの ISR になっていることを確認する。動的のままなら、まだどこかで cookies/headers を読んでいるので、その原因を除去する。

### 5. キャッシュ即時更新用のエンドポイントを作成
- 新規ファイル `src/app/api/revalidate/route.ts` を作成。POST で `revalidatePath('/')` を呼ぶ。
- **認証で守る（共有シークレットは使わない）**：
  - リクエストの cookie からログインセッションを取得し（`./lib/supabase/server` の createClient → getUser）、**認証済みオーナーのときだけ** revalidate する。
  - オーナー判定の方法は、既存の /owner 認証やオーナー判定ロジックに合わせる。判定方法が不明なら、最低条件として「認証済みユーザーであること」をチェックする。
  - 未認証なら 401 を返す。
  - 補足：保存はオーナーのブラウザから行われ、cookie が自動で同送されるため、クライアントから別途トークンを渡す必要はない。クライアントに埋め込んだ秘密鍵は秘密にならないので使わない。

### 6. 各保存処理の成功後に revalidate を叩く
- 共通ヘルパー `src/app/lib/revalidateTop.ts` を作る（成功後に `fetch('/api/revalidate', { method: 'POST' })` を1回呼ぶだけ。try/catch で失敗は握りつぶしてログのみ。ユーザー操作は止めない）。
- 以下の各保存（update / insert / upsert / delete）が**成功した直後**に、このヘルパーを1回呼ぶ：
  - `src/app/mypage/page.tsx`（salon_images / coupons / announcements）
  - `src/app/mypage/therapist/[id]/page.tsx`
  - `src/app/mypage/MyDiaryList.tsx`
  - `src/app/components/FeaturedSalonsManager.tsx`
  - `src/app/components/HeaderSliderManager.tsx`
  - `src/app/components/SalonEditModal.tsx`

---

## 完了後の検証
- `npm run build` / 型チェック / lint がすべてクリーン。
- build 出力でトップ（/）が ISR（revalidate=600）になっている（動的でない）。
- トップを2回連続で読み込み、2回目が明確に速い（キャッシュヒット）こと。
- それでも並び順は読み込みのたびに変わること。
- マイページ（/mypage）で何か保存 → トップを再読込 → 変更が即反映されること。

## 補足（今回はやらないが、将来の選択肢）
- 反映対象をトップ以外（/working、/salon/[id] など）にも広げたくなったら、revalidate エンドポイント内で `revalidatePath('/working')` 等を追加するだけで拡張できる。
- 画像が重くトップの総転送量が大きい（初回訪問者が重い）件は別タスク。next/image 化＋ sizes 指定で対応予定。