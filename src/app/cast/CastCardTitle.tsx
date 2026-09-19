// ★ 第524便: /cast の各カードの見出し（左に色の線＋小さなアイコン＋文字）。見た目をそろえるための部品。
import type { ReactNode } from 'react';

const PATHS = {
  camera: 'M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-1.8A1.5 1.5 0 0 1 9.6 3.5h4.8a1.5 1.5 0 0 1 1.2.7L16.8 6h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9Z|M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  list: 'M8 6h12|M8 12h12|M8 18h12|M4 6h.01|M4 12h.01|M4 18h.01',
  bolt: 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z|M7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z|M10 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z|M14.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
} as const;

export type CastCardIcon = keyof typeof PATHS;

export function CastCardTitle({ icon, children }: { icon: CastCardIcon; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-1 h-4 shrink-0 rounded-full bg-gradient-to-b from-pink-400 to-orange-400" aria-hidden />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 text-pink-500" aria-hidden>
        {PATHS[icon].split('|').map((d) => <path key={d} d={d} />)}
      </svg>
      <span className="text-[13px] font-black text-slate-700 truncate">{children}</span>
    </span>
  );
}
