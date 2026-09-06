import Link from "next/link";
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { notFound } from "next/navigation";
import { createPublicClient } from "@/app/lib/supabase/public";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { CouponCard } from "@/app/components/CouponCard";
import type { Metadata } from "next";
import { buildSalonSubpageMetadata } from "../subpageMetadata";
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。詳細は ../subpageMetadata.ts。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return buildSalonSubpageMetadata(id, "coupon", "クーポン");
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  // salons とクーポン一覧は互いに独立なので並列取得。
  const [
    { data: salonRow, error },
    { data: rows },
  ] = await Promise.all([
    supabase
      .from('salons')
      .select('id, name, theme')
      .eq('id', Number(id))
      .single(),
    supabase
      .from('coupons')
      .select('id, title, discount, conditions, valid_until, sort_order, color')
      .eq('salon_id', Number(id))
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

  // 個別サロンページと同じ背景レイヤー（壁紙＋テーマ色オーバーレイ、モバイル対応の固定配置）
  const bgLayerStyle: React.CSSProperties = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  };

  const salonName = (salonRow.name as string) ?? '';

  // 今日（JST）の日付文字列。valid_until が過去のものは非表示（NULL は常に表示）。
  const todayJST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

  const coupons = (rows ?? [])
    .map(r => ({
      id:         String(r.id),
      title:      (r.title as string) ?? '',
      discount:   (r.discount as string) ?? '',
      conditions: (r.conditions as string | null) ?? '',
      validUntil: (r.valid_until as string | null) ?? null,
      color:      (r.color as string | null) ?? null,
    }))
    .filter(c => c.validUntil == null || c.validUntil >= todayJST);

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 背景レイヤー（個別サロンページと同じテーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2"><SavedSalonsMenu /><VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu /></div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › クーポン ─── */}
        {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
          { name: 'トップ', path: '/' },
          { name: salonName || '店舗', path: `/salon/${id}` },
          { name: 'クーポン', path: `/salon/${id}/coupon` },
        ])) }} />
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || '店舗'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>クーポン</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          {/* h1 は「店名＋このページの内容」で1ページ1本にする（従来は全サブページが店名だけで同一だった）。
              見た目は変えないため、店名と副題を h1 内の block span 2つに分けている。 */}
          <h1>
            <span className="block font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
              {salonName}
            </span>
            <span className="block text-sm mt-1 font-normal" style={{ color: theme.body }}>クーポン</span>
          </h1>
        </div>

        {/* クーポン一覧（案B：グラデ見出し型・縦に並べる） */}
        {coupons.length === 0 ? (
          <div className="text-center py-12 text-sm rounded-2xl border" style={{ color: theme.body, backgroundColor: theme.card, borderColor: theme.cardBorder }}>
            現在ご利用いただけるクーポンはありません
          </div>
        ) : (
          <div className="flex flex-col gap-5 max-w-xl mx-auto">
            {/* ★ 券の見た目は src/app/components/CouponCard.tsx が唯一の正（2026-09-06）。
                ★ /mypage の入力画面のプレビューも同じ部品を使う＝本物とずれない。 */}
            {coupons.map(c => (
              <CouponCard
                key={c.id}
                title={c.title}
                discount={c.discount}
                conditions={c.conditions}
                validUntil={c.validUntil}
                color={c.color}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
