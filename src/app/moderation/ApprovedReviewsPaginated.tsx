'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ApprovedReviewModeration, type ApprovedReviewView } from './ReviewModeration';

// 承認済み（公開中）口コミのページャ（クライアント）。承認済みは溜まり続けるので 50件ずつ表示。
// ページ番号は useSearchParams で ?page= を読み、router.replace で URL 同期（公開ページの
// PaginatedReviewList と同じ作り）。各カードは既存の ApprovedReviewModeration をそのまま子に出す
// ＝削除→confirm→deleteReview→router.refresh() の挙動は不変。削除でサーバー再取得して件数が
// 減り、現在ページが範囲外になってもクランプで最終ページに収まる。
export function ApprovedReviewsPaginated({
  reviews,
  pageSize = 50,
}: {
  reviews: ApprovedReviewView[];
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
    <div className="space-y-4">
      {pageReviews.map((v) => (
        <ApprovedReviewModeration key={v.reviewId} {...v} />
      ))}

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
