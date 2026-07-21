import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';

// フクエス本体コラム（/column 配下）の共通シェル。
// 本体の他ページ（エリアページ等）と同じヘッダー構成＋シンプルなフッター。
// metadata の title.template は子セグメント（[slug]・category/[key]）にのみ適用される
// Next 仕様のため、/column トップは page.tsx 側でフルタイトルを明示する（/jobs layout と同方式）。

const SITE_URL = 'https://fukues.com';

export const metadata: Metadata = {
  title: {
    default: 'メンズエステコラム｜フクエス',
    template: '%s｜フクエス',
  },
};

export default function ColumnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ─── Header（本体共通構成） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-slate-400">© 2026 フクエス. All rights reserved.</p>
          <p className="text-xs text-slate-400">
            <a href={SITE_URL} className="font-medium text-pink-600 hover:opacity-80 transition-opacity">
              フクエス（福岡メンズエステポータル）
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
