import { Suspense } from "react";
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
import { getSalonApprovedReviews } from "@/app/lib/reviews";
import { ReviewList } from "@/app/components/ReviewList";
import { PaginatedReviewList } from "@/app/components/PaginatedReviewList";
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
  return buildSalonSubpageMetadata(id, "reviews", "口コミ");
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  // salons と口コミ一覧は互いに独立なので並列取得（読み取りは cookieレス匿名＝ISR維持）。
  const [
    { data: salonRow, error },
    reviews,
  ] = await Promise.all([
    supabase
      .from('salons')
      .select('id, name, theme, address')
      .eq('id', Number(id))
      .single(),
    getSalonApprovedReviews(Number(id)),
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

  // Review 構造化データ（2026-08-06）。itemReviewed は店舗（HealthAndBeautyBusiness＝Google の
  // レビュースニペット対応タイプ）。※セラピスト個人（Person）は対象外のため、口コミの構造化
  // データは店舗単位のこのページにのみ出す方針（/therapist/[id]/reviews には出さない）。
  // - aggregateRating はこのページに表示している承認済み口コミ全件から算出（画面と同一データ）。
  // - review は初期HTMLに表示される1ページ目（20件）に合わせる。
  const reviewsJsonLd = reviews.length > 0
    ? {
        '@context': 'https://schema.org/',
        '@type': 'HealthAndBeautyBusiness',
        '@id': `https://fukues.com/salon/${id}#business`,
        name: salonName,
        url: `https://fukues.com/salon/${id}`,
        ...(salonRow.address
          ? {
              address: {
                '@type': 'PostalAddress',
                streetAddress: salonRow.address as string,
                addressRegion: '福岡県',
                addressCountry: 'JP',
              },
            }
          : {}),
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: Number((reviews.reduce((a, r) => a + r.overall, 0) / reviews.length).toFixed(1)),
          reviewCount: reviews.length,
          bestRating: 5,
          worstRating: 1,
        },
        review: reviews.slice(0, 20).map((r) => ({
          '@type': 'Review',
          author: { '@type': 'Person', name: r.nickname },
          ...(r.createdAt ? { datePublished: r.createdAt.slice(0, 10) } : {}),
          reviewBody: r.body,
          reviewRating: { '@type': 'Rating', ratingValue: r.overall, bestRating: 5, worstRating: 1 },
        })),
      }
    : null;

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

        {/* Review 構造化データ（店舗への口コミ＋★集計。0件なら出さない） */}
        {reviewsJsonLd && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(reviewsJsonLd) }} />
        )}
        {/* ─── パンくずリスト：トップ › サロン名 › 口コミ ─── */}
        {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
          { name: 'トップ', path: '/' },
          { name: salonName || '店舗', path: `/salon/${id}` },
          { name: '口コミ', path: `/salon/${id}/reviews` },
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
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>口コミ</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          {/* h1 は「店名＋このページの内容」で1ページ1本にする（従来は全サブページが店名だけで同一だった）。
              見た目は変えないため、店名と副題を h1 内の block span 2つに分けている。 */}
          <h1>
            <span className="block font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
              {salonName}
            </span>
            <span className="block text-sm mt-1 font-normal" style={{ color: theme.body }}>口コミ</span>
          </h1>
        </div>

        {/* 口コミ一覧 */}
        {reviews.length === 0 ? (
          <div className="text-center py-12 text-sm rounded-2xl border" style={{ color: theme.body, backgroundColor: theme.card, borderColor: theme.cardBorder }}>
            口コミはまだありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            {/* 口コミは白いカードの中に表示（セラピスト詳細と同じ体裁）。
                テーマ色カードだと黒テーマで slate 系の文字が沈むため、ここだけ白固定にする。
                一覧はページネーション（20件/ページ・URL同期）。ページ番号読み取りはクライアント側のみ＝ISR維持。
                useSearchParams のため Suspense でラップ。 */}
            <Suspense fallback={<ReviewList reviews={reviews.slice(0, 20)} />}>
              <PaginatedReviewList reviews={reviews} pageSize={20} />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}
