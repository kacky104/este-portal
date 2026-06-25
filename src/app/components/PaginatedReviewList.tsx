'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { ApprovedReview } from '@/app/lib/reviews';
import { ReviewList } from './ReviewList';

// 口コミ一覧のページネーション（クライアント）。
// ★ISR を壊さないため、ページ番号の読み取りはここ（クライアント）でのみ行う。
//   サーバーページは searchParams を受け取らない・読まない（読むと ƒDynamic 化する）。
//   useSearchParams を使うため、呼び出し側で <Suspense> 境界が必要。
//
// 渡された全件を pageSize ごとに分割し、現在ページ分だけ ReviewList で表示。
// ReviewList は純粋な表示用サーバーコンポーネント（フック・cookie 不使用）なのでそのまま子に出来る。
export function PaginatedReviewList({
  reviews,
  pageSize = 20,
}: {
  reviews: ApprovedReview[];
  pageSize?: number;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const total = reviews.length;
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ?page= を読み、数値でなければ/範囲外なら 1〜totalPages にクランプ。
  const raw = Number(searchParams.get('page'));
  const page = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), totalPages) : 1;

  const start = (page - 1) * pageSize;
  const pageReviews = reviews.slice(start, start + pageSize);

  // ページ移動：1ページ目は素のパス、それ以外は ?page=n。先頭へは飛ばさない（scroll:false）。
  const goTo = (n: number) => {
    const target = Math.min(Math.max(1, n), totalPages);
    if (target === page) return;
    if (target === 1) {
      router.replace(pathname, { scroll: false });
    } else {
      router.replace(`${pathname}?page=${target}`, { scroll: false });
    }
  };

  const btnClass =
    'px-4 py-2 rounded-xl border border-pink-300 text-pink-600 text-sm font-bold hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="space-y-5">
      <ReviewList reviews={pageReviews} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button type="button" onClick={() => goTo(page - 1)} disabled={page <= 1} className={btnClass}>
            ← 前へ
          </button>
          <span className="text-sm font-bold text-slate-500 tabular-nums">
            {page} / {totalPages}
          </span>
          <button type="button" onClick={() => goTo(page + 1)} disabled={page >= totalPages} className={btnClass}>
            次へ →
          </button>
        </div>
      )}
    </div>
  );
}
