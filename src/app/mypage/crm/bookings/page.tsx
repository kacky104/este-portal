'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCrmTherapists, searchCrmBookings } from '@/app/actions/crm';
import { CRM_RECEIVED_LABEL, yen, type CrmBookingListRow, type CrmBookingSearch, type CrmReceivedBy, type CrmTherapist } from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';

// フクエスCRM「予約一覧」（第571便・2026-09-20）。★ 日付をまたいで予約を探す（先月のキャンセル・担当ごと・名前や電話で）。
// ★ 行の日時を押すとその日のスケジュール、名前を押すと顧客台帳（ひも付いている人だけ）を開く。

function businessTodayJST(): string {
  return new Date(Date.now() + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
}
function monthStart(d: string): string { return `${d.slice(0, 7)}-01`; }
function dt(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function hm(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
function businessDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
}
function shiftMonth(d: string, n: number): { from: string; to: string } {
  const [y, m] = d.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1 + n, 1));
  const e = new Date(Date.UTC(y, m + n, 0));
  return { from: s.toISOString().slice(0, 10), to: e.toISOString().slice(0, 10) };
}

export default function CrmBookingsPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="bookings">
      {(a) => <BookingsBody salonId={a.salonId} adminSalonQuery={adminSalonQuery} />}
    </CrmShell>
  );
}

const STATUS_OPTIONS: Array<[CrmBookingSearch['status'], string]> = [
  ['all', 'すべて'], ['active', 'キャンセル以外'], ['unconfirmed', '未確定'], ['cancelled', 'キャンセル'], ['bad', '悪質キャンセル'],
];

function BookingsBody({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const today = businessTodayJST();
  const [f, setF] = useState<CrmBookingSearch>({ from: monthStart(today), to: today, therapistId: null, status: 'all', source: '', q: '' });
  const [qInput, setQInput] = useState('');
  // 結果は「どの条件の結果か（key）」と一緒に持つ（条件が変わったら読み込み中として出す）
  const [res, setRes] = useState<{ key: string; rows: CrmBookingListRow[]; truncated: boolean; err: string } | null>(null);
  const [therapists, setTherapists] = useState<CrmTherapist[]>([]);

  useEffect(() => {
    getCrmTherapists(salonId).then((r) => { if (r.ok) setTherapists(r.therapists); });
  }, [salonId]);

  const fKey = JSON.stringify(f);
  useEffect(() => {
    let alive = true;
    searchCrmBookings(salonId, JSON.parse(fKey) as CrmBookingSearch).then((r) => {
      if (!alive) return;
      setRes(r.ok ? { key: fKey, rows: r.rows, truncated: r.truncated, err: '' } : { key: fKey, rows: [], truncated: false, err: r.error });
    });
    return () => { alive = false; };
  }, [salonId, fKey]);
  const rows = res && res.key === fKey ? res.rows : null;
  const truncated = !!res?.truncated;
  const err = res && res.key === fKey ? res.err : '';

  // 名前・電話は入力が止まって0.4秒で探す
  useEffect(() => {
    const t = setTimeout(() => setF((cur) => (cur.q === qInput ? cur : { ...cur, q: qInput })), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const list = rows ?? [];
  const active = list.filter((b) => b.status !== 'cancelled');
  const sales = active.reduce((a, b) => a + (b.priceTotal ?? 0), 0);
  const pay = active.reduce((a, b) => a + (b.payTotal ?? 0), 0);
  const cancels = list.length - active.length;
  const sel = 'border border-slate-300 bg-white px-2 py-1.5 text-[13px]';
  const sep = adminSalonQuery ? '&' : '?';

  return (
    <div className="mx-auto max-w-6xl px-3 py-4">
      {/* 条件 */}
      <div className="flex flex-wrap items-end gap-2 border border-slate-200 bg-white p-3">
        <div>
          <p className="text-[11px] font-bold text-slate-500">期間（営業日）</p>
          <div className="flex items-center gap-1">
            <input type="date" className={sel} value={f.from} onChange={(e) => e.target.value && setF({ ...f, from: e.target.value })} />
            <span className="text-slate-400">〜</span>
            <input type="date" className={sel} value={f.to} onChange={(e) => e.target.value && setF({ ...f, to: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setF({ ...f, ...shiftMonth(f.from, -1) })} className="bg-[#3f51b5] px-2 py-1.5 text-[12px] font-bold text-white">◀ 前月</button>
          <button type="button" onClick={() => setF({ ...f, from: monthStart(today), to: today })} className="bg-pink-400 px-2 py-1.5 text-[12px] font-bold text-white">今月</button>
          <button type="button" onClick={() => setF({ ...f, ...shiftMonth(f.from, 1) })} className="bg-[#3f51b5] px-2 py-1.5 text-[12px] font-bold text-white">次月 ▶</button>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500">担当</p>
          <select className={sel} value={f.therapistId == null ? '' : String(f.therapistId)} onChange={(e) => setF({ ...f, therapistId: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">全員</option>
            <option value="0">フリー（担当未定）</option>
            {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? '' : '（在籍なし）'}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500">状態</p>
          <select className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CrmBookingSearch['status'] })}>
            {STATUS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500">入り口</p>
          <select className={sel} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as CrmBookingSearch['source'] })}>
            <option value="">すべて</option>
            <option value="web">フクエス（ネット予約）</option>
            <option value="manual">店で受付</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <p className="text-[11px] font-bold text-slate-500">名前・電話番号（一部でも）</p>
          <input className={`${sel} w-full`} value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="例）田中／5678" inputMode="search" />
        </div>
      </div>

      {/* 合計 */}
      <p className="my-2 text-[13px] font-bold text-slate-700">
        {rows == null ? '探しています…' : (
          <>
            {list.length}件（キャンセル {cancels}件）／ 売上 <span className="text-[#3f51b5]">{yen(sales)}</span> ／ 女子報酬 <span className="text-[#3f51b5]">{yen(pay)}</span>
            {truncated && <span className="ml-2 text-amber-700">※ 1000件までしか出していません。期間や条件をしぼってください</span>}
          </>
        )}
      </p>
      {err && <p className="mb-2 text-[13px] font-bold text-rose-600">{err}</p>}

      {rows && list.length === 0 && !err && (
        <p className="border border-slate-200 bg-white p-8 text-center text-[14px] text-slate-400">この条件の予約はありません</p>
      )}
      {list.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">日時</th>
                <th className="px-2 py-2 text-left">担当</th>
                <th className="px-2 py-2 text-left">お客様</th>
                <th className="px-2 py-2 text-left">コース</th>
                <th className="px-2 py-2 text-left">状態</th>
                <th className="px-2 py-2 text-right">料金</th>
                <th className="px-2 py-2 text-right">報酬</th>
                <th className="px-2 py-2 text-left">受領</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((b) => {
                const cancelled = b.status === 'cancelled';
                return (
                  <tr key={b.id} className={cancelled ? 'text-slate-400' : ''}>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <Link href={`/mypage/crm${adminSalonQuery}${sep}date=${businessDateOf(b.slotStartISO)}`} className="font-bold text-indigo-600 hover:underline">
                        {dt(b.slotStartISO)}
                      </Link>
                      <span className="text-slate-400">〜{hm(b.slotEndISO)}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">{b.therapistName}</td>
                    <td className="px-2 py-1.5">
                      {b.customerId ? (
                        <Link href={`/mypage/crm/customers${adminSalonQuery}${sep}customer=${b.customerId}`} className="font-bold text-slate-800 hover:underline">
                          {b.customerName || '(名前なし)'}
                        </Link>
                      ) : (
                        <span>{b.customerName || '(名前なし)'}</span>
                      )}
                      {b.source === 'web' && <span className="ml-1 border border-pink-500 px-1 text-[10px] font-bold text-pink-600">ﾌｸｴｽ</span>}
                      {b.customerTel && <span className="ml-1 text-[11px] text-slate-400">{b.customerTel}</span>}
                    </td>
                    <td className="px-2 py-1.5">{b.courseName}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {cancelled
                        ? <span className={`px-1 text-[11px] font-bold text-white ${b.cancelBad ? 'bg-rose-600' : 'bg-slate-400'}`}>{b.cancelBad ? '悪質キャンセル' : 'キャンセル'}</span>
                        : b.status === 'new' ? <span className="bg-pink-500 px-1 text-[11px] font-bold text-white">未確定</span> : '確定'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{yen(b.priceTotal)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{yen(b.payTotal)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-[12px]">{b.receivedBy ? CRM_RECEIVED_LABEL[b.receivedBy as CrmReceivedBy] ?? '' : cancelled ? '' : '未受領'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
