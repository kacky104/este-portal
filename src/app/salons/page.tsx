import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchAllRows } from '@/app/lib/fetchAllRows';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { AREA_ORDER } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { TelNoticeLink } from '@/app/components/TelNoticeLink';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';

// /salons は無料掲載枠も兼ねるため、店名・地域・電話番号のみのテキスト一覧にしている（カード表示は廃止）。
// 行は「掲載中サロン（salons テーブル・自動）＋無料掲載枠（free_salon_listings・/admin から手入力）」の統合。
// 掲載中サロンは店名→詳細ページ・電話→tel: リンク、無料掲載枠は純テキストのみ。

const PAGE_TITLE = '福岡のメンズエステ店一覧【フクエス】';
const PAGE_DESC =
  '福岡のメンズエステを一覧掲載。博多・天神・北九州・久留米など全エリアの店舗を店名・地域・電話番号でシンプルにまとめています。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/salons' },
  // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
  // （og:image も消える）。そのため siteName/type/images まで全て明示する。
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: '/salons',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title: PAGE_TITLE, description: PAGE_DESC, images: ['/ogp.png'] },
};

// ISR：10分ごとに再生成。従来は cookies() を読む createClient を使っていたためリクエストごとの
// 動的レンダリングになっていた（この一覧はログイン状態で出し分けない＝ISR で問題ない）。
export const revalidate = 600;

type ListRow = {
  key: string;
  name: string;
  area: string;
  phone: string;
  website: string;       // 公式ホームページURL（掲載中= salons.official_url／無料枠= website_url）。空は非表示。
  href: string | null;   // 掲載中サロンは /salon/<id>、無料掲載枠は null（テキストのみ）
  displayOrder: number;  // 無料掲載枠のみ使用（/admin の並び順）
};

// 地域の表示順（AREA_ORDER）。未知の値は末尾へ。
const areaIndex = (a: string) => {
  const i = (AREA_ORDER as readonly string[]).indexOf(a);
  return i < 0 ? AREA_ORDER.length : i;
};

export default async function SalonsPage() {
  // cookie を読まない匿名クライアント（ISR を効かせるため。公開データ専用）。
  // salons / free_salon_listings はどちらも anon の公開SELECTポリシーで読める。
  const supabase = createPublicClient();

  // 掲載中サロンと無料掲載枠を並列取得。
  // free_salon_listings はマイグレーション未適用でもページを壊さない（エラー時は空扱い）。
  // ※「全店舗一覧」なので PostgREST 既定の1000件打ち切りに当たらないよう fetchAllRows で全件ページングする。
  const [salonRows, freeRows, hero, wallpapers, adBanners] = await Promise.all([
    fetchAllRows<{ id: number; name: string | null; area: string | null; phone: string | null; official_url: string | null }>(
      (from, to) =>
        supabase.from('salons').select('id, name, area, phone, official_url').eq('is_hidden', false).order('id').range(from, to),
    ),
    fetchAllRows<{ id: number; name: string | null; area: string | null; phone: string | null; website_url: string | null; display_order: number | null }>(
      (from, to) =>
        supabase
          .from('free_salon_listings')
          .select('id, name, area, phone, website_url, display_order')
          .eq('is_active', true)
          .order('id')
          .range(from, to),
    ),
    // ページ別ヒーロー画像（admin「ページ別ヒーロー画像設定」の「掲載店舗一覧」。未設定なら非表示）。
    fetchPageHero('salons'),
    // シルバーテーマ壁紙（/reviews・/therapists と同方式で固定レイヤーに敷く）。
    fetchThemeWallpapers(),
    // ルックバナー（ad_banners・公開中からランダム1枚）。一覧ブロックの上下に1枠ずつ表示。
    fetchActiveAdBanners(),
  ]);

  // シルバーテーマの配色＋壁紙。壁紙は theme.bg の85%不透明を重ねて文字の可読性を保つ（/reviews と同係数 D9）。
  const theme = getTheme('silver');
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

  const listed: ListRow[] = salonRows.map((r) => ({
    key: `s-${r.id}`,
    name: (r.name as string) ?? '',
    area: (r.area as string) ?? '',
    phone: (r.phone as string) ?? '',
    website: (r.official_url as string) ?? '',
    href: `/salon/${r.id}`,
    displayOrder: 0,
  }));
  const free: ListRow[] = freeRows.map((r) => ({
    key: `f-${r.id}`,
    name: (r.name as string) ?? '',
    area: (r.area as string) ?? '',
    phone: (r.phone as string) ?? '',
    website: (r.website_url as string) ?? '',
    href: null,
    displayOrder: (r.display_order as number) ?? 0,
  }));

  // 並び：地域（AREA_ORDER）→ 掲載中サロン（名前順）→ 無料掲載枠（/admin の並び順）のフラット1列。
  const rows = [...listed, ...free].sort((a, b) => {
    const ai = areaIndex(a.area);
    const bi = areaIndex(b.area);
    if (ai !== bi) return ai - bi;
    const ak = a.href ? 0 : 1;
    const bk = b.href ? 0 : 1;
    if (ak !== bk) return ak - bk;
    if (ak === 0) return a.name.localeCompare(b.name, 'ja');
    return a.displayOrder - b.displayOrder;
  });

  return (
    <div className="min-h-screen text-slate-900">
      {/* 背景：silver テーマ壁紙を固定レイヤーで敷く（/reviews・/therapists と同方式）。 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
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

      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* Back link */}
        <Breadcrumb current="福岡のメンズエステ店一覧" currentColor={breadcrumbCurrentColor(theme.key)} />

        {/* ヒーロー画像（admin「ページ別ヒーロー画像設定」→「掲載店舗一覧」。未設定なら非表示） */}
        <PageHero url={hero} alt="福岡のメンズエステ店一覧" fullBleedMobile />

        {/* Heading：シルバーの壁紙背景に直接（/reviews・/therapists と同方式の神秘的レイアウト）。
            h1 に主要KW「福岡メンズエステ」を含める（/reviews・/diary・/x-shops と同方針）。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-slate-400">FUKUES SALON LIST</p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-black tracking-[0.06em] bg-gradient-to-r from-slate-600 via-gray-400 to-slate-600 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(148,163,184,0.35)]">
            福岡のメンズエステ店一覧
          </h1>
          <p className="mt-2 text-xs text-slate-500">全{rows.length}件</p>
        </div>

        {/* ルックバナー（一覧ブロックの上）。公開中からランダム1枚・ページを開くたびに入れ替わり。 */}
        <AdBanner banners={adBanners} />

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-16">掲載店舗はまだありません</p>
        ) : (
          <ul className="bg-white/90 border rounded-2xl px-4 sm:px-6 divide-y" style={{ borderColor: theme.cardBorder }}>
            {rows.map((r) => (
              <li key={r.key} className="py-2.5 text-sm border-[#e3e6eb]">
                {/* 1行目：店名（掲載中サロンは詳細ページへリンク） */}
                {r.href ? (
                  <Link href={r.href} className="font-bold text-pink-600 hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  <span className="font-bold text-slate-800">{r.name}</span>
                )}
                {/* 2行目：3分割（左=地域／中=電話（tel:発信）／右=公式ホームページ） */}
                <div className="mt-1 grid grid-cols-3 gap-2 items-center text-xs">
                  <span className="text-slate-500 truncate">{areaLabel(r.area)}</span>
                  <span className="text-center truncate">
                    {r.phone && (
                      <TelNoticeLink phone={r.phone} className="text-slate-600 hover:underline">
                        {r.phone}
                      </TelNoticeLink>
                    )}
                  </span>
                  <span className="text-right truncate">
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        公式ホームページ
                      </a>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ルックバナー（一覧ブロックの下）。上の枠とは独立にランダム抽選（枚数が少ないと同じ枠になることもある）。 */}
        <AdBanner banners={adBanners} />
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t bg-white/90 py-6 mt-12" style={{ borderColor: theme.cardBorder }}>
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
