import { XAuthForm } from '../XAuthForm';

// ログイン状態に依存するため動的レンダリング。
export const dynamic = 'force-dynamic';

export default function XLoginPage() {
  return <XAuthForm initialMode="login" />;
}
