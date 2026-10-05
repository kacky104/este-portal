import Link from 'next/link';
import type { OnDutyTherapist } from './xOnDuty';
import { XDragScroll } from './XDragScroll';

// ★★ 第1001便（2026-09-30・カッキーさん）: 「今日出勤のセラピスト」の帯（タイムラインのタブの上・全タブ共通）。
// ★ ストーリーバーと同じ横スクロールの丸アイコン。★ 第1007便: 出すのは出勤中の子だけ（緑の点は全員に付く）。
// ★ タップで fukuX のプロフィール（無ければフクエスのセラピストページ）へ。
// ★ 第1194便（カッキーさん）: 見出しの行の右端に「セラピスト総数 ◯人」（フクエスTOPの「福岡セラピスト」と同じ数）。total が null（読めなかった）なら出さない。
export function XOnDutyStrip({ items, total }: { items: OnDutyTherapist[]; total?: number | null }) {
  if (items.length === 0) return null;
  const nowCount = items.filter((t) => t.onDutyNow).length;
  return (
    // ★ 第1021便: 幅は下のタブ・投稿の行と同じ（-mx-4 で両端いっぱい・PC も同じ）。
    //   スマホでは丸アイコンの列に左右の余白を付けず、画面の端から端まで見える（見出しだけ px-4）。
    <section className="x-card -mx-4 bg-[color:var(--x-surface)] pt-3 pb-2 mb-3 border-b border-[color:var(--x-border)]">
      <div className="flex items-baseline justify-between mb-2 px-4">
        <h2 className="text-sm font-black text-[color:var(--x-text-primary)]">
          福岡の出勤中セラピスト
          {nowCount > 0 && <span className="ml-1.5 text-xs font-bold text-emerald-500">いま {nowCount}人</span>}
        </h2>
        {typeof total === 'number' && total > 0 && (
          <span className="flex-shrink-0 text-xs font-bold text-[color:var(--x-text-secondary)] tabular-nums">セラピスト総数 {total}人</span>
        )}
      </div>
      {/* ★ 第1006便: PC でもマウスでつかんで／ホイールで横に動かせる（スクロールバーは出さない） */}
      <XDragScroll className="flex gap-3 px-0 pb-1">
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
          </Link>
        ))}
      </XDragScroll>
    </section>
  );
}
