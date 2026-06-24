import type { ApprovedReview } from '@/app/lib/reviews';
import { Stars } from './Stars';

// 投稿日を ja-JP の年月日で表示。
function formatJaDate(s: string): string {
  return new Date(s).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// 承認済み口コミの一覧（サーバーコンポーネント）。
// 0件なら何も出さない（Summary 側で「まだ口コミはありません」を出すので重複させない）。
export function ReviewList({ reviews }: { reviews: ApprovedReview[] }) {
  if (reviews.length === 0) return null;

  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Stars value={r.rating} size={15} />
              <span className="text-sm font-bold text-slate-700 truncate">{r.nickname}</span>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{formatJaDate(r.created_at)}</span>
          </div>
          {/* 改行を保持して表示 */}
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
            {r.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
