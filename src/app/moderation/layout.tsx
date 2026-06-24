import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { MODERATOR_UUIDS } from '@/app/lib/admin';

// /moderation 配下の口コミ審査用ガード（'use client' は付けない＝サーバーコンポーネント）。
// admin/layout.tsx と全く同じ構造のサーバーサイド認可ガード。
// URLを分けただけでは防御にならないため、このガードは必須。
//
// cookie を読むため /moderation は動的レンダリングになる（ログイン必須ページなので正しい挙動）。
// 公開ページ（トップ・セラピスト詳細等の ISR / createPublicClient）には一切影響しない。
export default async function ModerationLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未ログインはログインページへ。
  if (!user) redirect('/login');

  // ログイン済みでもモデレーター許可リストに含まれなければトップへ退避。
  // children をレンダリングする前に弾くため、許可外には審査UIの内容が一切送られない。
  if (!MODERATOR_UUIDS.includes(user.id)) redirect('/');

  return <>{children}</>;
}
