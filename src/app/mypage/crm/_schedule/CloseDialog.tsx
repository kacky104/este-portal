'use client';

import { safeAction } from '../CrmBase';
import { useEffect, useState } from 'react';
import { closeCrmDay, getCrmDaySummary, reopenCrmDay } from '@/app/actions/crmClose';
import { addCrmMoneyMove, cancelCrmMoneyMove, getCrmMoneyDay } from '@/app/actions/crmMoney';
import { CRM_MONEY_CATEGORY_LABEL, CRM_MONEY_DIRECTION_LABEL, moneyBalanceLabel, type CrmMoneyDay, yen, type CrmDaySummary } from '@/app/lib/crm/types';
import { safeCall, dateLabel, useDialogFocus } from './shared';
import { fieldCls, labCls } from './BookingForm';

// ── 精算（金銭授受・第558便）──────────────────────────
// 報酬確定の画面の下。女子が受領した料金 − 報酬 を出し、渡した／払ったを記録する。
export function SettleBox({ salonId, therapistId, date }: { salonId: number; therapistId: number; date: string }) {
  const [day, setDay] = useState<CrmMoneyDay | null>(null);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    safeAction(getCrmMoneyDay(salonId, therapistId, date)).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setDay(r.day);
      setAmount(r.day.balance !== 0 ? String(Math.abs(r.day.balance)) : '');
    });
    return () => { alive = false; };
  }, [salonId, therapistId, date, tick]);

  if (!day) return <p className="border-t border-slate-200 pt-3 text-[13px] text-slate-400">{err || '精算を読み込み中…'}</p>;

  const toShop = day.balance >= 0;
  const add = async () => {
    const n = Math.round(Number(amount) || 0);
    if (n <= 0) { setErr('金額を入れてください'); return; }
    setBusy(true); setErr('');
    const r = await safeCall(() => addCrmMoneyMove(salonId, {
      therapistId, date, direction: toShop ? 'to_shop' : 'to_therapist', category: 'settle', amount: n, memo,
    }));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMemo('');
    setTick((t) => t + 1);
  };
  const undo = async (id: number) => {
    setBusy(true); setErr('');
    const r = await safeCall(() => cancelCrmMoneyMove(salonId, id));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-2 border-t-2 border-slate-200 pt-3">
      <p className="text-[14px] font-black text-slate-800">精算（お金のやりとり）</p>
      <div className="grid grid-cols-2 gap-px bg-slate-200 text-[13px]">
        {[
          ['前日までの残高', day.prior === 0 ? '0' : `${day.prior > 0 ? '+' : '−'}${yen(Math.abs(day.prior))}`],
          ['女子が受領した料金', yen(day.received)],
          [day.payConfirmed ? '報酬（確定）' : '報酬（見込み）', `−${yen(day.pay)}`],
          ['渡した／払った', (() => {
            const net = day.moves.filter((m) => !m.cancelledAt).reduce((a, m) => a + (m.direction === 'to_shop' ? -m.amount : m.amount), 0);
            return net === 0 ? '0' : `${net > 0 ? '+' : '−'}${yen(Math.abs(net))}`;
          })()],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1.5">
            <p className="text-[11px] font-bold text-slate-400">{k}</p>
            <p className="font-bold text-slate-800">{v}</p>
          </div>
        ))}
      </div>
      <p className={`px-3 py-2 text-[15px] font-black ${day.balance === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {day.balance === 0 ? '✓ 精算済み' : moneyBalanceLabel(day.balance)}
      </p>
      {!day.payConfirmed && day.pay > 0 && (
        <p className="text-[12px] text-slate-500">※ 報酬はまだ確定前の見込みです（手当は確定すると入ります）</p>
      )}
      {day.moves.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-200 text-[12px]">
          {day.moves.map((m) => (
            <li key={m.id} className={`flex items-center gap-2 px-2 py-1 ${m.cancelledAt ? 'text-slate-400 line-through' : ''}`}>
              <span>{CRM_MONEY_DIRECTION_LABEL[m.direction]}</span>
              <span>{CRM_MONEY_CATEGORY_LABEL[m.category]}</span>
              <span className="font-bold">{yen(m.amount)}</span>
              <span className="truncate text-slate-500">{m.memo}</span>
              {!m.cancelledAt && (
                <button type="button" disabled={busy} onClick={() => undo(m.id)} className="ml-auto border border-slate-300 px-1.5 text-[11px] font-bold text-slate-500 no-underline">取消</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {day.balance !== 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[120px]">
            <label className="mb-0.5 block text-[11px] font-bold text-slate-500">{toShop ? '受け取った額' : '払った額'}</label>
            <input className="w-full border border-slate-300 px-2 py-1.5 text-[14px]" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-0.5 block text-[11px] font-bold text-slate-500">メモ</label>
            <input className="w-full border border-slate-300 px-2 py-1.5 text-[14px]" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} placeholder="任意" />
          </div>
          <button type="button" disabled={busy} onClick={add} className={`px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50 ${toShop ? 'bg-[#3f51b5]' : 'bg-pink-500'}`}>
            {toShop ? '女子から受け取った' : '女子に払った'}
          </button>
        </div>
      )}
      {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
    </div>
  );
}

// ── 締め作業（日報） ─────────────────────────────────
export function CloseDialog({
  salonId, date, onClose, onDone,
}: {
  salonId: number;
  date: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const dlgRef = useDialogFocus<HTMLDivElement>();
  const [sum, setSum] = useState<CrmDaySummary | null>(null);
  const [expense, setExpense] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => {
    let alive = true;
    safeAction(getCrmDaySummary(salonId, date)).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setSum(r.summary);
      if (r.summary.report) {
        setExpense(r.summary.report.expense ? String(r.summary.report.expense) : '');
        setMemo(r.summary.report.memo);
      }
    });
    return () => { alive = false; };
  }, [salonId, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const ex = Math.max(0, Math.round(Number(expense) || 0));
  const doClose = async () => {
    setBusy(true); setErr('');
    const r = await safeCall(() => closeCrmDay(salonId, date, ex, memo));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };
  const doReopen = async () => {
    setBusy(true); setErr('');
    const r = await safeCall(() => reopenCrmDay(salonId, date));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };

  const rep = sum?.report ?? null;
  const changed = rep && sum && (rep.sales !== sum.sales || rep.pay !== sum.pay || rep.bookingCount !== sum.bookingCount);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div ref={dlgRef} role="dialog" aria-modal="true" aria-label={`締め作業（日報）：${dateLabel(date)}`} tabIndex={-1} className="pointer-events-auto max-h-[92dvh] w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl outline-none">
          <div className="flex items-center bg-[#1e2a5a] px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">締め作業（日報）：{dateLabel(date)}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          {!sum ? (
            <p className="p-6 text-center text-[14px] text-slate-400">{err || '集計しています…'}</p>
          ) : (
            <div className="space-y-3 p-4">
              {rep && (
                <p className={`px-3 py-2 text-[13px] font-bold ${changed ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                  {changed ? '⚠ 締めたあとに予約・報酬が変わっています。下の「締め直す」で今の数字に直せます。' : '✓ この日は締め済みです。'}
                </p>
              )}
              {sum.unconfirmed.length > 0 && (
                <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
                  報酬をまだ確定していない人：{sum.unconfirmed.join('・')}
                </p>
              )}
              {sum.unreceived > 0 && (
                <p className="border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">
                  未受領の予約が {sum.unreceived} 件あります（締めることはできます）
                </p>
              )}
              {sum.unsettled.length > 0 && (
                <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
                  お金の精算が残っている人：{sum.unsettled.join('・')}（金銭授受タブで見られます）
                </p>
              )}
              {sum.freeUnassigned > 0 && (
                <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
                  担当が決まっていない予約が {sum.freeUnassigned} 本あります
                </p>
              )}
              <div className="grid grid-cols-3 gap-px bg-slate-200 text-center">
                {[
                  ['本数', `${sum.bookingCount}本`],
                  ['キャンセル', `${sum.cancelCount}本`],
                  ['出勤', `${sum.workingCount}人`],
                  ['売上', yen(sum.sales)],
                  ['うち現金', yen(sum.cashSales)],
                  ['女子報酬', yen(sum.pay)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white py-2">
                    <p className="text-[11px] font-bold text-slate-400">{k}</p>
                    <p className="text-[16px] font-black text-slate-800">{v}</p>
                  </div>
                ))}
              </div>
              {sum.allowance !== 0 && <p className="text-[12px] text-slate-500">女子報酬には、確定のときの手当 {yen(sum.allowance)} を含みます</p>}
              {/* ★ 第1454便 */}
              {sum.pointsCount > 0 && (
                <p className="text-[12px] text-slate-500">
                  フクエスポイントの利用 {sum.pointsCount}件 −{yen(sum.pointsYen)}（フクエス負担）。売上・女子報酬はそのまま、「うち現金」からは引いています。月の請求書でフクエスが差し引きます。
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labCls}>経費（円）</label>
                  <input className={fieldCls} inputMode="numeric" value={expense} onChange={(e) => setExpense(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-[12px] font-bold text-slate-500">利益（売上 − 報酬 − 経費）</p>
                  <p className={`text-[20px] font-black ${sum.sales - sum.pay - ex < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{yen(sum.sales - sum.pay - ex)}</p>
                </div>
              </div>
              <div>
                <label className={labCls}>メモ</label>
                <textarea className={`${fieldCls} min-h-[64px]`} maxLength={1000} value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
              {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={doClose} className="flex-1 bg-[#1e2a5a] py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
                  {rep ? 'いまの数字で締め直す' : 'この内容で締める'}
                </button>
                {rep && (
                  sure ? (
                    <button type="button" disabled={busy} onClick={doReopen} className="bg-rose-600 px-3 text-[13px] font-bold text-white">本当に取り消す</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => setSure(true)} className="border border-slate-300 bg-white px-3 text-[13px] font-bold text-slate-600">締めを取り消す</button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
