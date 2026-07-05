import { XAuthForm } from '../XAuthForm';

// ログイン状態に依存するため動的レンダリング。
export const dynamic = 'force-dynamic';

// 登録ページのため検索インデックス対象外（noindex,nofollow）。
export const metadata = { robots: { index: false, follow: false } };

export default function XSignupPage() {
  return <XAuthForm initialMode="signup" />;
}
