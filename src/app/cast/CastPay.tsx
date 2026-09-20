'use client';

import { useEffect, useState } from 'react';
import { getCastPayMonth, type CastPayDay } from '@/app/actions/castPay';

// /cast「報酬明細」（第572便）。★ お店が報酬確定した日の分だけ。日付を押すとその日の予約ごとの報酬。

function yen(n: number | null): string {
  return n == null ? '—' : `¥${n.toLocaleString('ja-JP')}`;
}
function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 7);
}
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${'日月火水木金土'[d.getUTCDay()]}）`;
}

export function CastPay() {
  const [ym, setYm] = useState(thisMonthJST);
  const [res, setRes] = useState<{ ym: string; days: CastPayDay[]; total: number; err: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCastPayMonth(ym).then((r) => {
      if (!alive) return;
      setRes(r.ok ? { ym, days: r.days, total: r.total, err: '' } : { ym, days: [], total: 0, err: r.error });
    });
    return () => { alive = false; };
  }, [ym]);

  const loading = !res || res.ym !== ym;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} className="rounded-full border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-500">◀</button>
        <p className="flex-1 text-center text-[16px] font-black text-slate-800">{Number(ym.slice(0, 4))}年{Number(ym.slice(5, 7))}月の報酬</p>
        <button type="button" onClick={() => setYm(shiftMonth(ym, 1))} className="rounded-full border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-500">▶</button>
      </div>
      {loading ? (
        <p className="py-8 text-center text-[14px] text-slate-400">読み込み中…</p>
      ) : res.err ? (
        <p className="py-8 text-center text-[14px] text-slate-500">{res.err}</p>
      ) : (
        <>
          <p className="mt-3 rounded-xl bg-pink-50 px-4 py-3 text-center">
            <span className="block text-[12px] font-bold text-pink-500">この月の合計（確定分）</span>
            <span className="text-[24px] font-black text-pink-600">{yen(res.total)}</span>
          </p>
          {res.days.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">この月に確定した報酬はまだありません</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {res.days.map((d) => (
                <li key={d.date} className="py-2">
                  <button type="button" onClick={() => setOpen(open === d.date ? null : d.date)} className="flex w-full items-center gap-2 text-left">
                    <span className="text-[14px] font-bold text-slate-800">{dayLabel(d.date)}</span>
                    <span className="text-[12px] text-slate-400">{d.bookingCount}本</span>
                    <span className="ml-auto text-[16px] font-black text-slate-800">{yen(d.total)}</span>
                    <span className="text-[12px] text-slate-400">{open === d.date ? '▲' : '▼'}</span>
                  </button>
                  {open === d.date && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">
                      {d.items.map((it, i) => (
                        <p key={i} className="flex gap-2">
                          <span className="font-bold">{it.time}</span>
                          <span className="min-w-0 flex-1 truncate">{it.course}</span>
                          <span>{yen(it.pay)}</span>
                        </p>
                      ))}
                      <p className="mt-1 flex border-t border-slate-200 pt-1">
                        <span className="flex-1">予約の報酬</span><span>{yen(d.payTotal)}</span>
                      </p>
                      {d.allowance !== 0 && (
                        <p className="flex">
                          <span className="flex-1">手当・交通費など{d.note ? `（${d.note}）` : ''}</span><span>{yen(d.allowance)}</span>
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">※ お店が報酬を確定したときの金額です。確定のあとで予約が変わった場合は、お店の確定し直しで変わります。</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
