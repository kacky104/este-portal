import { XAuthForm } from '../XAuthForm';

// ログイン状態に依存するため動的レンダリング。
export const dynamic = 'force-dynamic';

// 認証ページのため検索インデックス対象外（noindex,nofollow）。
export const metadata = { robots: { index: false, follow: false } };

export default function XLoginPage() {
  return <XAuthForm initialMode="login" />;
}
