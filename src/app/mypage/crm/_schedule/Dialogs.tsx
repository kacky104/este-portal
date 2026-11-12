'use client';

import { useEffect, useState } from 'react';
import { confirmCrmPay, saveCrmTherapistMemo, unconfirmCrmPay } from '@/app/actions/crm';
import { inBusinessDay, yen, type CrmPayConfirm, type CrmScheduleBooking, type CrmScheduleTherapist } from '@/app/lib/crm/types';
import { safeCall, hm, useDialogFocus } from './shared';
import { fieldCls, labCls } from './BookingForm';
import { SettleBox } from './CloseDialog';

// ── 女子メモの編集 ─────────────────────────────────────
export function MemoDialog({
  therapist, salonId, onClose, onSaved,
}: {
  therapist: CrmScheduleTherapist;
  salonId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dlgRef = useDialogFocus<HTMLDivElement>();
  const [text, setText] = useState(therapist.memo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const save = async () => {
    setBusy(true);
    setErr('');
    const res = await safeCall(() => saveCrmTherapistMemo(salonId, therapist.id, text));
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div ref={dlgRef} role="dialog" aria-modal="true" aria-label={`女子メモ：${therapist.name}`} tabIndex={-1} className="pointer-events-auto w-full max-w-[460px] bg-white shadow-2xl outline-none">
          <div className="flex items-center bg-amber-500 px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">女子メモ：{therapist.name}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          <div className="p-4">
            <p className="mb-2 text-[12px] leading-relaxed text-slate-500">
              お店の中だけのメモです（お客様・女子本人には見えません）。日付に関係なく、この人にずっと残ります。
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              autoFocus
              placeholder={'例）交通費1000\n送迎（姪浜）\nLルームNG'}
              className="min-h-[160px] w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-amber-400 focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-slate-400">{text.length}/500</p>
            {err && <p className="mt-1 text-[13px] font-bold text-rose-600">{err}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={save} className="flex-1 bg-amber-500 py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
                {busy ? '保存中…' : '保存する'}
              </button>
              <button type="button" disabled={busy} onClick={onClose} className="border border-slate-300 bg-white px-4 text-[14px] font-bold text-slate-600">
                やめる
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 報酬確定 ───────────────────────────────────────
export function ConfirmDialog({
  therapist, salonId, date, baseMs, bookings, confirm, transport, onClose, onDone, moneyEnabled,
}: {
  /** ★ 第1415便: 金銭授受を使うか。false なら下の精算欄を出さない */
  moneyEnabled: boolean;
  /** 出勤情報の交通費（まだ確定していないときの手当の初期値・第550便） */
  transport: number;
  therapist: CrmScheduleTherapist;
  salonId: number;
  date: string;
  baseMs: number;
  bookings: CrmScheduleBooking[];
  confirm: CrmPayConfirm | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const dlgRef = useDialogFocus<HTMLDivElement>();
  const [allowance, setAllowance] = useState(confirm ? String(confirm.allowance || '') : transport ? String(transport) : '');
  const [note, setNote] = useState(confirm?.note ?? (transport ? `交通費${transport}` : ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const mine = bookings
    .filter((b) => b.status !== 'cancelled' && inBusinessDay(Math.round((new Date(b.slotStartISO).getTime() - baseMs) / 60000)))
    .sort((a, b) => a.slotStartISO.localeCompare(b.slotStartISO));
  const pay = mine.reduce((a, b) => a + (b.payTotal ?? 0), 0);
  const al = Math.round(Number(allowance) || 0);
  const noPrice = mine.filter((b) => b.payTotal == null).length;
  // ★ 2026-10-09 点検#15: 料金はあるのに報酬が 0円の予約（かんたん受付で報酬を空にしたなど）
  const zeroPay = mine.filter((b) => b.payTotal === 0 && (b.priceTotal ?? 0) > 0).length;

  const doConfirm = async () => {
    setBusy(true); setErr('');
    const r = await safeCall(() => confirmCrmPay(salonId, therapist.id, date, al, note));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };
  const doUndo = async () => {
    setBusy(true); setErr('');
    const r = await safeCall(() => unconfirmCrmPay(salonId, therapist.id, date));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div ref={dlgRef} role="dialog" aria-modal="true" aria-label={`報酬確定：${therapist.name}`} tabIndex={-1} className="pointer-events-auto max-h-[92dvh] w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl outline-none">
          <div className="flex items-center bg-emerald-600 px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">報酬確定：{therapist.name}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          <div className="space-y-3 p-4">
            {confirm && (
              <p className="bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-800">
                確定済み：{confirm.bookingCount}本・報酬 {yen(confirm.payTotal)}{confirm.allowance ? `＋手当 ${yen(confirm.allowance)}` : ''} ＝ {yen(confirm.payTotal + confirm.allowance)}
              </p>
            )}
            {/* ★ 2026-10-09 点検（レイアウト）: 行の「⚠変更あり」は title だけでスマホでは理由が読めない → 小窓にも同じ文を出す */}
            {confirm && (confirm.payTotal !== pay || confirm.bookingCount !== mine.length) && (
              <p className="bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
                確定のあとに予約が変わっています（いま {mine.length}本・報酬 {yen(pay)}）。「いまの内容で確定し直す」を押すと今の数字になります。
              </p>
            )}
            <div>
              <p className="mb-1 text-[12px] font-bold text-slate-500">この日の予約（{mine.length}本）</p>
              {mine.length === 0 ? (
                <p className="text-[13px] text-slate-400">予約はありません</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 text-[13px]">
                  {mine.map((b) => (
                    <li key={b.id} className="flex gap-2 px-2 py-1.5">
                      <span className="font-bold">{hm(b.slotStartISO)}</span>
                      <span className="truncate">{b.customer?.name || b.customerName}</span>
                      <span className="truncate text-slate-500">{b.courseName}</span>
                      <span className={`ml-auto font-bold ${b.payTotal == null ? 'text-amber-600' : ''}`}>{b.payTotal == null ? '料金未入力' : yen(b.payTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {noPrice > 0 && <p className="mt-1 text-[12px] font-bold text-amber-700">料金・報酬がまだ入っていない予約が {noPrice} 本あります（0円で数えます）</p>}
              {zeroPay > 0 && <p className="mt-1 text-[12px] font-bold text-amber-700">料金はあるのに女子報酬が 0円の予約が {zeroPay} 本あります（カードの「変更する」で入れられます）</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labCls}>手当・交通費など（±円）</label>
                <input className={fieldCls} inputMode="numeric" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^0-9-]/g, ''))} placeholder="0" />
              </div>
              <div>
                <label className={labCls}>一言</label>
                <input className={fieldCls} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="例）交通費1000" />
              </div>
            </div>
            <p className="border-t border-slate-200 pt-2 text-[17px] font-black text-slate-800">
              お渡しする報酬 {yen(pay + al)}
              <span className="ml-2 text-[12px] font-bold text-slate-500">（予約の報酬 {yen(pay)}{al ? ` ＋ 手当 ${yen(al)}` : ''}）</span>
            </p>
            {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={doConfirm} className="flex-1 bg-emerald-600 py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
                {confirm ? 'いまの内容で確定し直す' : 'この内容で確定する'}
              </button>
              {confirm && (
                sure ? (
                  <button type="button" disabled={busy} onClick={doUndo} className="bg-rose-600 px-3 text-[13px] font-bold text-white">本当に取り消す</button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setSure(true)} className="border border-slate-300 bg-white px-3 text-[13px] font-bold text-slate-600">確定を取り消す</button>
                )
              )}
            </div>
            {moneyEnabled && <SettleBox salonId={salonId} therapistId={therapist.id} date={date} />}
          </div>
        </div>
      </div>
    </>
  );
}
