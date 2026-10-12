import Link from 'next/link';
import type { SalonTheme } from '@/app/lib/themes';

// お知らせページのいちばん上の「本日の出勤速報」（第1418便・2026-10-13・カッキーさん）。
// ★ サーバーで描く（クライアントの JS なし）＝ Google にもそのまま本文として見える。
// ★ 中身はページ側（news/page.tsx）が出勤とセラピストから作って渡す。決まりは lib/dailyShiftNews.ts。

export type DailyShiftCard = {
  id: number;
  name: string;
  age: number | null;
  hours: string;        // 「18:00〜翌1:00」
  sizes: string;        // 「T161 B93(H) W57 H86」
  catchphrase: string;
  imageUrl: string | null;
};

export function DailyShiftNews({
  title, dateLabel, featured, others, scheduleHref, theme,
}: {
  title: string;
  dateLabel: string;
  featured: DailyShiftCard[];
  others: DailyShiftCard[];
  scheduleHref: string;
  theme: SalonTheme;
}) {
  const nameAge = (p: DailyShiftCard) => `${p.name}${p.age ? `（${p.age}）` : ''}`;
  return (
    <article className="mb-4 border shadow-sm overflow-hidden" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
      <div className="px-4 pt-4 sm:px-5">
        <p className="flex items-center gap-2 text-[12px]" style={{ color: theme.body }}>
          <span className="bg-pink-500 px-1.5 py-0.5 text-[11px] font-bold text-white">本日の出勤</span>
          <span>{dateLabel}</span>
        </p>
        <h2 className="mt-1.5 text-[16px] font-bold leading-snug" style={{ color: theme.heading }}>{title}</h2>
      </div>

      {featured.length > 0 && (
        <div className={`mt-3 grid gap-3 px-4 sm:px-5 ${featured.length > 1 ? 'grid-cols-2' : 'grid-cols-1 sm:max-w-[320px]'}`}>
          {featured.map((p) => (
            <Link key={p.id} href={`/therapist/${p.id}`} className="block hover:opacity-90">
              <div className="aspect-[3/4] w-full overflow-hidden bg-slate-100">
                {p.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover object-top" loading="lazy" />
                  : <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-slate-300">{p.name.charAt(0)}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed sm:px-5" style={{ color: theme.body }}>
        {featured.length > 0 && (
          <p>
            本日は{featured.map((p) => `『${p.name}』さん`).join('と')}が出勤します。ご予約・ご指名をお待ちしております。
          </p>
        )}
        {featured.map((p) => (
          <div key={p.id}>
            <p className="font-bold" style={{ color: theme.heading }}>◇ <Link href={`/therapist/${p.id}`} className="underline decoration-dotted underline-offset-2">{nameAge(p)}</Link> ◇</p>
            <p>▶ 出勤時間：{p.hours}</p>
            {p.sizes && <p>▶ スリーサイズ：{p.sizes}</p>}
            {p.catchphrase && <p>▶ {p.catchphrase}</p>}
          </div>
        ))}
        {others.length > 0 && (
          <div>
            <p className="font-bold" style={{ color: theme.heading }}>☆ ほかにも本日出勤のセラピスト ☆</p>
            <ul className="mt-1 space-y-0.5">
              {others.map((p) => (
                <li key={p.id}>
                  <Link href={`/therapist/${p.id}`} className="underline decoration-dotted underline-offset-2">{nameAge(p)}</Link>
                  <span className="ml-2">{p.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>
          <Link href={scheduleHref} className="font-bold text-pink-600 underline underline-offset-2">週間の出勤予定を見る →</Link>
        </p>
      </div>
    </article>
  );
}
