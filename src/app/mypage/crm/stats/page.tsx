'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCrmMonthStats, listCrmDormantCustomers } from '@/app/actions/crm';
import { CRM_CATEGORY_LABEL, yen, type CrmDormantCustomer, type CrmMonthStats, type CrmStatRow } from '@/app/lib/crm/types';
import { safeAction, useCrmLinks } from '../CrmBase';
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
      {(a) => <StatsBody salonId={a.salonId} adminSalonQuery={adminSalonQuery} />}
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

// ★ 第1230便（カッキーさん）: 休眠客（しばらく来ていないお客様）。月に依らず「今」から数える。押すと顧客台帳でその人を開く。
function DormantSection({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const crm = useCrmLinks();
  const [days, setDays] = useState(90);
  const [res, setRes] = useState<{ days: number; customers: CrmDormantCustomer[]; total: number } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    safeAction(listCrmDormantCustomers(salonId, days)).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setErr('');
      setRes({ days, customers: r.customers, total: r.total });
    });
    return () => { alive = false; };
  }, [salonId, days]);
  const list = res && res.days === days ? res : null;
  const sep = adminSalonQuery ? `${adminSalonQuery}&` : '?';
  const ymd = (iso: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(iso));
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-black text-slate-800">しばらく来ていないお客様</h2>
        <div className="flex">
          {[30, 60, 90, 180].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`px-2.5 py-1 text-[12px] font-bold ${days === d ? 'bg-[#7C3AED] text-white' : 'border border-slate-300 bg-white text-slate-600'}`}>
              {d}日以上
            </button>
          ))}
        </div>
        {list && <span className="text-[12px] text-slate-500">{list.total}人{list.total > list.customers.length ? `（上から${list.customers.length}人まで表示）` : ''}</span>}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">利用が1回以上あり、最終利用から{days}日以上たっていて、これからの予約が無いお客様。長く来ていない順。名前を押すと顧客台帳で開きます。</p>
      {err && <p className="mt-1 text-[13px] font-bold text-rose-600">{err}</p>}
      {!list ? (
        <p className="mt-2 text-[13px] text-slate-400">探しています…</p>
      ) : list.customers.length === 0 ? (
        <p className="mt-2 text-[13px] text-slate-400">該当するお客様はいません。</p>
      ) : (
        <div className="mt-2 overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500">
              <tr><th className="px-3 py-1.5 text-left">お客様</th><th className="px-2 text-left">分類</th><th className="px-2 text-right">利用</th><th className="px-2 text-right">最終利用</th><th className="px-2 text-right">経過</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-1.5">
                    <Link href={`${crm.href('/customers')}${sep}customer=${c.id}`} className="font-bold text-[#3f51b5] underline decoration-dotted underline-offset-2">{c.name || '(名前なし)'}</Link>
                    {c.memberNo && <span className="ml-1 text-[11px] text-slate-400">{c.memberNo}</span>}
                  </td>
                  <td className="px-2 text-[12px] text-slate-600">{CRM_CATEGORY_LABEL[c.category]}</td>
                  <td className="px-2 text-right">{c.visits}回</td>
                  <td className="whitespace-nowrap px-2 text-right text-slate-600">{ymd(c.lastVisitISO)}</td>
                  <td className="whitespace-nowrap px-2 text-right font-bold text-slate-800">{c.daysAgo}日</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatsBody({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const [ym, setYm] = useState(() => thisMonthJST());
  const [st, setSt] = useState<CrmMonthStats | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    safeAction(getCrmMonthStats(salonId, ym)).then((r) => {
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
          <Table title="指名別" rows={st.byNomination} color="#DB2777" note="料金表の「指名」で選んだ項目で分けています（受付で指名を押していない予約は「指名なし」）" />
          <Table title="新規／リピート（本数）" rows={st.byNewRepeat} color="#7C3AED" note="その人の初めての1本＝新規、2本目から＝リピート（前の月までの利用も見ます）" />
        </>
      )}
      <DormantSection salonId={salonId} adminSalonQuery={adminSalonQuery} />
    </div>
  );
}
