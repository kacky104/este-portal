'use client';

import { useEffect, useState } from 'react';
import { getCrmMonthStats } from '@/app/actions/crm';
import { yen, type CrmMonthStats, type CrmStatRow } from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';

// フクエスCRM「レポート」（第540便・2026-09-19）。
// ★ 月ごとに、営業日（6:00〜翌6:00）で予約を数える。締めていない日も入る（日報は締めた日だけ）。
// ★ 売上・報酬は予約に入れた料金（料金を入れていない予約は0円で数え、件数を知らせる）。

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 7);
}
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default function CrmStatsPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="stats">
      {(a) => <StatsBody salonId={a.salonId} />}
    </CrmShell>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2.5 w-full bg-slate-100">
      <div className="h-full" style={{ width: `${value > 0 ? w : 0}%`, background: color }} />
    </div>
  );
}

function Table({ title, rows, color, note }: { title: string; rows: CrmStatRow[]; color: string; note?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.sales));
  const maxCount = Math.max(0, ...rows.map((r) => r.count));
  const useCount = max === 0;
  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h3 className="text-[15px] font-black text-slate-800">{title}</h3>
        {note && <p className="text-[12px] text-slate-500">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-[13px] text-slate-400">この月の予約はありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-[11px] font-bold text-slate-400">
                <th className="px-3 py-1.5 text-left">　</th>
                <th className="px-2 text-right">本数</th>
                <th className="px-2 text-right">ｷｬﾝｾﾙ</th>
                <th className="px-2 text-right">売上</th>
                <th className="px-2 text-right">報酬</th>
                <th className="w-[28%] px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-bold text-slate-800">{r.label}</td>
                  <td className="px-2 text-right">{r.count}</td>
                  <td className="px-2 text-right text-slate-500">{r.cancels}</td>
                  <td className="px-2 text-right font-bold">{yen(r.sales)}</td>
                  <td className="px-2 text-right">{yen(r.pay)}</td>
                  <td className="px-3"><Bar value={useCount ? r.count : r.sales} max={useCount ? maxCount : max} color={color} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatsBody({ salonId }: { salonId: number }) {
  const [ym, setYm] = useState(() => thisMonthJST());
  const [st, setSt] = useState<CrmMonthStats | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getCrmMonthStats(salonId, ym).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setErr('');
      setSt(r.stats);
    });
    return () => { alive = false; };
  }, [salonId, ym]);

  const t = st?.total;
  const payAll = t ? t.pay + t.allowance : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[20px] font-black text-slate-800">{ym.slice(0, 4)}年{Number(ym.slice(5, 7))}月のレポート</span>
        <div className="flex">
          <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">◀ 前月</button>
          <button type="button" onClick={() => setYm(thisMonthJST())} className="bg-pink-400 px-3 py-1.5 text-[13px] font-bold text-white">今月</button>
          <button type="button" onClick={() => setYm(shiftMonth(ym, 1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">次月 ▶</button>
        </div>
      </div>
      {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
      {!st || st.ym !== ym ? (
        <p className="p-6 text-center text-[14px] text-slate-400">{err ? '' : '集計しています…'}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
            {[
              ['売上', yen(t!.sales)],
              ['女子報酬（手当込み）', yen(payAll)],
              ['売上 − 報酬', yen(t!.sales - payAll)],
              ['本数', `${t!.count}本`],
              ['キャンセル', `${t!.cancels}本${t!.badCancels ? `（悪質${t!.badCancels}）` : ''}`],
              ['お客様', `${st.customers.people}人`],
              ['新規のお客様', `${st.customers.newPeople}人`],
              ['リピートのお客様', `${st.customers.repeatPeople}人`],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-3 py-2">
                <p className="text-[11px] font-bold text-slate-400">{k}</p>
                <p className="text-[18px] font-black text-slate-800">{v}</p>
              </div>
            ))}
          </div>
          {(t!.unpriced > 0 || st.customers.noTel > 0) && (
            <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
              {t!.unpriced > 0 && <>料金を入れていない予約が {t!.unpriced} 本あります（売上・報酬は0円で数えています）。<br /></>}
              {st.customers.noTel > 0 && <>電話番号の無い予約が {st.customers.noTel} 本あります（お客様の人数には入りません）。</>}
            </p>
          )}
          {/* ★ 入り口別は今は出さない（2026-09-19・カッキーさんの指示）。集計（st.bySource）はサーバーに残してある。
              戻すときはここに <Table title="入り口別" rows={st.bySource} color="#DB2777" /> を置くだけ。 */}
          <Table title="セラピスト別" rows={st.byTherapist} color="#3f51b5" />
          <Table title="日別" rows={st.byDay} color="#0891b2" note="締めていない日も入ります（日報タブは締めた日だけ）" />
          <Table title="時間帯別（開始の時刻）" rows={st.byHour} color="#059669" />
          <Table title="指名別" rows={st.byNomination} color="#DB2777" note="料金表の「指名」で選んだ項目で分けています（かんたん受付で入れた予約は「指名なし」）" />
          <Table title="新規／リピート（本数）" rows={st.byNewRepeat} color="#7C3AED" note="その人の初めての1本＝新規、2本目から＝リピート（前の月までの利用も見ます）" />
        </>
      )}
    </div>
  );
}
