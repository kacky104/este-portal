フクエスにセラピストの口コミ機能を実装します。以下を上から順に作業してください。なおこのタスクは DBスキーマと認証（管理者認可・service_role）に関わるため、**作業が終わっても自動デプロイしないでください。Stop hook での自動コミットもしないでください。** コミット・プッシュ・デプロイはこちらが内容を確認してから手動で行います。本番を curl で検証する必要はありません。確認はブラウザでこちらがやります。

## 前提（すでに完了していること・触らないこと）

- DBテーブル `public.therapist_reviews` と RLS は Supabase SQL Editor で作成済みです。マイグレーションやテーブル作成のコードは書かないでください。スキーマ定義は以下のとおりです（参照用）。
  - `id` uuid PK / `therapist_id` bigint (FK therapists, on delete cascade) / `user_id` uuid (FK auth.users, on delete cascade) / `rating` numeric(2,1)（0.5刻み 0.5〜5.0）/ `body` text（1〜2000文字）/ `status` text default 'pending'（'pending'/'approved'/'rejected'）/ `created_at` timestamptz / `reviewed_at` timestamptz
  - RLS: SELECT は `status='approved' または auth.uid()=user_id`。INSERT は `auth.uid()=user_id かつ status='pending'`（authenticated ロールのみ）。**UPDATE/DELETE ポリシーは存在しない**＝クライアントからの更新・削除は不可。
- `src/app/lib/admin.ts` の `ADMIN_UUID`（名前付きエクスポート）をそのまま使ってください。
- `src/app/lib/supabase/service.ts` の `createServiceClient()`（引数なし）をそのまま使ってください。
- `profiles` テーブルは `id`(uuid, ＝auth.users.id と一致) と `nickname`(text) を持ちます。投稿者名はこの `nickname` を使います。
- 既存の ISR 構成（`generateStaticParams`・`createPublicClient`・`export const revalidate`）は壊さないでください。公開ページの読み取りは必ず cookieレス匿名クライアント `createPublicClient`（`@/app/lib/supabase/public`）を使ってください。

## ★ 認可・クライアント使い分けの厳守ルール（最重要）

- **投稿（submitReview）は service_role を絶対に使わないこと。** ユーザーのセッション付き authenticated クライアント（`@/app/lib/supabase/server` の `createClient`）で insert します。これで RLS が効き、なりすまし・status=approved の直接挿入が DB 層で防がれます。
- **承認・却下・削除だけ service_role（`createServiceClient`）を使う。** その前に必ず `assertAdmin` で管理者本人であることを検証してから実行します。
- `therapist_reviews` と `profiles` の間には FK 埋め込み（PostgREST の `profiles(nickname)` 記法）が使えません。**reviews を取得 → user_id を集めて profiles を別クエリで引き、JS 側で nickname をマッピングする2クエリ方式**にしてください（VIPレターの配信対象解決と同じ発想）。nickname が無いユーザーは「ゲスト」と表示します。

---

## 1. ライブラリ層

### 1-1. `src/app/lib/reviews.ts`（新規・公開/共通の読み取り）

- `getApprovedReviews(therapistId: number)`：`createPublicClient` で `therapist_reviews` から `status='approved'` かつ該当 therapist_id の行を `created_at desc` で取得。続けて user_id 一覧で `profiles` を引き、各レビューに `nickname`（無ければ 'ゲスト'）を付与して返す。型 `ApprovedReview = { id, rating, body, created_at, nickname }`。
- `getReviewStats(therapistId: number)`：承認済みのみで件数 `count` と平均 `average`（`numeric` を number に。小数第1位まで、例 4.3。0件なら average=null）を返す。承認済み行の rating を集計すれば十分（件数が少ないため都度集計でよい）。

### 1-2. `src/app/lib/supabase/...` は新規作成不要

既存の `server`（cookie版 `createClient`）・`public`（`createPublicClient`）・`client`（クライアント用 `createClient`）・`service`（`createServiceClient`）をそのまま import して使ってください。

## 2. Server Actions

### 2-1. `src/app/actions/reviews.ts`（新規）

冒頭に `'use server'`。

- `assertAdmin()` ヘルパー（このファイル内 or 既存があれば流用）：`@/app/lib/supabase/server` の `createClient` で `auth.getUser()` し、`user.id === ADMIN_UUID` でなければ throw。VIPレターの `assertOwner` と同じ書き方の管理者版。
- `submitReview({ therapistId, rating, body })`：
  - `createClient`（server/cookie版）で `auth.getUser()`。未ログインなら throw（呼び出し側でログイン誘導済みだが二重防御）。
  - バリデーション：rating が 0.5刻みで 0.5〜5.0 か、body が1〜2000文字か。NG なら throw。
  - **同じ authenticated クライアントで** `therapist_reviews` に insert（`user_id` はログインユーザーの id、`status` は送らず DB default 'pending' に任せる）。service_role は使わない。
  - 成功後、該当セラピストの公開ページを revalidate（後述 4 の revalidate ヘルパーがあれば流用、無ければ `revalidatePath('/therapist/' + therapistId)`）。※承認前は公開ページに出ないので必須ではないが、整合のため呼んでよい。
- `approveReview(reviewId)` / `rejectReview(reviewId)`：
  - 先頭で `await assertAdmin()`。
  - `createServiceClient()` で `therapist_reviews` の該当行の `status` を 'approved'/'rejected' に、`reviewed_at` を now() に update。
  - approve 時はその行の therapist_id を取得し、`/therapist/[id]` を revalidate（承認で公開ページに反映させるため）。
  - reject 時も revalidate してよい（出ていないものが消えるだけ）。
- `deleteReview(reviewId)`：
  - 先頭で `await assertAdmin()`。
  - `createServiceClient()` で該当行を取得（therapist_id を控える）→ delete。
  - 該当 `/therapist/[id]` を revalidate。

いずれの管理系も「assertAdmin を通過した場合のみ service_role を触る」順序を厳守してください。

## 3. 公開側 UI（セラピスト詳細ページ）

### 3-1. `src/app/components/ReviewSummary.tsx`（新規・サーバーコンポーネントでよい）

- props: `average: number | null`, `count: number`。
- 平均★を満星/半星/空星で描画（0.5刻み）。`count` 件、平均値（例「4.3（12件）」）を表示。0件なら「まだ口コミはありません」。

### 3-2. `src/app/components/ReviewList.tsx`（新規・サーバーコンポーネントでよい）

- props: `reviews: ApprovedReview[]`。
- 各レビュー：★（0.5刻み表示）＋ nickname ＋ 投稿日（created_at を `ja-JP` で年月日）＋ body。body は改行を保持（`whitespace-pre-wrap`）。
- 0件なら何も出さない（Summary 側で「まだ口コミはありません」を出すので重複させない）。

### 3-3. `src/app/components/ReviewForm.tsx`（新規・`'use client'`）

- props: `therapistId: number`。
- マウント時に `@/app/lib/supabase/client` の `createClient` で `auth.getUser()` を見て、**未ログインなら投稿フォームを出さず**「口コミの投稿には会員登録が必要です」＋ログイン/登録への導線（`/login` 等、既存の導線に合わせる）を表示。ログイン時のみフォーム表示。
- フォーム：★0.5刻みの星入力（5★・0.5単位。クリックで半星も選べるUI）＋本文 textarea（最大2000字・残り文字数表示があると親切）。HTMLの `<form>` タグは使わず、ボタンの `onClick` で送信。
- 送信時に Server Action `submitReview` を呼ぶ。成功したら「投稿ありがとうございます。運営の承認後に公開されます」と表示し、フォームをクリア。エラー時はエラー文言表示。
- ISR を壊さないよう、データ取得・判定はすべてこのクライアントコンポーネント内で行う（VIPレターアイコンや「今すぐ」修正と同じ方針）。

### 3-4. `src/app/therapist/[id]/page.tsx`（既存・追記のみ）

- ページ下部に口コミセクションを追加。サーバー側で `getReviewStats(id)` と `getApprovedReviews(id)` を呼び、`<ReviewSummary>`・`<ReviewList>` を描画。続けて `<ReviewForm therapistId={id} />` を置く（フォームはクライアントで会員判定）。
- **既存の ISR 構成（generateStaticParams / createPublicClient / revalidate）は維持。** 既存の表示やヘッダー色連動など他要素は触らない。サーバー側の読み取りは `getApprovedReviews`/`getReviewStats`（内部で createPublicClient）なので動的化要因にならないこと。

## 4. revalidate ヘルパー

既存に `revalidateSalon` 等のオンデマンド revalidate ヘルパーがあれば、それに倣って `revalidateTherapist(therapistId)`（`/therapist/[id]` を revalidatePath）を追加し、2-1 の各所から呼んでください。無ければ各 Action 内で直接 `revalidatePath` で構いません。新規にヘルパー基盤を作り込む必要はありません。

## 5. 承認画面 `/moderation`（管理者専用・二層防御）

### 5-1. `src/app/moderation/layout.tsx`（新規）

- **`src/app/admin/layout.tsx` と全く同じ構造のサーバーサイド認可ガード**にしてください。`'use client'` は付けない。`@/app/lib/supabase/server` の `createClient` で `auth.getUser()`、未ログインは `/login` へ、`user.id !== ADMIN_UUID` は `/` へ redirect。コメントだけ「/moderation 配下の口コミ審査用ガード」に変える。URLを分けただけでは防御にならないため、このガードは必須。

### 5-2. `src/app/moderation/page.tsx`（新規・サーバーコンポーネント）

- 未承認（`status='pending'`）のレビューを `created_at desc` で取得して一覧表示。取得は `createServiceClient()`（または server版 createClient で本人=adminなら RLS 上 pending は見えないため、ここは service_role で取得が確実）。pending 行の user_id から profiles の nickname を別クエリで引いて表示。therapist_id から therapists 名も引いて「どのセラピストへの口コミか」を表示。
- 各行に ★・本文・投稿者 nickname・対象セラピスト名・投稿日時を表示し、`<ReviewModeration>`（クライアント）で承認/却下ボタンを出す。

### 5-3. `src/app/moderation/ReviewModeration.tsx`（新規・`'use client'`）

- props: 1件分のレビュー表示用データ＋ `reviewId`。
- 「承認」ボタン→ `approveReview(reviewId)`、「却下」ボタン→ `rejectReview(reviewId)` を呼ぶ。処理中はボタン無効化、完了したらその行を一覧から消す（`router.refresh()` でも可）。
- `<form>` タグは使わず `onClick` で。

### 5-4. ヘッダー導線（任意・軽め）

- 管理者がアクセスしやすいよう、既存の管理導線（/admin への入口があるヘッダー/メニュー）に `/moderation` へのリンクを1つ足す程度でよい。無理に全ヘッダーへ展開しないこと。判断に迷えば導線追加は省略し、URL直打ちで運用する。

## 6. スタイル

- 既存のブランドカラー・カードデザインに馴染ませる（見出しのオレンジ→マゼンタ #FB923C→#DB2777 など既存トーン）。star は既存に星アイコンがあれば流用、無ければ SVG/絵文字で 0.5刻み描画。新しいデザインシステムは作らず既存に合わせる。

## 完了後にやること

- ビルドが通ることを確認（`npm run build` 等、既存の確認手順）。型エラー・lint を解消。
- **コミット・プッシュ・デプロイはしない。** 変更ファイル一覧と、特に「投稿は authenticated クライアント / 承認系は assertAdmin→service_role」の使い分けが守られているかを要約して報告してください。こちらでブラウザ確認・手動デプロイします。