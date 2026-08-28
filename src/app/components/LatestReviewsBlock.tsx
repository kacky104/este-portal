import Link from 'next/link';
import type { ApprovedReview } from '@/app/lib/reviews';
import { Stars } from './Stars';

// TOPページに出す「新着の口コミ」ブロック（サーバーコンポーネント・presentational のみ）。
//
// 置き場所ごとに variant で切り替える:
//   'section' … 見出し＋カード＋中央ボタンの並び（TOP／エリア／店舗詳細）
//   'sidebar' … 細い右カラム用（旧「PRこの枠は準備中です」の位置）
//
// ★ mobileOnly … TOP／エリアのように PC 側を 'sidebar' で出しているページで付ける。
//   付けないと同じ内容が1画面に2回出る。
//
// ★ データ取得はしない。呼び出し側（src/app/page.tsx）が getAllApprovedReviews で取って渡す。
//   一覧（/reviews）と同じ関数を使うので、公開ルール（非表示店・非在籍セラピストを除く）が自動で揃う。
//
// ★ 0件なら null を返して何も出さない。空の見出しだけが残る形にしない。

/** 来店日（'YYYY-MM-DD'）→「2026年8月来店」 */
function formatVisited(s: string): string {
  const [y, m] = s.split('-');
  if (!y || !m) return '';
  return `${Number(y)}年${Number(m)}月来店`;
}

/**
 * 1件ぶんのカード。
 * ★ 本文は行数で切る（section=3行 / sidebar=4行）。TOPは「読ませる場所」ではなく
 *   「口コミがあることを見せて /reviews へ送る場所」なので、全文は出さない。
 */
function ReviewMiniCard({
  r,
  compact,
  cardStyle,
}: {
  r: ApprovedReview;
  compact: boolean;
  // 店舗ページは店舗ごとの色テーマを持つので、背景と枠線だけ外から差せるようにする。
  // ★ 文字色は差さない（テーマによって読めなくなるため。カードの地色だけ合わせる）。
  cardStyle?: { backgroundColor?: string; borderColor?: string };
}) {
  return (
    <li
      className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3.5"
      style={cardStyle}
    >
      {/* セラピスト＋店舗（/reviews の一覧と同じ並び） */}
      {r.therapistName && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center">
            {r.therapistImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.therapistImage} alt={r.therapistName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">{r.therapistName.charAt(0)}</span>
            )}
          </span>
          <p className="text-[12px] min-w-0 truncate">
            <Link href={`/therapist/${r.therapistId}`} className="font-bold text-pink-600 hover:underline">
              {r.therapistName}
            </Link>
            {r.salonName && (
              <>
                <span className="text-slate-400"> ・ </span>
                {r.salonId ? (
                  <Link href={`/salon/${r.salonId}`} className="text-slate-500 hover:underline">
                    {r.salonName}
                  </Link>
                ) : (
                  <span className="text-slate-500">{r.salonName}</span>
                )}
              </>
            )}
          </p>
        </div>
      )}

      {/* 総合★＋数値＋投稿者 */}
      <div className="flex items-center gap-2 mb-1.5 min-w-0">
        <Stars value={r.overall} size={14} />
        <span className="text-[13px] font-bold text-slate-700 tabular-nums">{r.overall.toFixed(1)}</span>
        <span className="text-[12px] text-slate-500 truncate">／ {r.nickname}</span>
      </div>

      <p
        className={`text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap break-words ${
          compact ? 'line-clamp-4' : 'line-clamp-3'
        }`}
      >
        {r.body}
      </p>

      {r.visitedOn && (
        <p className="mt-1.5 text-[11px] text-pink-500 font-medium">{formatVisited(r.visitedOn)}</p>
      )}
    </li>
  );
}

/** 「もっとみる」。★ 押す先が一覧であることが分かる文言にする。 */
function MoreLink({ full, href, label }: { full: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`${full ? 'flex w-full' : 'inline-flex'} items-center justify-center gap-1 text-xs font-bold px-5 py-2 rounded-full border border-pink-200 text-pink-600 transition-colors hover:bg-pink-50`}
    >
      {label}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

export function LatestReviewsBlock({
  reviews,
  variant,
  mobileOnly = false,
  heading = '新着の口コミ',
  moreHref = '/reviews',
  moreLabel = '口コミをもっとみる',
  cardStyle,
  className = 'mt-12',
}: {
  reviews: ApprovedReview[];
  variant: 'section' | 'sidebar';
  /** true でPC（lg以上）では出さない。PC側を sidebar で出しているページ用 */
  mobileOnly?: boolean;
  heading?: string;
  moreHref?: string;
  moreLabel?: string;
  cardStyle?: { backgroundColor?: string; borderColor?: string };
  /** 'section' の外側の余白。縦に積むカラムの中に置くときは 'mt-0' などに差し替える */
  className?: string;
}) {
  if (reviews.length === 0) return null;

  if (variant === 'sidebar') {
    return (
      <aside className="flex-1 flex flex-col rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50 via-white to-fuchsia-50/40 overflow-hidden shadow-sm">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
            <h2 className="text-sm font-bold text-slate-900">{heading}</h2>
          </div>
          <ul className="space-y-3">
            {reviews.map((r) => (
              <ReviewMiniCard key={r.id} r={r} compact cardStyle={cardStyle} />
            ))}
          </ul>
          <MoreLink full href={moreHref} label={moreLabel} />
        </div>
      </aside>
    );
  }

  return (
    <section className={`${className}${mobileOnly ? ' lg:hidden' : ''}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
        <h2 className="text-base font-bold text-slate-900 min-w-0 flex-1">{heading}</h2>
      </div>
      <ul className="space-y-3">
        {reviews.map((r) => (
          <ReviewMiniCard key={r.id} r={r} compact={false} cardStyle={cardStyle} />
        ))}
      </ul>
      <div className="flex justify-center mt-4">
        <MoreLink full={false} href={moreHref} label={moreLabel} />
      </div>
    </section>
  );
}
