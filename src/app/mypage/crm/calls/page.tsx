'use client';

import { useCallback, useState } from 'react';
import { listCrmCalls, lookupCtiCaller, type CrmCallLogRow } from '@/app/actions/crmCti';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { useLoadOnMount } from '@/app/components/useLoadOnMount';
import { CrmShell, useCrmAccess } from '../CrmShell';
import { safeAction, useCrmLinks } from '../CrmBase';
import { CtiCallPanel, fmtTel, withQuery, type CtiPanelInfo } from '../CtiCallPanel';

// フクエスCRM「着信履歴」（第1994便・2026-11-12・カッキーさん）。★ 風俗CTI の「本日着信」にならった。
// ★ 記録は CTI の端末から届いた着信（crm_cti_calls・90日残る）。日付は営業日（朝6時区切り）。
// ★ 種別「予約」＝その着信から60分以内に同じ番号の予約が入った。新規＝台帳にいない番号（かその着信のあとに台帳に入った人）。
// ★ 「詳細」で着信のときと同じ大きな窓（CtiCallPanel）を開く。

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function dateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}(${WD[d.getUTCDay()]})`;
}
function dt(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WD[d.getUTCDay()]}) ${String(d.getUTCHours()).padStart(2, '0')}時${String(d.getUTCMinutes()).padStart(2, '0')}分${String(d.getUTCSeconds()).padStart(2, '0')}秒`;
}

export default function CrmCallsPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="calls">
      {(a) => <CallsBody salonId={a.salonId} adminSalonQuery={adminSalonQuery} />}
    </CrmShell>
  );
}

function CallsBody({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const links = useCrmLinks();
  const today = getBusinessDateJST();
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<CrmCallLogRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<{ row: CrmCallLogRow; info: CtiPanelInfo } | null>(null);
  const [nowMs] = useState(() => Date.now()); // 「◯日前」「予約中」の基準（画面を開いた時刻）

  const load = useCallback(async () => {
    const r = await safeAction(listCrmCalls(salonId, date));
    if (!r.ok) { setErr(r.error); setRows([]); return; }
    setErr(''); setRows(r.rows); setTruncated(r.truncated);
  }, [salonId, date]);
  useLoadOnMount(load);

  const go = (d: string) => { setRows(null); setDate(d); };
  const openDetail = async (row: CrmCallLogRow) => {
    setOpen({ row, info: row.phone ? 'loading' : null });
    if (!row.phone) return;
    const r = await safeAction(lookupCtiCaller(salonId, row.phone));
    setOpen((cur) => (cur && cur.row.id === row.id ? { row, info: r.ok ? r : 'failed' } : cur));
  };
  const q = adminSalonQuery ? Object.fromEntries(new URLSearchParams(adminSalonQuery)) : {};
  const cust = open && open.info && typeof open.info === 'object' ? open.info.customer : null;

  return (
    <div className="mx-auto max-w-[1100px] p-3 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[20px] font-black text-indigo-800">着信履歴</h1>
        <input
          type="date" value={date} max={today}
          onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) go(e.target.value); }}
          className="border border-slate-300 bg-white px-2 py-1.5 text-[14px]"
          aria-label="日付"
        />
        <button type="button" onClick={() => go(shiftDate(date, -1))} className="bg-indigo-600 px-3 py-1.5 text-[13px] font-bold text-white">◀ 前日</button>
        <button type="button" onClick={() => go(today)} disabled={date === today} className="bg-pink-400 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-60">今日</button>
        <button type="button" onClick={() => go(shiftDate(date, 1))} disabled={date >= today} className="bg-indigo-600 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40">次日 ▶</button>
        <button type="button" onClick={() => { setRows(null); void load(); }} className="border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-600">読み直す</button>
        <span className="text-[12px] text-slate-400">（記録は90日残ります。日付は朝6時区切り）</span>
      </div>
      <p className="mt-2 text-[15px] font-bold text-slate-700">{dateLabel(date)}　{rows ? `${rows.length}件${truncated ? '（多いので新しい500件だけ）' : ''}` : ''}</p>

      {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
      {!rows && !err && <p className="mt-4 text-[13px] text-slate-400">読み込み中です…</p>}
      {rows && rows.length === 0 && !err && (
        <p className="mt-4 border border-slate-200 bg-white p-6 text-center text-[13px] text-slate-500">この日の着信はありません（CTI の端末からの着信だけが残ります）</p>
      )}
      {rows && rows.length > 0 && (
        <div className="mt-2 overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-2"></th>
                <th className="px-2 py-2">新規</th>
                <th className="px-2 py-2">日時</th>
                <th className="px-2 py-2">顧客名</th>
                <th className="px-2 py-2">電話番号</th>
                <th className="px-2 py-2">種別</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-indigo-50/50">
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => void openDetail(r)} className="px-1 py-1 font-bold text-indigo-600 underline">詳細</button>
                  </td>
                  <td className="px-2 py-1.5">{r.isNew && <span className="bg-violet-600 px-1.5 py-0.5 text-[12px] font-bold text-white">新規</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{dt(r.rangAtISO)}{r.test && <span className="ml-1 border border-slate-300 px-1 text-[11px] text-slate-500">テスト</span>}</td>
                  <td className="px-2 py-1.5">{r.customerName || <span className="text-slate-400">未設定</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{r.phone ? fmtTel(r.phone) : (r.hidden === 'payphone' ? '公衆電話' : '非通知')}</td>
                  <td className="px-2 py-1.5">{r.booked ? <span className="font-bold text-emerald-700">予約</span> : <span className="text-slate-500">未設定</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <CtiCallPanel
          call={{ phone: open.row.phone, hidden: open.row.hidden, rangAtISO: open.row.rangAtISO, test: open.row.test }}
          info={open.info}
          nowMs={nowMs}
          receptionHref={open.row.phone ? withQuery(links.href('/'), { ...q, tel: open.row.phone }) : null}
          ledgerHref={open.row.phone ? withQuery(links.href('/customers'), cust ? { ...q, customer: String(cust.id) } : { ...q, tel: open.row.phone }) : null}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
