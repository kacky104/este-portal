import { XMessages } from '../XMessages';

// DMは本人依存・非公開。取得はすべて XMessages（クライアント・ログインクライアント＝RLSで自分の会話のみ）が行う。
export const metadata = { title: 'メッセージ｜fukuX' };

export default function XMessagesPage() {
  return <XMessages />;
}
