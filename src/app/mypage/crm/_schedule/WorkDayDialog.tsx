'use client';

import { useEffect, useState } from 'react';
import { saveCrmWorkDay } from '@/app/actions/crm';
import { CRM_END_LABEL, type CrmEndType, CRM_ATTENDANCE, CRM_ATTENDANCE_LABEL, type CrmPartnerRoom, type CrmToggle, type CrmAttendance, type CrmWorkDay, type CrmScheduleTherapist } from '@/app/lib/crm/types';
import { shiftRangeText } from '@/lib/scheduleFormat';
import { safeCall, dateLabel, hourLabel, useDialogFocus } from './shared';
import { fieldCls, labCls } from './BookingForm';

// ── 出勤情報（名前を押す・第550便）────────────────────
export function WorkDayDialog({
  therapist, salonId, date, rooms, partnerRooms, toggleDefs, endType, initial, onClose, onSaved, onConfirm, onToggleEnd,
}: {
  therapist: CrmScheduleTherapist;
  salonId: number;
  date: string;
  rooms: string[];
  /** ★ 第1669便: 提携店の部屋（部屋共有のグループに入っているときだけ） */
  partnerRooms: CrmPartnerRoom[];
  toggleDefs: CrmToggle[];
  endType: CrmEndType;
  initial: CrmWorkDay;
  onClose: () => void;
  onSaved: () => void;
  onConfirm: (savedTransport: number) => void;
  /** ★ 点検（低 P）: 表のバッジが次の予約カードに隠れて押せないことがある → ここからも切り替えられる */
  onToggleEnd: (next: CrmEndType) => void;
}) {
  const dlgRef = useDialogFocus<HTMLDivElement>();
  const [wd, setWd] = useState<CrmWorkDay>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof CrmWorkDay>(k: K, v: CrmWorkDay[K]) => setWd((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const saveOnly = async (): Promise<boolean> => {
    setBusy(true); setErr('');
    const r = await safeCall(() => saveCrmWorkDay(salonId, therapist.id, date, wd));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return false; }
    return true;
  };
  const save = async () => { if (await saveOnly()) onSaved(); };
  // ★ 第1218便: 「報酬確定を行う」は、いま入れた交通費などを【先に保存してから】確定画面へ（保存せずに開くと、交通費が手当に入らなかった）
  const confirmAfterSave = async () => { if (await saveOnly()) onConfirm(wd.transport); };

  const roomOptions = wd.room && wd.roomSalonId == null && !rooms.includes(wd.room) ? [...rooms, wd.room] : rooms;
  // ★ 第1669便: 選択肢の値は 自店「部屋A」／提携店「<店ID>::部屋A」。保存は room と roomSalonId に分けて持つ
  const roomValue = wd.room ? (wd.roomSalonId == null ? wd.room : `${wd.roomSalonId}::${wd.room}`) : '';
  const partnerOptions = (() => {
    const list = [...partnerRooms];
    if (wd.room && wd.roomSalonId != null && !list.some((p) => p.salonId === wd.roomSalonId && p.room === wd.room)) list.push({ salonId: wd.roomSalonId, salonName: '提携店', room: wd.room });
    return list;
  })();
  const onRoomChange = (v: string) => {
    const m = /^(\d+)::(.+)$/.exec(v);
    if (m) setWd((p) => ({ ...p, room: m[2], roomSalonId: Number(m[1]) }));
    else setWd((p) => ({ ...p, room: v, roomSalonId: null }));
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        {/* ★★ 第1210便（2026-10-06・カッキーさん）: スマホで、下の「保存」が画面の外に出て押せなかった。
            原因＝高さの上限を 92vh にしていた。vh は【ブラウザのアドレスバー・下のバーを含めた高さ】なので、
            実機ではバーのぶんだけ画面より大きくなり、いちばん下（保存の帯）が隠れる。中身は枠の中に収まっているので、中をスクロールしても届かない。
            → dvh（いま見えている高さ）に変えた。★ この画面のほかの小窓（予約の内容・受付・女子メモ・報酬確定・締め作業・取り込み）も同じ直し。
            ★ ここの小窓は「上の帯／中身（中だけスクロール）／下の帯」の3段。min-h-0 は、中身が縮んでスクロールに回るための念押し。 */}
        <div ref={dlgRef} role="dialog" aria-modal="true" aria-label={`出勤情報：${therapist.name}`} tabIndex={-1} className="pointer-events-auto flex max-h-[92dvh] w-full max-w-[640px] flex-col bg-white shadow-2xl outline-none">
          <div className="flex items-center bg-[#3f51b5] px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">出勤情報：{therapist.name}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
              <span className="font-bold text-slate-500">{dateLabel(date)}</span>
              <span className="font-bold text-slate-800">
                出勤 {therapist.schedules.length > 0 ? therapist.schedules.map((w) => shiftRangeText(w.start, w.end, '-')).join(' / ') : 'なし'}
              </span>
              <button
                type="button"
                onClick={() => onToggleEnd(endType === 'accept' ? 'finish' : 'accept')}
                title="押すと「受まで」「上がり」が切り替わります"
                className={`border px-1.5 text-[12px] font-bold ${endType === 'accept' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-pink-400 bg-white text-pink-600'}`}
              >
                {CRM_END_LABEL[endType]} ⇄
              </button>
            </div>
            <p className="-mt-2 text-[12px] text-slate-400">出勤の時刻は、マイページの「出勤」で変えてください（サイトと媒体に出る出勤と同じものです）。</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labCls}>休憩開始</label>
                <TimePick value={wd.breakStartMin} onChange={(v) => set('breakStartMin', v)} />
              </div>
              <div>
                <label className={labCls}>休憩終了</label>
                <TimePick value={wd.breakEndMin} onChange={(v) => set('breakEndMin', v)} />
              </div>
            </div>
            <div>
              <label className={labCls}>休憩メモ</label>
              <input className={fieldCls} value={wd.breakMemo} maxLength={100} onChange={(e) => set('breakMemo', e.target.value)} placeholder="例）親と電話" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labCls}>待機場所</label>
                <select className={fieldCls} value={roomValue} onChange={(e) => onRoomChange(e.target.value)}>
                  <option value="">--</option>
                  {roomOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  {partnerOptions.length > 0 && (
                    <optgroup label="提携店の部屋（借りる）">
                      {partnerOptions.map((p) => <option key={`${p.salonId}::${p.room}`} value={`${p.salonId}::${p.room}`}>{p.salonName}／{p.room}</option>)}
                    </optgroup>
                  )}
                </select>
                {rooms.length === 0 && partnerOptions.length === 0 && <p className="mt-1 text-[11px] text-slate-400">部屋の一覧は「設定」タブで作れます</p>}
                {wd.roomSalonId != null && <p className="mt-1 text-[11px] text-slate-500">提携店の部屋を借りています。その部屋の QR で同意書が出て、相手の店の予約の時間は本日画面に帯が出ます（ネット予約の空き枠もその時間は閉じます）</p>}
              </div>
              <div>
                <label className={labCls}>遅刻・当欠・休ませた</label>
                <select className={fieldCls} value={wd.attendance} onChange={(e) => set('attendance', e.target.value as CrmAttendance)}>
                  {CRM_ATTENDANCE.map((a) => <option key={a || 'none'} value={a}>{CRM_ATTENDANCE_LABEL[a]}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labCls}>交通費（円）</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${fieldCls} max-w-[160px]`}
                  inputMode="numeric"
                  value={wd.transport ? String(wd.transport) : ''}
                  onChange={(e) => set('transport', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                  placeholder="0"
                />
                {[1000, 2000].map((v) => (
                  <button key={v} type="button" onClick={() => set('transport', v)} className="border border-slate-300 bg-white px-2 py-1 text-[12px] font-bold text-slate-600">
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">報酬確定のときの「手当・交通費」に、はじめから入ります。</p>
            </div>

            {/* 自由項目（第597便）：設定で作った項目。1つだけ選ぶ・もう一度押すと外れる */}
            {toggleDefs.map((t) => {
              const cur = wd.toggles?.[t.id] ?? '';
              return (
                <div key={t.id}>
                  <label className={labCls}>{t.title}</label>
                  <div className="flex flex-wrap gap-2">
                    {/* ★ 第1371便（カッキーさん）: 「なし」を先頭に（前は選んだものをもう一度押すと外れる作りで、見た目で分からなかった） */}
                    <button
                      type="button"
                      aria-pressed={cur === ''}
                      onClick={() => setWd((p) => { const next = { ...(p.toggles ?? {}) }; delete next[t.id]; return { ...p, toggles: next }; })}
                      className={`min-w-[52px] border px-3 py-1.5 text-[14px] font-bold ${cur === '' ? 'border-slate-600 bg-slate-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
                    >
                      なし
                    </button>
                    {t.options.map((o) => {
                      const on = cur === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setWd((p) => {
                            const next = { ...(p.toggles ?? {}) };
                            if (on) delete next[t.id]; else next[t.id] = o;
                            return { ...p, toggles: next };
                          })}
                          className={`min-w-[52px] border px-3 py-1.5 text-[14px] font-bold ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
            <button type="button" disabled={busy} onClick={confirmAfterSave} className="text-[13px] font-bold text-emerald-700 underline">
              報酬確定を行う
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="ml-auto border border-slate-300 bg-white px-4 py-2 text-[14px] font-bold text-slate-600">
              閉じる
            </button>
            <button type="button" disabled={busy} onClick={save} className="bg-emerald-600 px-5 py-2 text-[14px] font-bold text-white disabled:opacity-50">
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// 休憩の時・分（'' ＝ なし）
export const TP_HOURS: number[] = Array.from({ length: 25 }, (_, i) => i + 6);
export const TP_MINS: number[] = Array.from({ length: 12 }, (_, i) => i * 5);
export function TimePick({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1">
      <select
        className={fieldCls}
        value={value == null ? '' : Math.floor(value / 60)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value) * 60 + (value == null ? 0 : value % 60))}
      >
        <option value="">--</option>
        {TP_HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </select>
      <select
        className={fieldCls}
        disabled={value == null}
        value={value == null ? 0 : value % 60}
        onChange={(e) => onChange(Math.floor((value ?? 0) / 60) * 60 + Number(e.target.value))}
      >
        {TP_MINS.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>)}
      </select>
    </div>
  );
}
