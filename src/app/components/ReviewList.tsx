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

// 来店日（'YYYY-MM-DD'）を「YYYY年M月来店」に。
function formatVisited(s: string): string {
  const [y, m] = s.split('-');
  if (!y || !m) return '';
  return `${Number(y)}年${Number(m)}月来店`;
}

// 3軸内訳の1項目（ラベル＋小さい星＋数値）。
function AxisMini({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-slate-400">{label}</span>
      <Stars value={value} size={11} />
      <span className="text-[11px] font-bold text-slate-500 tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

// 承認済み口コミの一覧（サーバーコンポーネント）。
// 各口コミ：総合星＋3軸の小内訳＋来店日＋nickname＋投稿日＋本文。
// 0件なら何も出さない（Summary 側で「まだ口コミはありません」を出すので重複させない）。
export function ReviewList({ reviews }: { reviews: ApprovedReview[] }) {
  if (reviews.length === 0) return null;

  return (
    <ul className="space-y-5">
      {reviews.map((r) => (
        <li key={r.id} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
          {/* 対象セラピスト名＋丸アイコン（サロン単位の一覧のときだけ付く。セラピスト詳細では therapistName 無し＝非表示） */}
          {r.therapistName && (
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center">
                {r.therapistImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.therapistImage} alt={r.therapistName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xs font-bold">{r.therapistName.charAt(0)}</span>
                )}
              </span>
              <p className="text-[12px] font-bold text-pink-600">{r.therapistName}さんへの口コミ</p>
            </div>
          )}
          {/* 総合星＋総合値／投稿日 */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Stars value={r.overall} size={16} />
              <span className="text-sm font-bold text-slate-700 tabular-nums">
                {r.overall.toFixed(1)}
              </span>
              <span className="text-sm text-slate-500 truncate">／ {r.nickname}</span>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{formatJaDate(r.createdAt)}</span>
          </div>

          {/* 3軸の小内訳＋来店日 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
            <AxisMini label="接客" value={r.ratingService} />
            <AxisMini label="施術" value={r.ratingTechnique} />
            <AxisMini label="受付" value={r.ratingReception} />
            {r.visitedOn && (
              <span className="text-[11px] text-pink-500 font-medium">
                {formatVisited(r.visitedOn)}
              </span>
            )}
          </div>

          {/* 本文（改行保持） */}
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
            {r.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
