フクエスの口コミ審査画面 /moderation に「承認済み口コミ一覧」と削除ボタンを追加します。削除用の Server Action deleteReview(reviewId) はすでに src/app/actions/reviews.ts に実装済み（assertAdmin → service_role で delete → revalidate）なので、新たに作らず再利用します。

このタスクは認証（管理者専用画面）＋ service_role 経由の削除に関わるため、**作業が終わっても自動デプロイしないでください。Stop hook での自動コミットもしないでください。** コミット・プッシュ・デプロイはこちらが確認してから手動で行います。本番を curl で検証する必要はありません。確認はブラウザでこちらがやります。

## 背景（現状）
- /moderation は現在 status='pending' のみを表示し、承認/却下ボタンを出している。
- 承認済み（approved）の口コミを画面から消す導線が無く、誤承認したものを削除できない。
- deleteReview(reviewId) は実装済みだが、それを呼ぶUIが無いだけ。これを承認済み一覧に付ける。

## 変更するファイルは2つだけ

### 1. src/app/moderation/ReviewModeration.tsx（追記）

このファイルに、承認済み口コミ1件を表示して「削除」ボタンを出すクライアントコンポーネントを新規に追加（既存の ReviewModeration はそのまま残す）。既存の流儀（'use client'・onClick で Server Action・処理中 busy 無効化・完了で hidden＋router.refresh()・error表示・Stars/日付フォーマット）をそっくり踏襲すること。

- 先頭の import に `deleteReview` を追加：`import { approveReview, rejectReview, deleteReview } from '@/app/actions/reviews';`
- 既存の `formatJaDateTime` と型 `PendingReviewView` はそのまま流用（同じ形なので）。承認済み表示用に同形の型エイリアスを使ってよい：`export type ApprovedReviewView = PendingReviewView;`（reviewId/rating/body/nickname/therapistName/createdAt を持つ）。
- 新規エクスポート関数 `ApprovedReviewModeration` を追加。中身は既存 ReviewModeration をベースに以下だけ変える：
  - 「対象」バッジ・★・nickname・投稿日時・本文の表示部分は既存と同じデザインを流用。ただし上部の状態バッジは「対象」に加えて、ピンクではなく緑系の小バッジで「公開中」を表示しておくと審査中(pending)と見分けやすい（任意・既存トーンに合わせる）。
  - ボタン部分は「承認/却下」ではなく**「削除」ボタン1つ**にする。
  - **削除は取り返しがつかないため、onClick で必ず `window.confirm('この口コミを完全に削除します。元に戻せません。よろしいですか？')` を出し、true のときだけ `deleteReview(reviewId)` を呼ぶ**。false ならなにもしない。
  - 削除ボタンの見た目：危険操作なので赤系。例：`className="px-5 py-2 rounded-xl bg-rose-600 text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-opacity hover:bg-rose-700"`。処理中は「削除中...」表示・disabled。
  - 成功したら既存同様 `setHidden(true)` ＋ `router.refresh()`。失敗時は既存同様 error 表示＋ busy 解除。
  - グラデの承認ボタン等は付けない（このコンポーネントは削除専用）。

### 2. src/app/moderation/page.tsx（追記）

既存の pending 取得・表示はそのまま残し、その下に「承認済み口コミ一覧」セクションを追加する。取得・マッピングは既存の pending と同じ要領（service_role・nickname/therapist 名を別クエリ解決）。

- import に承認済み用コンポーネントと型を追加：`import { ReviewModeration, ApprovedReviewModeration, type PendingReviewView, type ApprovedReviewView } from './ReviewModeration';`
- pending 取得の後に、承認済み取得を追加（同じ svc を再利用）：
  ```ts
  const { data: approvedRows } = await svc
    .from('therapist_reviews')
    .select('id, therapist_id, user_id, rating, body, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  const approved = approvedRows ?? [];
  ```
- nickname/therapist 名のマッピングは、**pending と approved の両方の user_id / therapist_id をまとめて1回ずつ引く**形に変えると効率的（既存の userIds / therapistIds の収集元に approved も含める）。既存の nameMap / therapistMap 構築ロジックを流用し、収集対象を `[...pending, ...approved]` にするだけ。クエリ回数は profiles 1回・therapists 1回のまま増やさない。
- approved を `ApprovedReviewView[]`（＝PendingReviewView と同形）に map（既存 views と同じ変換）。変数名は `approvedViews` 等。
- JSX：既存の「口コミ審査（未承認一覧）」セクションの下に、新しい見出しブロックで「承認済みの口コミ」セクションを追加。見出しは既存と同デザイン（左の縦グラデ棒＋太字見出し）を流用し、文言は「承認済みの口コミ」、サブテキストは「公開中 {approvedViews.length} 件。削除すると公開ページから消えます（元に戻せません）。」など。
  - 0件なら「公開中の口コミはありません。」のプレースホルダ（既存の空表示カードと同デザイン）。
  - 1件以上なら `approvedViews.map((v) => <ApprovedReviewModeration key={v.reviewId} {...v} />)` を `space-y-4` で並べる。
- ページ全体のレイアウト・ヘッダー（Logo・管理トップリンク）・コンテナ幅（max-w-3xl）は既存のまま。

## 確認事項・厳守
- 取得は引き続き service_role（pending も approved も RLS では admin から見えない/絞れないため既存同様 svc を使用）。削除は既存 deleteReview 内で assertAdmin→service_role が効くので、UI側で追加の認可は不要（ただし confirm は必須）。
- /moderation/layout.tsx の二層防御（admin と同構造のサーバーガード）は既にあるので触らない。
- deleteReview / approveReview / rejectReview など actions/reviews.ts は変更しない（再利用のみ）。
- ISR構成・公開ページ（/therapist/[id] 等）は触らない。削除時の公開ページ反映は deleteReview 内の revalidatePath に任せる。
- export const dynamic = 'force-dynamic' は既存のまま維持。

## 完了後
- npm run build が通ること・型/lint エラー0 を確認。
- **コミット・プッシュ・デプロイはしない。** 変更した2ファイルの要約（特に「削除ボタンに confirm を入れたか」「承認済み取得が service_role か」「クエリ回数を増やしていないか」）を報告して止まること。ブラウザ確認・手動デプロイはこちらでやります。