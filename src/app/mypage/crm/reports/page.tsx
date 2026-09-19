'use client';

import { useEffect, useState } from 'react';
import { listCrmReports } from '@/app/actions/crm';
import { yen, type CrmDailyReport } from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';

// フクエスCRM「日報」（第538便・2026-09-19）。★ 締め作業で作った日報を月ごとに並べ、月の合計を出す。
// ★ 日報は締めたときの数字の写し。締めていない日は出ない（スケジュールの「締め作業」で作る）。

function thisMonthJST(): string {
  const d = new Date(Date.now() + 9 * 3600_000 - 6 * 3600_000);
  return d.toISOString().slice(0, 7);
}
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${Number(date.slice(8, 10))}日（${'日月火水木金土'[d.getUTCDay()]}）`;
}

export default function CrmReportsPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="reports">
      {(a) => <ReportsBody salonId={a.salonId} />}
    </CrmShell>
  );
}

function ReportsBody({ salonId }: { salonId: number }) {
  const [ym, setYm] = useState(() => thisMonthJST());
  const [rows, setRows] = useState<CrmDailyReport[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    listCrmReports(salonId, ym).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); setRows([]); return; }
      setErr('');
      setRows(r.reports);
    });
    return () => { alive = false; };
  }, [salonId, ym]);

  const total = (rows ?? []).reduce(
    (a, r) => ({
      bookingCount: a.bookingCount + r.bookingCount,
      cancelCount: a.cancelCount + r.cancelCount,
      sales: a.sales + r.sales,
      cashSales: a.cashSales + r.cashSales,
      pay: a.pay + r.pay,
      expense: a.expense + r.expense,
      profit: a.profit + r.profit,
    }),
    { bookingCount: 0, cancelCount: 0, sales: 0, cashSales: 0, pay: 0, expense: 0, profit: 0 },
  );

  const th = 'px-2 py-2 text-right text-[11px] font-bold text-slate-500';
  const td = 'px-2 py-2 text-right';

  return (
    <div className="mx-auto max-w-5xl px-3 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[20px] font-black text-slate-800">{ym.slice(0, 4)}年{Number(ym.slice(5, 7))}月の日報</span>
        <div className="flex">
          <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">◀ 前月</button>
          <button type="button" onClick={() => setYm(thisMonthJST())} className="bg-pink-400 px-3 py-1.5 text-[13px] font-bold text-white">今月</button>
          <button type="button" onClick={() => setYm(shiftMonth(ym, 1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">次月 ▶</button>
        </div>
      </div>

      {/* 月の合計 */}
      <div className="mb-3 grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-5">
        {[
          ['売上', yen(total.sales)],
          ['女子報酬', yen(total.pay)],
          ['経費', yen(total.expense)],
          ['利益', yen(total.profit)],
          ['本数', `${total.bookingCount}本`],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-3 py-2">
            <p className="text-[11px] font-bold text-slate-400">{k}</p>
            <p className={`text-[18px] font-black ${k === '利益' && total.profit < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{v}</p>
          </div>
        ))}
      </div>

      {err && <p className="mb-3 text-[13px] font-bold text-rose-600">{err}</p>}
      {!rows ? (
        <p className="p-6 text-center text-[14px] text-slate-400">読み込み中です…</p>
      ) : rows.length === 0 ? (
        <p className="border border-slate-200 bg-white p-8 text-center text-[14px] leading-relaxed text-slate-400">
          この月の日報はまだありません。<br />スケジュールの「締め作業（日報を作る）」で、1日ずつ締めると、ここに並びます。
        </p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">日付</th>
                <th className={th}>本数</th>
                <th className={th}>ｷｬﾝｾﾙ</th>
                <th className={th}>出勤</th>
                <th className={th}>売上</th>
                <th className={th}>うち現金</th>
                <th className={th}>女子報酬</th>
                <th className={th}>経費</th>
                <th className={th}>利益</th>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="whitespace-nowrap px-2 py-2 font-bold text-slate-800">{dayLabel(r.date)}</td>
                  <td className={td}>{r.bookingCount}</td>
                  <td className={td}>{r.cancelCount}</td>
                  <td className={td}>{r.workingCount}</td>
                  <td className={`${td} font-bold`}>{yen(r.sales)}</td>
                  <td className={td}>{yen(r.cashSales)}</td>
                  <td className={td}>{yen(r.pay)}</td>
                  <td className={td}>{yen(r.expense)}</td>
                  <td className={`${td} font-bold ${r.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{yen(r.profit)}</td>
                  <td className="max-w-[200px] truncate px-2 py-2 text-slate-500" title={r.memo}>{r.memo}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-black">
              <tr>
                <td className="px-2 py-2">合計</td>
                <td className={td}>{total.bookingCount}</td>
                <td className={td}>{total.cancelCount}</td>
                <td className={td} />
                <td className={td}>{yen(total.sales)}</td>
                <td className={td}>{yen(total.cashSales)}</td>
                <td className={td}>{yen(total.pay)}</td>
                <td className={td}>{yen(total.expense)}</td>
                <td className={`${td} ${total.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{yen(total.profit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
