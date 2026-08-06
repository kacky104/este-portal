import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';

// フクエス本体コラム（/column 配下）の共通シェル。
// 本体の他ページ（エリアページ等）と同じヘッダー構成＋シンプルなフッター。
// metadata の title.template は子セグメント（[slug]・category/[key]）にのみ適用される
// Next 仕様のため、/column トップは page.tsx 側でフルタイトルを明示する（/jobs layout と同方式）。

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
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <div className="flex-1">{children}</div>

      {/* ─── Footer（本体共通・ロゴ＋サイト名つき） ─── */}
      <SiteFooter inner="max-w-5xl" showBrand />
    </div>
  );
}
