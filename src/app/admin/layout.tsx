import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';

// /admin 配下は管理専用のため検索インデックス対象外（noindex,nofollow）。表示（メタ）のみ。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// /admin 配下のサーバーサイド認可ガード（'use client' は付けない＝サーバーコンポーネント）。
// クライアント側（page.tsx の useEffect）の表示制御と合わせた二層防御。
//
// cookie を読むため /admin は動的レンダリングになる（ログイン必須ページなので正しい挙動）。
// 公開ページ（トップ・サロン詳細等の ISR / createPublicClient）には一切影響しない
// ＝このガードは /admin 配下にのみ適用される。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未ログインはログインページへ。
  if (!user) redirect('/login');

  // ログイン済みでも管理者UIDでなければトップへ退避。
  // children をレンダリングする前に弾くため、非管理者には管理UIの内容が一切送られない。
  if (user.id !== ADMIN_UUID) redirect('/');

  return <>{children}</>;
}
