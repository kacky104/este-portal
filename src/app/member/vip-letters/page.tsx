import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createClient } from '@/app/lib/supabase/server';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { getMemberVipLetters } from '@/app/lib/vipLetters';
import { getNotificationFeed } from '@/app/lib/notifications';
import { MarkNotificationsRead } from '../notifications/MarkNotificationsRead';
import { NotificationFeedList } from '../notifications/NotificationFeedList';
import { VipLetterList } from './VipLetterList';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';

// 会員個別の内容（ログイン必須）のため ISR はかけず動的のままにする。
export const dynamic = 'force-dynamic';

export default async function VipLettersPage() {
  const supabase = await createClient();

  // ── ログインガード（サーバー側） ──
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/member/vip-letters');

  // ── ニックネーム未設定なら設定へ誘導（必須化） ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.nickname || profile.nickname.trim() === '') {
    redirect('/member/profile');
  }

  // 自分宛のVIPレター（RLS：本人が recipient のもののみ）。
  // ★ 読めなかったときは理由を持ち帰る（★ 「0件」と混ぜない・第179便）
  // ★ 第1581便: お知らせ・新着（保存店のクーポン・お知らせ）も同じページに出す。表示後に既読化する。
  const [{ letters, error: lettersError }, feed] = await Promise.all([
    getMemberVipLetters(supabase),
    getNotificationFeed(supabase, user),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* 表示の後に、お知らせ・新着を既読化（last_checked_at を now() に更新） */}
      <MarkNotificationsRead />

      {/* ─── Header（共通ヘッダーを流用） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-2.5">
            <SavedSalonsMenu />
            <VipLetterIcon />
            <AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-10">

        {/* パンくず */}
        <nav className="flex items-center gap-1.5 text-[13px] text-slate-400 mb-3" aria-label="パンくずリスト">
          <Link href="/member" className="hover:text-pink-600 transition-colors">マイページ</Link>
          <span className="text-slate-300">›</span>
          <span className="text-slate-600 font-medium">VIPレター・お知らせ</span>
        </nav>

        {/* 見出し */}
        <h1
          className="text-2xl font-bold leading-tight inline-block mb-2"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
        >
          VIPレター・お知らせ
        </h1>
        <p className="text-xs text-slate-400 mb-8">保存しているお店から届いた特別なメッセージと、新着のクーポン・お知らせ</p>

        <section aria-labelledby="vip-letters-heading">
          <h2 id="vip-letters-heading" className="text-base font-bold text-slate-700 mb-3">VIPレター</h2>
          <VipLetterList letters={letters} error={lettersError} />
        </section>

        <section id="notifications" aria-labelledby="notifications-heading" className="mt-10 scroll-mt-20">
          <h2 id="notifications-heading" className="text-base font-bold text-slate-700 mb-3">お知らせ・新着</h2>
          <NotificationFeedList items={feed.items} cappedSalons={feed.cappedSalons} />
        </section>
      </main>

      {/* ─── Footer ─── */}
      <SiteFooter inner="max-w-5xl" />
    </div>
  );
}
