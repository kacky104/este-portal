'use client';

// /admin のサイドバー（第1539便・2026-10-17・カッキーさん「/mypage みたいにサイドバー方式に」）。
// ★ 見た目は /mypage のサイドバーにそろえる（見出しはピンクの帯・項目は #212121・選んでいる項目は文字だけピンクのグラデーション）。
// ★ PC（lg 以上）は左に固定。スマホは三本線で開くドロワー（呼び出し側が open を持つ）。
// ★ 件数バッジは badges（項目 id → 数）。見出しにはそのグループの合計を出す（閉じていても気づけるように）。
//   ★ メール配信トラブルだけ赤（予約の取りこぼし）＝ redBadges に入れた id は赤。

import Link from 'next/link';
import { useState } from 'react';
import { ADMIN_NAV, ADMIN_LINKS } from './adminNav';

export type AdminBadges = Record<string, number>;

function Badge({ n, red }: { n: number; red?: boolean }) {
  return (
    <span className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 ${red ? 'bg-rose-600' : 'bg-pink-500'} text-white text-[10px] font-black leading-none`}>
      {n}
    </span>
  );
}

export function AdminNavList({ selected, onSelect, badges, redBadges }: {
  selected: string;
  onSelect: (id: string) => void;
  badges: AdminBadges;
  redBadges: ReadonlySet<string>;
}) {
  // 見出しを押すとたたむ（既定は全部開く）。★ 永続化しない。
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (tab: string) => setClosed((prev) => {
    const next = new Set(prev);
    if (next.has(tab)) next.delete(tab); else next.add(tab);
    return next;
  });

  return (
    <nav aria-label="管理メニュー" className="pb-6">
      {ADMIN_NAV.map((g) => {
        const open = !closed.has(g.tab);
        const sum = g.items.reduce((a, i) => a + (badges[i.id] ?? 0), 0);
        const groupRed = g.items.some((i) => redBadges.has(i.id) && (badges[i.id] ?? 0) > 0);
        return (
          <div key={g.tab}>
            <button
              type="button"
              onClick={() => toggle(g.tab)}
              aria-expanded={open}
              className="w-full flex items-center gap-2 px-4 py-2 mt-2 first:mt-0 font-bold tracking-wider text-[16px] text-white bg-pink-500 hover:bg-pink-600 transition-colors"
            >
              <span>{g.label}</span>
              {!open && sum > 0 && <Badge n={sum} red={groupRed} />}
              <svg className={`${!open && sum > 0 ? 'ml-1' : 'ml-auto'} w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {open && g.items.map((it) => {
              const isSel = it.id === selected;
              const n = badges[it.id] ?? 0;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelect(it.id)}
                  aria-current={isSel ? 'page' : undefined}
                  className={`w-full flex items-center gap-2 border-l-4 px-4 py-3 text-left text-[16px] leading-snug transition-colors ${
                    isSel ? 'border-l-pink-500 bg-pink-50/60 text-pink-600' : 'border-l-transparent text-[#212121] hover:bg-pink-50/40'
                  }`}
                >
                  {isSel ? (
                    <span className="bg-gradient-to-r from-pink-600 to-pink-400 bg-clip-text text-transparent">{it.label}</span>
                  ) : (
                    <span>{it.label}</span>
                  )}
                  {n > 0 && <Badge n={n} red={redBadges.has(it.id)} />}
                </button>
              );
            })}
          </div>
        );
      })}

      <div className="px-4 pt-4 pb-1 text-[13px] tracking-wider text-slate-400">ほかの画面</div>
      {ADMIN_LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="block border-l-4 border-l-transparent px-4 py-3 text-[16px] text-[#212121] hover:bg-pink-50/40 hover:text-pink-600 transition-colors"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
