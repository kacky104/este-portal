import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// ★★★ メンズエステ用語集（/glossary 配下）の共通シェル（第353便d・2026-09-13・カッキーさんの指示）
//
// ★★ なぜ要るか: 第349便で /glossary を作ったとき layout を置かなかったので、用語集にだけ
//   【サイト共通のヘッダーとフッターが無い】状態だった（根本の layout.tsx にヘッダー・フッターは無く、
//   /column は自分の layout.tsx で足している）。読者が他のページへ回れず、内部リンクも弱かった。
//   ★ この layout は /column/layout.tsx と同じ形。ヘッダーの中身・フッターの呼び方も合わせてある。
//
// ★ 背景は【ゴールドテーマ＋テーマ壁紙】（theme_wallpapers の gold）。
//   /column（ホワイト）・/salons（シルバー）と同じ作法で、壁紙の上に theme.bg の85%不透明（D9）を
//   重ねて本文の可読性を保つ。★ 壁紙の取得はこの layout で1回だけ。配下（ハブ・各用語）に効く。
//   ★ 壁紙が未設定（theme_wallpapers に gold の行が無い）なら、ゴールドの地色だけになる。
//
// ★★ metadata は【書かない】。title の template を足すと、子セグメント（/glossary/[slug]）の
//   「〜｜フクエス」に もう1つ「｜フクエス」が付いて二重になる。★ タイトルは各 page.tsx が
//   フルタイトルで持っている（第349便からの作り）ので、ここでは触らない。

// ISR：10分（/column と同じ周期）。★ theme_wallpapers を読むためのもの。
export const revalidate = 600;

export default async function GlossaryLayout({ children }: { children: React.ReactNode }) {
  const theme = getTheme('gold');
  const wallpapers = await fetchThemeWallpapers();
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgStyle = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
        }
      : {}),
  };

  return (
    <div className="min-h-screen text-slate-900 flex flex-col" style={bgStyle}>
      {/* ─── Header（本体共通構成・/column と同じ） ─── */}
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
