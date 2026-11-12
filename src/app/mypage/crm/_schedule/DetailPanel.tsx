'use client';

import Link from 'next/link';
import { useCrmLinks } from '../CrmBase';
import { useEffect, useState } from 'react';
import { setCrmCancelBad, setCrmPlayStatus, setCrmReceived } from '@/app/actions/crm';
import { deleteBooking, updateBookingStatus } from '@/app/actions/booking';
import { CRM_CATEGORY_CLASS, CRM_CATEGORY_LABEL, paymentLabel, CRM_PLAY_LABEL, CRM_RECEIVED_LABEL, type CrmReceivedBy, type CrmPlayStatus, yen, type CrmScheduleBooking, type CrmScheduleData } from '@/app/lib/crm/types';
import { ConsentView } from '../ConsentView';
import { MessageMenu } from '../MessageMenu';
import { GroupHitBand } from '../GroupShare';
import { safeCall, hm, useDialogFocus, useDragMove } from './shared';

export function DetailPanel({
  booking: b, therapistName, salonId, adminSalonQuery, scheduleData, onClose, onChanged, onDone, onEdit,
}: {
  booking: CrmScheduleBooking;
  therapistName: string;
  salonId: number;
  adminSalonQuery: string;
  /** ★ 第1947便: 連絡文の差し込み（部屋・出勤情報の項目）に使う */
  scheduleData: CrmScheduleData | null;
  onClose: () => void;
  onChanged: (b: CrmScheduleBooking) => void;
  /** 状態を変えた・消した → 閉じて読み直す */
  onDone: () => void;
  onEdit: () => void;
}) {
  const dlgRef = useDialogFocus<HTMLElement>();
  const drag = useDragMove(); // ★ 第1790便: 見出しの帯をつかんで動かす
  const crm = useCrmLinks();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 取り返しのつきにくい操作は2回押し（ダイアログは出さない）
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setErr('');
    const res = await safeCall(fn);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'うまくいきませんでした'); return; }
    onDone();
  };
  const c = b.customer;
  const ng = b.therapistId != null && (c?.ngTherapistIds.includes(b.therapistId) ?? false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const toggleBad = async () => {
    setBusy(true);
    setErr('');
    const res = await safeCall(() => setCrmCancelBad(salonId, b.id, !b.cancelBad));
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onChanged({ ...b, cancelBad: !b.cancelBad });
  };

  const ledgerHref = c
    ? `${crm.href('/customers')}${adminSalonQuery ? `${adminSalonQuery}&` : '?'}customer=${c.id}`
    : '';

  return (
    <>
      {/* ★ 詳細も中央に出す（2026-09-19・カッキーさんの指示・受付フォームとそろえる） */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
      <aside ref={dlgRef} role="dialog" aria-modal="true" aria-label="お客様と予約" tabIndex={-1} style={drag.style} className="pointer-events-auto max-h-[92dvh] w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl outline-none">
        <div {...drag.handle} className={`flex items-center bg-[#b3b8e6] px-4 py-2.5 ${drag.handleCls}`}>
          <span className="text-[15px] font-black text-slate-800">お客様と予約</span>
          <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold text-slate-700" aria-label="閉じる">×</button>
        </div>

        {/* お客様 */}
        <section className="border-b border-slate-200 p-4">
          {/* ★ 第1325便: グループ・提携店の共有リストに当たった予約（★ 台帳にひも付いていない予約でも出す） */}
          <GroupHitBand hits={b.groupHits} className="mb-3" />
          {c ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`border px-1.5 py-0.5 text-[11px] font-bold leading-none ${CRM_CATEGORY_CLASS[c.category]}`}>{CRM_CATEGORY_LABEL[c.category]}</span>
                <span className="text-[18px] font-black text-slate-800">{c.name || b.customerName || '(名前なし)'}</span>
              </div>
              {c.cautionMemo && (
                <p className="mt-2 whitespace-pre-line border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">要注意：{c.cautionMemo}</p>
              )}
              {ng && <p className="mt-2 bg-rose-600 px-3 py-1.5 text-[13px] font-bold text-white">担当の {therapistName} さんは、このお客様の女子NGです</p>}
              <div className="mt-2 grid grid-cols-4 gap-px bg-slate-200 text-center">
                {[
                  ['利用', c.stats.visits],
                  ['予約中', c.stats.upcoming],
                  ['ｷｬﾝｾﾙ', c.stats.cancels],
                  ['悪質', c.stats.badCancels],
                ].map(([k, v]) => (
                  <div key={String(k)} className="bg-white py-1.5">
                    <p className="text-[10px] font-bold text-slate-400">{k}</p>
                    <p className={`text-[15px] font-black ${k === '悪質' && Number(v) > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{v}</p>
                  </div>
                ))}
              </div>
              <Link href={ledgerHref} className="mt-3 inline-block bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">
                顧客台帳で開く（編集・履歴）
              </Link>
            </>
          ) : (
            <>
              <p className="text-[18px] font-black text-slate-800">{b.customerName || '(名前なし)'}</p>
              <p className="mt-1 text-[12px] text-slate-500">電話番号が無い（または形が違う）ため、顧客台帳にはひも付いていません。</p>
            </>
          )}
        </section>

        {/* 予約 */}
        <section className="p-4">
          <dl className="grid grid-cols-[6em_1fr] gap-y-1.5 text-[14px]">
            <dt className="font-bold text-slate-400">時間</dt>
            <dd className="font-bold text-slate-800">{hm(b.slotStartISO)}〜{hm(b.slotEndISO)}</dd>
            <dt className="font-bold text-slate-400">担当</dt>
            <dd className={ng ? 'font-bold text-rose-600' : 'text-slate-800'}>{therapistName}</dd>
            <dt className="font-bold text-slate-400">コース</dt>
            <dd className="text-slate-800">{b.courseName || '—'}{b.courseMin ? `（${b.courseMin}分）` : ''}</dd>
            <dt className="font-bold text-slate-400">料金</dt>
            <dd className="font-bold text-slate-800">
              {yen(b.priceTotal)}{b.paymentMethod ? <span className="ml-1 text-[12px] font-normal text-slate-500">（{paymentLabel(b.paymentMethod, b.paymentSplit)}）</span> : null}
            </dd>
            {/* ★ 第1454便: フクエスポイント（フクエス負担）。売上・女子報酬は変えない。受け取る額だけ少なくなる */}
            {b.pointsYen > 0 && (
              <>
                <dt className="font-bold text-slate-400">ポイント</dt>
                <dd>
                  <span className="inline-block bg-orange-500 px-1.5 py-0.5 text-[12px] font-bold text-white">フクエスポイント −{b.pointsYen.toLocaleString()}円（フクエス負担）</span>
                  <p className="mt-1 text-[13px] text-slate-700">
                    お客様から受け取る額：<b>{b.priceTotal != null ? yen(Math.max(0, b.priceTotal - b.pointsYen)) : `料金から ${b.pointsYen.toLocaleString()}円 引いた額`}</b>
                  </p>
                  <p className="text-[11px] leading-relaxed text-slate-500">売上・女子報酬は変わりません。{b.pointsYen.toLocaleString()}円は月の請求書でフクエスが差し引きます。</p>
                </dd>
              </>
            )}
            <dt className="font-bold text-slate-400">女子報酬</dt>
            <dd className="font-bold text-slate-800">{yen(b.payTotal)}</dd>
            {b.items.length > 0 && (
              <>
                <dt className="font-bold text-slate-400">内訳</dt>
                <dd className="text-[12px] text-slate-600">
                  {b.items.map((it, i) => (
                    <span key={i} className="mr-2 inline-block">
                      {it.name}{it.kind === 'discount' ? `（-${it.price.toLocaleString()}）` : `（${it.price.toLocaleString()}）`}
                    </span>
                  ))}
                  {b.priceAdjust !== 0 && <span className="mr-2 inline-block">料金補正 {b.priceAdjust > 0 ? '+' : ''}{b.priceAdjust.toLocaleString()}</span>}
                  {b.payAdjust !== 0 && <span className="mr-2 inline-block">報酬補正 {b.payAdjust > 0 ? '+' : ''}{b.payAdjust.toLocaleString()}</span>}
                </dd>
              </>
            )}
            <dt className="font-bold text-slate-400">電話</dt>
            {/* ★ 第1228便: 電話番号を押すと電話をかけられる（折り返し1タップ） */}
            <dd className="text-slate-800">{b.customerTel ? <a href={`tel:${b.customerTel.replace(/[^0-9+]/g, '')}`} className="text-[#3f51b5] underline decoration-dotted underline-offset-2">{b.customerTel}</a> : '—'}</dd>
            <dt className="font-bold text-slate-400">状態</dt>
            <dd className="text-slate-800">
              {b.status === 'cancelled' ? (b.cancelBad ? '悪質キャンセル' : 'キャンセル') : b.status === 'new' ? '未確定（ネット予約）' : '確定'}
            </dd>
            {b.status !== 'cancelled' && (
              <>
                <dt className="font-bold text-slate-400">状況</dt>
                <dd>
                  <div className="flex flex-wrap gap-1">
                    {(['', 'address_sent', 'entered'] as CrmPlayStatus[]).map((ps) => {
                      const on = (b.playStatus || '') === ps;
                      const onCls = ps === 'entered' ? 'bg-yellow-300 text-slate-900 border-yellow-400' : ps === 'address_sent' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-600 text-white border-slate-600';
                      return (
                        <button
                          key={ps || 'none'}
                          type="button"
                          disabled={busy || on}
                          onClick={async () => {
                            setBusy(true); setErr('');
                            const r = await safeCall(() => setCrmPlayStatus(salonId, b.id, ps));
                            setBusy(false);
                            if (!r.ok) { setErr(r.error); return; }
                            onChanged({ ...b, playStatus: ps });
                          }}
                          className={`border px-2 py-0.5 text-[12px] font-bold ${on ? onCls : 'border-slate-300 bg-white text-slate-600'}`}
                        >
                          {CRM_PLAY_LABEL[ps]}
                        </button>
                      );
                    })}
                  </div>
                </dd>
                {/* 受領（お金を受け取ったか・誰が受け取ったか）（第554便） */}
                <dt className="font-bold text-slate-400">受領</dt>
                <dd>
                  <div className="flex flex-wrap gap-1">
                    {(['', 'therapist', 'shop'] as CrmReceivedBy[]).map((rb) => {
                      const on = (b.receivedBy || '') === rb;
                      const onCls = rb ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-600 text-white border-slate-600';
                      return (
                        <button
                          key={rb || 'none'}
                          type="button"
                          disabled={busy || on}
                          onClick={async () => {
                            setBusy(true); setErr('');
                            const r = await safeCall(() => setCrmReceived(salonId, b.id, rb));
                            setBusy(false);
                            if (!r.ok) { setErr(r.error); return; }
                            onChanged({ ...b, receivedBy: rb });
                          }}
                          className={`border px-2 py-0.5 text-[12px] font-bold ${on ? onCls : 'border-slate-300 bg-white text-slate-600'}`}
                        >
                          {CRM_RECEIVED_LABEL[rb]}
                        </button>
                      );
                    })}
                  </div>
                </dd>
              </>
            )}
            {/* 同意書（第560便） */}
            <dt className="font-bold text-slate-400">同意書</dt>
            <dd><ConsentView
              salonId={salonId}
              bookingId={b.id}
              consentAt={b.consentAt}
              bookingLabel={`${new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(b.slotStartISO))} ${hm(b.slotStartISO)}〜${hm(b.slotEndISO)}`}
              therapistName={therapistName}
              customerName={b.customer?.name || b.customerName}
              onManualChanged={b.status === 'cancelled' ? undefined : (at) => onChanged({ ...b, consentAt: at })}
            /></dd>
            {/* 入り口（第555便で戻す）：フクエスのネット予約は仮で枠が埋まるので、担当が見分けられるように */}
            <dt className="font-bold text-slate-400">入り口</dt>
            <dd>
              {b.source === 'web'
                ? <span className="bg-pink-500 px-1.5 py-0.5 text-[12px] font-bold text-white">フクエス（ネット予約）</span>
                : <span className="text-slate-800">店で受付</span>}
            </dd>
            <dt className="font-bold text-slate-400">備考</dt>
            <dd className="whitespace-pre-line text-slate-800">{b.note || '—'}</dd>
          </dl>
          {/* 操作 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {/* ★ 第1947便: 連絡文のひな形（無いお店には出ない） */}
            {b.status !== 'cancelled' && <MessageMenu salonId={salonId} booking={b} data={scheduleData} />}
            {b.status !== 'cancelled' && (
              <button type="button" disabled={busy} onClick={onEdit} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">
                変更する
              </button>
            )}
            {b.status === 'new' && (
              <button type="button" disabled={busy} onClick={() => run(() => updateBookingStatus(b.id, 'confirmed'))} className="bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">
                確定にする
              </button>
            )}
            {b.status !== 'cancelled' && (
              confirming === 'cancel' ? (
                <button type="button" disabled={busy} onClick={() => run(() => updateBookingStatus(b.id, 'cancelled'))} className="bg-rose-600 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">
                  もう一度押すとキャンセル
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirming('cancel')} className="border border-rose-300 bg-white px-3 py-1.5 text-[13px] font-bold text-rose-600 disabled:opacity-50">
                  キャンセルにする
                </button>
              )
            )}
            {b.status === 'cancelled' && (
              <>
                <button type="button" disabled={busy} onClick={toggleBad} className="border border-rose-300 bg-white px-3 py-1.5 text-[13px] font-bold text-rose-600 disabled:opacity-50">
                  {b.cancelBad ? '悪質を外す' : '悪質キャンセルにする'}
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => updateBookingStatus(b.id, 'confirmed'))} className="border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-600 disabled:opacity-50">
                  キャンセルを取り消す
                </button>
              </>
            )}
          </div>
          <div className="mt-3">
            {confirming === 'delete' ? (
              <button type="button" disabled={busy} onClick={() => run(() => deleteBooking(b.id))} className="bg-slate-700 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                もう一度押すと削除（元に戻せません）
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirming('delete')} className="text-[12px] font-bold text-slate-400 underline">
                誤って入れた予約を削除する
              </button>
            )}
          </div>
          {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
          <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
            ふだんは削除ではなくキャンセルにしてください（キャンセルの記録がお客様の台帳に残ります）。
          </p>
        </section>
      </aside>
      </div>
    </>
  );
}
