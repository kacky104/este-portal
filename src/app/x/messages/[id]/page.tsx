import { XThread } from '../../XThread';

// 会話スレッド。中身は非公開＝XThread（クライアント・ログインクライアント）が取得。
// RLS により自分が参加者でない会話IDを開いても 0 件＝中身は出ない（他人の会話に入れない）。
// 本人専用のDMスレッド（非公開）のため検索インデックス対象外（noindex,nofollow）。
export const metadata = { title: 'メッセージ｜fukuX', robots: { index: false, follow: false } };

export default async function XThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <XThread conversationId={id} />;
}
