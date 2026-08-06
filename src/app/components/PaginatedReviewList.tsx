'use client';

import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import type { ApprovedReview } from '@/app/lib/reviews';
import { ReviewList } from './ReviewList';

// 口コミ一覧のページネーション（クライアント）。
// ★ISR を壊さないため、ページ番号の読み取りはここ（クライアント）でのみ行う。
//   サーバーページは searchParams を受け取らない・読まない（読むと ƒDynamic 化する）。
//   useSearchParams を使うため、呼び出し側で <Suspense> 境界が必要。
//
// 渡された全件を pageSize ごとに分割し、現在ページ分だけ ReviewList で表示。
// ReviewList は純粋な表示用サーバーコンポーネント（フック・cookie 不使用）なのでそのまま子に出来る。
//
// ページ送りは <Link>（2026-08-06）。従来は <button onClick={router.replace}> で <a> が
// 存在せず、クローラが2ページ目以降に到達できなかった（DiaryPagination と同方式に統一）。
// 端（1ページ目/最終ページ）では無効表示の <span> を出す。
export function PaginatedReviewList({
  reviews,
  pageSize = 20,
}: {
  reviews: ApprovedReview[];
  pageSize?: number;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const total = reviews.length;
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ?page= を読み、数値でなければ/範囲外なら 1〜totalPages にクランプ。
  const raw = Number(searchParams.get('page'));
  const page = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), totalPages) : 1;

  const start = (page - 1) * pageSize;
  const pageReviews = reviews.slice(start, start + pageSize);

  // 1ページ目は素のパス（?page=1 を作らない＝重複URL防止）、それ以外は ?page=n。
  const hrefFor = (n: number) => (n <= 1 ? pathname : `${pathname}?page=${n}`);

  const btnClass =
    'px-4 py-2 rounded-xl border border-pink-300 text-pink-600 text-sm font-bold hover:bg-pink-50 transition-colors';
  const disabledClass =
    'px-4 py-2 rounded-xl border border-pink-300 text-pink-600 text-sm font-bold opacity-40 cursor-not-allowed';

  return (
    <div className="space-y-5">
      <ReviewList reviews={pageReviews} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          {page <= 1 ? (
            <span aria-disabled="true" className={disabledClass}>← 前へ</span>
          ) : (
            <Link href={hrefFor(page - 1)} scroll={false} className={btnClass}>← 前へ</Link>
          )}
          <span className="text-sm font-bold text-slate-500 tabular-nums">
            {page} / {totalPages}
          </span>
          {page >= totalPages ? (
            <span aria-disabled="true" className={disabledClass}>次へ →</span>
          ) : (
            <Link href={hrefFor(page + 1)} scroll={false} className={btnClass}>次へ →</Link>
          )}
        </div>
      )}
    </div>
  );
}
