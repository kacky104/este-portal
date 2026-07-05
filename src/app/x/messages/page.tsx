import { XMessages } from '../XMessages';

// DMは本人依存・非公開。取得はすべて XMessages（クライアント・ログインクライアント＝RLSで自分の会話のみ）が行う。
// 本人専用のDM（非公開）のため検索インデックス対象外（noindex,nofollow）。
export const metadata = { title: 'メッセージ｜fukuX', robots: { index: false, follow: false } };

export default function XMessagesPage() {
  return <XMessages />;
}
