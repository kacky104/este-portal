import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createClient } from '@/app/lib/supabase/server';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { getNotificationFeed } from '@/app/lib/notifications';
import { MarkNotificationsRead } from './MarkNotificationsRead';

// 会員個別の内容（ログイン必須）のため ISR はかけず動的のままにする。
export const dynamic = 'force-dynamic';

// 日時表示（JST・"6月20日 19:12"）。
function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export default async function NotificationsPage() {
  const supabase = await createClient();

  // ── ログインガード（サーバー側） ──
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/member/notifications');

  // ── 新着フィードを取得（認証済みクライアント・RLS尊重）。表示後に既読化する。 ──
  const { items } = await getNotificationFeed(supabase);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* 表示の後に既読化（last_checked_at を now() に更新） */}
      <MarkNotificationsRead />

      {/* ─── Header（共通ヘッダーを流用） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-10">

        {/* パンくず */}
        <nav className="flex items-center gap-1.5 text-[13px] text-slate-400 mb-6" aria-label="パンくずリスト">
          <Link href="/member" className="hover:text-pink-600 transition-colors">マイページ</Link>
          <span className="text-slate-300">›</span>
          <span className="text-slate-600 font-medium">お知らせ・新着</span>
        </nav>

        {/* 見出し */}
        <h1
          className="text-2xl font-bold leading-tight inline-block mb-8"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
        >
          お知らせ・新着
        </h1>

        {items.length === 0 ? (
          <p className="text-sm text-slate-400 py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
            新着はありません
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map(item => {
              const isCoupon = item.type === 'coupon';
              const accent = isCoupon ? '#DB2777' : '#A855F7';
              const typeLabel = isCoupon ? 'クーポン' : 'お知らせ';
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={`block rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-all ${
                      item.isUnread ? 'border-pink-200 bg-pink-50/40' : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="flex-shrink-0 text-[10px] font-bold text-white rounded-full px-2 py-0.5"
                        style={{ background: accent }}
                      >
                        {typeLabel}
                      </span>
                      {item.isUnread && (
                        <span className="flex-shrink-0 text-[10px] font-bold text-pink-600 border border-pink-300 rounded-full px-1.5 py-px">
                          NEW
                        </span>
                      )}
                      <span className="text-xs text-slate-400 line-clamp-1">{item.salonName}</span>
                      <span className="ml-auto flex-shrink-0 text-[11px] text-slate-400">{formatAt(item.at)}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700 line-clamp-2">{item.title}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
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
