import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { createPublicClient } from '@/app/lib/supabase/public';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { getReviewStats, getApprovedReviews } from '@/app/lib/reviews';
import { ReviewSummary } from '@/app/components/ReviewSummary';
import { ReviewList } from '@/app/components/ReviewList';
import { PaginatedReviewList } from '@/app/components/PaginatedReviewList';

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function TherapistReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const therapistId = Number(id);

  const supabase = createPublicClient();

  // セラピスト本体（無ければ 404）。
  const { data: tRow, error: tError } = await supabase
    .from('therapists')
    .select('id, name, salon_id')
    .eq('id', id)
    .single();
  if (tError || !tRow) notFound();

  const salonId = tRow.salon_id as number;
  const therapistName = (tRow.name as string) ?? '';

  // 所属サロン（テーマ連動の背景・パンくず用）と口コミ集計/一覧を並列取得。
  const [{ data: salonRow }, reviewStats, reviews] = await Promise.all([
    supabase.from('salons').select('id, name, theme').eq('id', salonId).single(),
    getReviewStats(therapistId),
    getApprovedReviews(therapistId),
  ]);

  // 所属サロンと同じテーマ壁紙を背景に適用。
  const theme = getTheme((salonRow?.theme as string | null) ?? null);
  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

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

  const salonName = (salonRow?.name as string) ?? 'サロン';

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 背景レイヤー（所属サロンと同じテーマ壁紙＋色オーバーレイ）— モバイル対応のため固定配置 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header（所属サロンのテーマ色と連動） ─── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくず：トップ › サロン名 › セラピスト名 › 口コミ ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${salonId}`} className="hover:opacity-80 transition-opacity inline-block max-w-[30%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/therapist/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[30%] truncate align-middle" style={{ color: '#ec4899' }}>
            {therapistName}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>口コミ</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {therapistName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>口コミ</p>
        </div>

        {/* 集計サマリ＋全口コミ一覧（白カード・セラピスト詳細と同体裁） */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex justify-end">
            <Link
              href={`/salon/${salonId}/review/new`}
              className="inline-block text-sm font-bold text-white px-4 py-2 rounded-xl shadow-sm flex-shrink-0"
              style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
            >
              口コミを書く
            </Link>
          </div>
          <ReviewSummary stats={reviewStats} />
          {/* 一覧はページネーション（20件/ページ・URL同期）。ページ番号読み取りはクライアント側のみ。
              useSearchParams のため Suspense でラップ（ISR を維持）。 */}
          <Suspense fallback={<ReviewList reviews={reviews.slice(0, 20)} />}>
            <PaginatedReviewList reviews={reviews} pageSize={20} />
          </Suspense>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
