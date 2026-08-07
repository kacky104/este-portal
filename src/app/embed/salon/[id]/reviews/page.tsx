import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { getSalonApprovedReviews, getSalonReviewStats } from '@/app/lib/reviews';
import { EMBED_SITE_URL, EmbedFooter } from '../embedShared';
import type { Metadata } from 'next';

// 契約店舗の公式サイトに iframe で貼る「口コミ」埋め込みウィジェット（2026-08-06 新設）。
//
// - 承認済み口コミの新着3件＋店舗の平均評価。クリック（カード全体・もっと見る）で
//   フクエスの口コミ一覧（/salon/[id]/reviews）を新しいタブで開く。
// - 白基調ニュートラル・軽量（詳細は diary 側と embedShared.tsx のコメント参照）。
// - 数字・表示内容は本体の /salon/[id]/reviews と同じ取得関数（lib/reviews.ts）を使い、
//   本体とズレないようにする。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const MAX_REVIEWS = 3;
// 本文の表示上限（3行クランプの補助。iframe の高さを予測しやすくするため文字数でも切る）。
const MAX_BODY_LEN = 90;

/** ★を5個並べる（0.5刻みは四捨五入で近似・埋め込み用の簡易表示）。 */
function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span aria-label={`5点満点中${value}点`} className="text-amber-400 text-[13px] leading-none tracking-tight">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= filled ? '' : 'text-slate-200'}>
          ★
        </span>
      ))}
    </span>
  );
}

export default async function EmbedSalonReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const salonId = Number(id);
  if (!Number.isFinite(salonId)) notFound();

  const supabase = createPublicClient();
  const { data: salon } = await supabase
    .from('salons')
    .select('id, name, is_hidden')
    .eq('id', salonId)
    .maybeSingle();
  if (!salon || salon.is_hidden) notFound();

  const [reviews, stats] = await Promise.all([
    getSalonApprovedReviews(salonId),
    getSalonReviewStats(salonId),
  ]);
  const top = reviews.slice(0, MAX_REVIEWS);
  const reviewsUrl = `${EMBED_SITE_URL}/salon/${salonId}/reviews`;

  return (
    <div className="bg-white p-4 font-sans">
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <p className="text-[13px] font-bold text-slate-700">口コミ</p>
        {stats.avgOverall != null && (
          <span className="flex items-center gap-1">
            <Stars value={stats.avgOverall} />
            <span className="text-[12px] font-bold text-slate-600">{stats.avgOverall.toFixed(1)}</span>
            <span className="text-[11px] text-slate-400">（{stats.count}件）</span>
          </span>
        )}
      </div>

      {top.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-400">口コミはまだありません</p>
      ) : (
        <div className="space-y-2">
          {top.map((r) => {
            const body = r.body.length > MAX_BODY_LEN ? `${r.body.slice(0, MAX_BODY_LEN)}…` : r.body;
            return (
              <a
                key={r.id}
                href={reviewsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 hover:border-pink-200 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Stars value={r.overall} />
                  <span className="text-[12px] font-bold text-slate-600">{r.overall.toFixed(1)}</span>
                  <span className="text-[11px] text-slate-400">
                    {r.nickname} さん
                    {r.therapistName ? ` → ${r.therapistName}さん` : ''}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-600 line-clamp-3">{body}</p>
              </a>
            );
          })}
        </div>
      )}

      <EmbedFooter moreHref={reviewsUrl} moreLabel="口コミをもっと見る" />
    </div>
  );
}
