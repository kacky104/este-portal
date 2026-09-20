'use client';

import { useCallback, useEffect, useState } from 'react';
import { addCrmMoneyMove, cancelCrmMoneyMove, getCrmMoney } from '@/app/actions/crm';
import {
  CRM_MONEY_CATEGORIES,
  CRM_MONEY_CATEGORY_LABEL,
  CRM_MONEY_DIRECTION_LABEL,
  moneyBalanceLabel,
  yen,
  type CrmMoneyBalance,
  type CrmMoneyCategory,
  type CrmMoneyDirection,
  type CrmMoneyMove,
} from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';

// フクエスCRM「金銭授受」（第558便・2026-09-20）。★ 風俗CTIv2 の金銭授受履歴にあたる。
//   上：女子ごとの残高（通算）＝ 女子が受領した料金 − 報酬 − 女子→お店 ＋ お店→女子
//   下：月ごとのお金の動き（取り消しは消さずに線を引く）。釣銭・前借りなどはここから手で入れる。

function businessTodayJST(): string {
  return new Date(Date.now() + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
}
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${'日月火水木金土'[d.getUTCDay()]}）`;
}
function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export default function CrmMoneyPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="money">
      {(a) => <MoneyBody salonId={a.salonId} />}
    </CrmShell>
  );
}

function MoneyBody({ salonId }: { salonId: number }) {
  const [ym, setYm] = useState(() => businessTodayJST().slice(0, 7));
  const [balances, setBalances] = useState<CrmMoneyBalance[] | null>(null);
  const [moves, setMoves] = useState<CrmMoneyMove[]>([]);
  const [therapists, setTherapists] = useState<{ id: number; name: string }[]>([]);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    getCrmMoney(salonId, ym).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); setBalances([]); return; }
      setErr('');
      setBalances(r.balances);
      setMoves(r.moves);
      setTherapists(r.therapists);
    });
    return () => { alive = false; };
  }, [salonId, ym, tick]);

  const shown = (balances ?? []).filter((b) => showAll || b.balance !== 0);
  const totalIn = (balances ?? []).filter((b) => b.balance > 0).reduce((a, b) => a + b.balance, 0);
  const totalOut = (balances ?? []).filter((b) => b.balance < 0).reduce((a, b) => a - b.balance, 0);
  const th = 'px-2 py-2 text-right text-[11px] font-bold text-slate-500';
  const td = 'px-2 py-2 text-right';

  const undo = async (id: number) => {
    const r = await cancelCrmMoneyMove(salonId, id);
    if (!r.ok) { setErr(r.error); return; }
    reload();
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-4">
      <h1 className="mb-1 text-[20px] font-black text-slate-800">金銭授受</h1>
      <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
        女子が受領した料金 − 女子の報酬 − 女子→お店に渡した額 ＋ お店→女子に払った額 ＝ 残高。
        ＋はお店が受け取る側、−はお店が払う側です。ふだんの精算はスケジュールの「報酬確定」の画面からできます。
      </p>

      {/* 残高 */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="text-[15px] font-black text-slate-800">女子ごとの残高</span>
        <span className="text-[13px] font-bold text-slate-600">お店が受け取る 合計 <span className="text-[#3f51b5]">{yen(totalIn)}</span></span>
        <span className="text-[13px] font-bold text-slate-600">お店が払う 合計 <span className="text-pink-600">{yen(totalOut)}</span></span>
        <label className="ml-auto flex items-center gap-1 text-[12px] font-bold text-slate-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          精算済みの人も出す
        </label>
      </div>
      {err && <p className="mb-2 text-[13px] font-bold text-rose-600">{err}</p>}
      {!balances ? (
        <p className="p-6 text-center text-[14px] text-slate-400">読み込み中です…</p>
      ) : shown.length === 0 ? (
        <p className="mb-4 border border-slate-200 bg-white p-6 text-center text-[14px] text-slate-400">精算が残っている人はいません</p>
      ) : (
        <div className="mb-5 overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">女子</th>
                <th className={th}>受領した料金</th>
                <th className={th}>報酬</th>
                <th className={th}>女子→お店</th>
                <th className={th}>お店→女子</th>
                <th className={th}>残高</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((b) => (
                <tr key={b.therapistId}>
                  <td className="whitespace-nowrap px-2 py-2 font-bold text-slate-800">{b.name}</td>
                  <td className={td}>{yen(b.received)}</td>
                  <td className={td}>{yen(b.pay)}</td>
                  <td className={td}>{yen(b.toShop)}</td>
                  <td className={td}>{yen(b.toTherapist)}</td>
                  <td className={`${td} whitespace-nowrap font-black ${b.balance > 0 ? 'text-[#3f51b5]' : b.balance < 0 ? 'text-pink-600' : 'text-emerald-700'}`}>
                    {moneyBalanceLabel(b.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddMoveForm salonId={salonId} therapists={therapists} onDone={reload} />

      {/* 動きの履歴 */}
      <div className="mb-2 mt-5 flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-black text-slate-800">{ym.slice(0, 4)}年{Number(ym.slice(5, 7))}月の動き</span>
        <div className="flex">
          <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">◀ 前月</button>
          <button type="button" onClick={() => setYm(businessTodayJST().slice(0, 7))} className="bg-pink-400 px-3 py-1.5 text-[13px] font-bold text-white">今月</button>
          <button type="button" onClick={() => setYm(shiftMonth(ym, 1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">次月 ▶</button>
        </div>
      </div>
      {moves.length === 0 ? (
        <p className="border border-slate-200 bg-white p-6 text-center text-[14px] text-slate-400">この月の動きはまだありません</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[700px] text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">営業日</th>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">女子</th>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">向き</th>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">種別</th>
                <th className={th}>金額</th>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">メモ</th>
                <th className="px-2 py-2 text-left text-[11px] font-bold text-slate-500">登録</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {moves.map((m) => (
                <tr key={m.id} className={m.cancelledAt ? 'text-slate-400' : ''}>
                  <td className="whitespace-nowrap px-2 py-2 font-bold">{dayLabel(m.date)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{m.therapistName}</td>
                  <td className={`whitespace-nowrap px-2 py-2 font-bold ${m.cancelledAt ? '' : m.direction === 'to_shop' ? 'text-[#3f51b5]' : 'text-pink-600'}`}>{CRM_MONEY_DIRECTION_LABEL[m.direction]}</td>
                  <td className="whitespace-nowrap px-2 py-2">{CRM_MONEY_CATEGORY_LABEL[m.category]}</td>
                  <td className={`${td} font-bold ${m.cancelledAt ? 'line-through' : ''}`}>{yen(m.amount)}</td>
                  <td className="max-w-[200px] truncate px-2 py-2 text-slate-500" title={m.memo}>{m.memo}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-[12px] text-slate-400">{timeLabel(m.createdAt)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {m.cancelledAt ? (
                      <span className="text-[11px] font-bold">取消 {timeLabel(m.cancelledAt)}</span>
                    ) : (
                      <UndoButton onUndo={() => undo(m.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UndoButton({ onUndo }: { onUndo: () => void }) {
  const [sure, setSure] = useState(false);
  return sure ? (
    <button type="button" onClick={onUndo} className="bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">本当に取り消す</button>
  ) : (
    <button type="button" onClick={() => setSure(true)} className="border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">取消</button>
  );
}

function AddMoveForm({ salonId, therapists, onDone }: { salonId: number; therapists: { id: number; name: string }[]; onDone: () => void }) {
  const [therapistId, setTherapistId] = useState('');
  const [date, setDate] = useState(() => businessTodayJST());
  const [direction, setDirection] = useState<CrmMoneyDirection>('to_therapist');
  const [category, setCategory] = useState<CrmMoneyCategory>('change');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const save = async () => {
    setBusy(true); setErr(''); setOk('');
    const r = await addCrmMoneyMove(salonId, {
      therapistId: Number(therapistId), date, direction, category, amount: Number(amount), memo,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setAmount(''); setMemo(''); setOk('記録しました');
    onDone();
  };

  const field = 'w-full border border-slate-300 bg-white px-2 py-1.5 text-[14px]';
  const lab = 'mb-0.5 block text-[11px] font-bold text-slate-500';
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-[14px] font-black text-slate-800">動きを手で入れる（釣銭の前渡し・前借りなど）</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <div className="col-span-2 md:col-span-1">
          <label className={lab}>女子</label>
          <select className={field} value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
            <option value="">選ぶ</option>
            {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lab}>営業日</label>
          <input type="date" className={field} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div>
          <label className={lab}>向き</label>
          <select className={field} value={direction} onChange={(e) => setDirection(e.target.value as CrmMoneyDirection)}>
            <option value="to_therapist">{CRM_MONEY_DIRECTION_LABEL.to_therapist}</option>
            <option value="to_shop">{CRM_MONEY_DIRECTION_LABEL.to_shop}</option>
          </select>
        </div>
        <div>
          <label className={lab}>種別</label>
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value as CrmMoneyCategory)}>
            {CRM_MONEY_CATEGORIES.map((c) => <option key={c} value={c}>{CRM_MONEY_CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <div>
          <label className={lab}>金額</label>
          <input className={field} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className={lab}>メモ</label>
          <input className={field} value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} placeholder="任意" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={busy} onClick={save} className="bg-[#3f51b5] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">記録する</button>
        {err && <span className="text-[13px] font-bold text-rose-600">{err}</span>}
        {ok && <span className="text-[13px] font-bold text-emerald-700">{ok}</span>}
      </div>
    </div>
  );
}
