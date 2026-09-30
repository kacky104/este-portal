import Link from 'next/link';
import type { OnDutyTherapist } from './xOnDuty';
import { XDragScroll } from './XDragScroll';

// ★★ 第1001便（2026-09-30・カッキーさん）: 「今日出勤のセラピスト」の帯（タイムラインのタブの上・全タブ共通）。
// ★ ストーリーバーと同じ横スクロールの丸アイコン。いま出勤中は緑の点、これからは時間だけ。
// ★ タップで fukuX のプロフィール（無ければフクエスのセラピストページ）へ。
export function XOnDutyStrip({ items }: { items: OnDutyTherapist[] }) {
  if (items.length === 0) return null;
  const nowCount = items.filter((t) => t.onDutyNow).length;
  return (
    <section className="x-card -mx-4 sm:mx-0 sm:rounded-2xl bg-[color:var(--x-surface)] px-4 pt-3 pb-2 mb-3 border-b border-[color:var(--x-border)] sm:border-0">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-black text-[color:var(--x-text-primary)]">
          今日出勤のセラピスト
          {nowCount > 0 && <span className="ml-1.5 text-xs font-bold text-emerald-500">いま {nowCount}人</span>}
        </h2>
        <Link href="/therapists" className="text-[11px] font-bold text-[color:var(--x-accent)] hover:underline">
          フクエスで見る
        </Link>
      </div>
      {/* ★ 第1006便: PC でもマウスでつかんで／ホイールで横に動かせる（スクロールバーは出さない） */}
      <XDragScroll className="flex gap-3 px-1 pb-1">
        {items.map((t) => (
          <Link key={t.id} href={t.href} className="flex flex-col items-center w-[72px] flex-shrink-0 group">
            <span className="relative w-[64px] h-[64px] rounded-full p-[3px] bg-[color:var(--x-border-strong)] group-hover:bg-indigo-300 transition-colors">
              <span className="block w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center">
                {t.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                ) : (
                  <span className="text-white font-bold text-lg">{t.name.charAt(0) || '?'}</span>
                )}
              </span>
              {t.onDutyNow && (
                <span
                  aria-label="いま出勤中"
                  className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[color:var(--x-surface)]"
                />
              )}
            </span>
            <span className="mt-1 max-w-full truncate text-[11px] font-bold text-[color:var(--x-text-primary)]">{t.name}</span>
            <span className="max-w-full truncate text-[10px] text-[color:var(--x-text-muted)] tabular-nums">{t.hours}</span>
          </Link>
        ))}
      </XDragScroll>
    </section>
  );
}
