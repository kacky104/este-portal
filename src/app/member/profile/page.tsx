import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { ProfileForm } from './ProfileForm';

// 会員個別の内容（ログイン必須）のため ISR はかけず動的のままにする。
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();

  // ── ログインガード（サーバー側） ──
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/member/profile');

  // ── 本人の profiles 行を取得（RLS が効いた認証済みクライアントで）。無ければ空欄。 ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', user.id)
    .maybeSingle();

  const initialNickname = (profile?.nickname as string | null) ?? '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header（共通ヘッダーを流用） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8 sm:py-10">

        {/* パンくず */}
        <nav className="flex items-center gap-1.5 text-[13px] text-slate-400 mb-6" aria-label="パンくずリスト">
          <Link href="/member" className="hover:text-pink-600 transition-colors">マイページ</Link>
          <span className="text-slate-300">›</span>
          <span className="text-slate-600 font-medium">プロフィール編集</span>
        </nav>

        {/* 見出し */}
        <h1
          className="text-2xl font-bold leading-tight inline-block mb-6"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
        >
          プロフィール編集
        </h1>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6 shadow-sm">
          <ProfileForm userId={user.id} initialNickname={initialNickname} />
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
