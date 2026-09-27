'use client';

// 同じ店の他のセラピスト（第908便・2026-09-27）。
// ★ 公開中（is_active）の方を全員受け取り、ブラウザで毎回シャッフルして9名だけ出す。
//   ページは ISR（10分）なので、サーバーで混ぜると10分間同じ並びに固まる → 混ぜるのはブラウザ側。
// ★ 最初の描画はサーバーと同じ並び（id 順）で、混ぜ終わるまでは visibility:hidden
//   （高さは確保したまま＝並びが入れ替わるチラつきを見せない）。

import Link from 'next/link';
import { useEffect, useState } from 'react';

export type SameSalonTherapist = { id: string; name: string; image: string | null };

const LIMIT = 9; // スマホ3列×3行がちょうど埋まる数（第20便）

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SameSalonTherapists({ list }: { list: SameSalonTherapist[] }) {
  const [shown, setShown] = useState<SameSalonTherapist[]>(() => list.slice(0, LIMIT));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setShown(shuffle(list).slice(0, LIMIT));
    setReady(true);
  }, [list]);

  return (
    <ul
      className="grid grid-cols-3 gap-x-2 gap-y-2.5 lg:block lg:space-y-1"
      style={ready ? undefined : { visibility: 'hidden' }}
    >
      {shown.map((t) => (
        <li key={t.id} className="min-w-0">
          <Link
            href={`/therapist/${t.id}`}
            className="flex flex-col items-center gap-1.5 py-2 px-0.5 rounded-xl hover:bg-pink-50/70 transition-colors lg:flex-row lg:gap-2.5 lg:py-1.5 lg:px-0 lg:rounded-lg"
          >
            <span className="w-[52px] h-[52px] lg:w-8 lg:h-8 rounded-full bg-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
              {t.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.image} alt={t.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[15px] lg:text-[11px] font-bold text-slate-400">{(t.name || '?').charAt(0)}</span>
              )}
            </span>
            <span className="w-full lg:w-auto text-center lg:text-left text-[11.5px] lg:text-[13px] font-semibold text-slate-700 truncate">
              {t.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
