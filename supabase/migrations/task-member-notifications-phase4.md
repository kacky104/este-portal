# タスク：通知・新着フォロー（フェーズ4・保存サロンの新着）

## 目的
ログイン会員が保存しているサロンの新着（クーポン・お知らせ）を、新着としてまとめて見られるようにする。会員ダッシュボード（/member）の「通知・新着フォロー（準備中）」枠を実機能に置き換え、ヘッダーに未読バッジ付きのベルアイコンを追加する。

**フェーズ4のスコープ：保存サロンの新着（クーポン・お知らせ）のプル型通知のみ。** 保存セラピストの出勤通知（バッチが必要）は今回やらない。プッシュ配信もやらない。

## 方式：プル型（動的計算）
- 通知レコードは作らない。表示のたびに「保存サロンの新着」を動的に計算する。
- 「新着」の定義：会員の各保存サロンについて、**そのサロンを保存した日時（saved_items.created_at）より後**に出た、announcements と coupons。
- 「未読」の定義：上記の新着のうち、**会員が通知を最後に確認した日時（notification_reads.last_checked_at）より後**に出たもの。その件数がヘッダーの未読バッジの数字。
- 会員が通知一覧を開いたら last_checked_at を now() に更新し、未読を0に戻す。

## 前提（重要）
- DBテーブル `public.notification_reads` は**作成済み**（手動SQL実行済み）。構成：
  - `user_id uuid primary key`（auth.users(id), on delete cascade）
  - `last_checked_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - RLS有効。本人のみ select / insert / update 可能。
- 既存テーブルの新着判定に使う列（確認済み）：
  - `announcements`：`salon_id int`, `title text`, `content text`, `is_published boolean`, `published_at timestamptz`, `created_at timestamptz`。**新着判定は published_at を使う**。is_published = true のものだけ対象。
  - `coupons`：`salon_id int`, `title text`, `discount text`, `is_published boolean`, `created_at timestamptz`。**新着判定は created_at を使う**（published_at 列は無い）。is_published = true のものだけ対象。
  - `saved_items`：`user_id uuid`, `item_type text`（'salon'/'therapist'）, `item_id bigint`, `created_at timestamptz`（保存日時）。サロンの保存は item_type = 'salon'。
- 会員ログインは既存の Supabase Auth。通知関連は**ログイン会員のみ**（未ログインはヘッダーにバッジを出さない／通知ページは /login へリダイレクト）。
- /mypage はオーナー専用。**一切触らない。**
- ブランド色を踏襲。既存ヘッダー（ロゴ・保存バッジ・アカウントメニュー）の構造を壊さない。

## ルール
- 新規ページ・ヘッダー変更。feedback_auto_deploy.md の手順で自動コミット→プッシュ→デプロイまで進める。
- DBスキーマ変更はしない（テーブルは作成済み）。環境変数の変更なし。
- 既存ページ（トップ・サロン詳細・/saved・/mypage・/member 等）の表示や ISR キャッシュの挙動を壊さない。

---

## 実装内容

### 1. 新着計算ロジック（共通関数）
- 「ログイン会員の新着フィード」を返す共通関数を作る（例 `src/app/lib/notifications.ts`）。認証済みクライアントで以下を行う：
  1. 本人の saved_items から item_type = 'salon' の保存サロン（salon_id と各々の保存日時 created_at）を取得。
  2. それらの salon_id について、announcements（is_published = true）と coupons（is_published = true）を取得。
  3. 各新着について「そのサロンの保存日時より後に出たか」を判定（announcements は published_at、coupons は created_at で比較）。保存日時より後のものだけを新着とする。
  4. 新着を日時の降順（新しい順）に統一して並べる。種別（announcement / coupon）、サロンID・サロン名、タイトル、日時、リンク先（/salon/[id] の該当サブページ。お知らせ→/salon/[id]/news、クーポン→/salon/[id]/coupon など適切に）を持つ統一フィード配列にする。
  - 取得クエリは可能な範囲で Promise.all で並列化。サロンが0件保存なら空フィードを返す。
- 未読件数の計算：notification_reads から本人の last_checked_at を取得（行が無ければ十分過去＝全部未読、もしくは作成時刻を基準にする等、妥当な初期値）。フィードのうち日時が last_checked_at より後のものの件数を「未読数」とする。

### 2. 通知一覧ページ /member/notifications（新規）
- 新規ファイル `src/app/member/notifications/page.tsx`。ログイン必須（未ログインは /login へ redirect）。
- 上記の新着フィードを新しい順に一覧表示。各項目：サロン名、種別（お知らせ/クーポン）、タイトル、日時、タップで該当ページへ遷移。
- 未読のものは視覚的に区別（背景色や「NEW」バッジ等、控えめに）。
- 共通ヘッダー流用。パンくず（マイページ＞お知らせ/新着）。0件なら空状態（「新着はありません」等）。
- **このページを開いたタイミングで notification_reads を upsert し、last_checked_at を now() に更新する**（既読化）。これにより次回から未読が0になる。upsert は user_id = 本人uid 固定、onConflict: 'user_id'。更新は表示を妨げないように行う（表示は最新フィード、その後に既読化、で良い）。

### 3. ヘッダーに未読バッジ付きベルアイコンを追加
- 既存の共通ヘッダー（保存数バッジ・アカウントメニューがある部分）に、ベルアイコン（通知）を追加する。既存レイアウトを壊さないこと。
- ログイン会員のときのみ表示。未読数 > 0 のとき、ベルに件数バッジを出す（既存の保存バッジと同系のスタイルで。数字が大きいときは "9+" 等の簡易表記でも可）。
- ベルをタップで /member/notifications へ遷移。
- 未読数の取得は、ヘッダーがサーバー側で会員セッションを持っているならそこで計算、難しければ軽量なクライアント取得でも良い。**ただしトップやサロン詳細など ISR キャッシュ済みページのヘッダーで、サーバー側の重い計算を挟んでキャッシュを壊さないよう注意**。ヘッダーの未読取得はクライアント側（マウント後に取得）で行うのが無難。ISR ページのサーバーレンダリングに認証・個別計算を持ち込まないこと。

### 4. /member ダッシュボード更新
- 「通知・新着フォロー（準備中）」枠を、**/member/notifications への有効リンク**に変更（点線・準備中ピル除去）。未読があれば件数を添えてもよい（任意）。
- これで /member の準備中3枠（プロフィール・閲覧履歴・通知）がすべて実機能になる。

### 5. データ取得・キャッシュの注意
- /member/notifications はログイン会員個別なので ISR キャッシュ対象にしない（動的のまま）。
- 新着計算・notification_reads は認証済みクライアントで行い RLS を尊重（cookie レス匿名クライアントは使わない）。
- **ヘッダーへのベル追加で、トップ・サロン詳細等の ISR を壊さないこと。** これらのページのサーバーレンダリングは公開データのみで完結させ、会員個別の未読計算はクライアント側に寄せる。

---

## やってはいけないこと
- /mypage（オーナー用）に触れない。
- トップ・サロン詳細の ISR キャッシュ／cookie レス化を壊さない（未読計算はクライアント側に寄せる）。
- notification_reads の user_id にログインユーザー以外の値を入れない（RLSと整合）。
- 未ログインユーザーにバッジや通知を出さない。
- 保存セラピストの出勤通知（バッチ）を今回実装しない。
- 通知レコードを生成しない（プル型を維持）。

---

## 完了後の検証
- `npx tsc --noEmit`：エラーなし。
- `npm run lint`：エラーなし。
- `npm run build`：成功。**トップ・サロン詳細（/salon/[id]）が引き続き ISR（●/revalidate）のまま**（ヘッダーにベルを足したことで ƒ Dynamic に退行していないこと）。/member/notifications は ƒ（動的）でよい。
- ログイン会員で、保存しているサロンが保存日時より後に出した新着（クーポン/お知らせ）が /member/notifications に新しい順で出る。
- 保存日時より前の古い新着は出ない。保存していないサロンの新着は出ない。
- 未読があるとヘッダーのベルに件数バッジが出る。/member/notifications を開くと既読化され、再訪時にバッジが消える（または減る）。
- 新たな新着が出れば再び未読が増える。
- 未ログインではベルバッジが出ず、/member/notifications は /login へリダイレクト。
- 別会員では他人の保存・既読状態に影響されない（RLS）。
- スマホ幅・PC幅でヘッダー・通知ページのレイアウトが崩れない。
- トップ・サロン詳細の表示速度（ISR）が維持されている。

## 次フェーズ予告（今回はやらない）
- 保存セラピストの出勤通知（pg_cron バッチで「今日出勤する保存セラピスト」を拾う設計）。
- プロフィール拡張（アバター画像・好きなエリア）。
- 通知のプッシュ配信・メール通知。