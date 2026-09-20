'use client';

import { useEffect, useState } from 'react';
import { getCrmRoomQrUrl, getCrmSettings, saveCrmSettings } from '@/app/actions/crm';
import QRCode from 'qrcode';
import { CRM_ALARM_SOUNDS, CRM_END_LABEL, CRM_ROOM_COLORS, roomColor, type CrmAlarm, type CrmEndType, type CrmSettings } from '@/app/lib/crm/types';
import { playAlarmOnce, unlockAlarmAudio } from '@/app/lib/crm/alarmSound';
import { CrmShell, useCrmAccess } from '../CrmShell';

// フクエスCRM「設定」（第548便・2026-09-19）。
// ★ スケジュールの時間軸の始まりと終わり・終わりの時刻の既定のバッジ（受まで／上がり）。
// ★ 時間軸は1時間単位。予約が範囲の外にあるときは、スケジュール側で自動で広げる（見落とさないため）。
// ★ 終わりは翌7時まで（予約の読み込み範囲が「その日0時〜翌7時」のため）。

function hourLabel(h: number): string {
  return h >= 24 ? `翌${h - 24}時` : `${h}時`;
}

export default function CrmSettingsPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="settings">
      {(a) => <SettingsBody salonId={a.salonId} />}
    </CrmShell>
  );
}

function SettingsBody({ salonId }: { salonId: number }) {
  const [st, setSt] = useState<CrmSettings | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [newRoom, setNewRoom] = useState('');

  useEffect(() => {
    let alive = true;
    getCrmSettings(salonId).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setSt(r.settings);
    });
    return () => { alive = false; };
  }, [salonId]);

  if (!st) return <p className="p-10 text-center text-[14px] text-slate-400">{err || '読み込み中です…'}</p>;

  const startHours: number[] = [];
  for (let h = 6; h <= 30; h++) startHours.push(h);
  const endHours: number[] = [];
  for (let h = 7; h <= 31; h++) endHours.push(h);

  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    const r = await saveCrmSettings(salonId, st);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg('保存しました');
  };

  const sel = 'border border-slate-300 bg-white px-3 py-2 text-[15px] focus:border-indigo-400 focus:outline-none';

  return (
    <div className="mx-auto max-w-2xl px-3 py-4">
      <section className="border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">スケジュールの表示時間</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[12px] font-bold text-slate-500">開始時刻</p>
            <select className={sel} value={Math.floor(st.dayStartMin / 60)} onChange={(e) => setSt({ ...st, dayStartMin: Number(e.target.value) * 60 })}>
              {startHours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <span className="pb-2 text-slate-400">〜</span>
          <div>
            <p className="mb-1 text-[12px] font-bold text-slate-500">終了時刻</p>
            <select className={sel} value={Math.ceil(st.dayEndMin / 60)} onChange={(e) => setSt({ ...st, dayEndMin: Number(e.target.value) * 60 })}>
              {endHours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-slate-400">終了時刻は翌7時まで選べます。締め・日報の「その日の分」は、表示時間に関係なく朝6時で区切ります。</p>
      </section>

      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">セラピストの終わりの時刻のバッジ（既定）</h2>
        <div className="mt-3 space-y-2">
          {(['accept', 'finish'] as CrmEndType[]).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 text-[14px]">
              <input type="radio" className="h-4 w-4 accent-indigo-600" checked={st.defaultEndType === t} onChange={() => setSt({ ...st, defaultEndType: t })} />
              <span className={`border px-1.5 text-[12px] font-bold ${t === 'accept' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-pink-400 bg-white text-pink-600'}`}>{CRM_END_LABEL[t]}</span>
              <span className="text-slate-600">{t === 'accept' ? '受付までの時刻（その時刻まで予約を受ける）' : 'この時刻で終わり'}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">待機場所（部屋）</h2>
        <p className="mt-1 text-[13px] text-slate-600">スケジュールで名前を押した「出勤情報」で選べます。選ぶと名前の下にバッジで出ます。色のマスを押すとバッジの色が変わります。</p>
        {st.rooms.length === 0 && <p className="mt-3 text-[13px] text-slate-400">まだありません</p>}
        <div className="mt-3 space-y-2">
          {st.rooms.map((r) => {
            const cur = st.roomColors[r] ?? 'navy';
            const c = roomColor(cur);
            return (
              <div key={r} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
                <span className="min-w-[64px] px-2 py-1 text-center text-[13px] font-bold" style={{ background: c.bg, color: c.fg }}>{r}</span>
                <div className="flex flex-wrap gap-1">
                  {CRM_ROOM_COLORS.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      title={col.label}
                      aria-label={`${r}を${col.label}にする`}
                      onClick={() => setSt({ ...st, roomColors: { ...st.roomColors, [r]: col.key } })}
                      className={`h-6 w-6 border ${cur === col.key ? 'ring-2 ring-indigo-500 ring-offset-1' : 'border-slate-300'}`}
                      style={{ background: col.bg }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const rc = { ...st.roomColors };
                    delete rc[r];
                    setSt({ ...st, rooms: st.rooms.filter((x) => x !== r), roomColors: rc });
                  }}
                  className="ml-auto text-[12px] font-bold text-slate-400 underline"
                >
                  削除
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newRoom}
            maxLength={30}
            onChange={(e) => setNewRoom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newRoom.trim()) {
                e.preventDefault();
                if (!st.rooms.includes(newRoom.trim())) setSt({ ...st, rooms: [...st.rooms, newRoom.trim()] });
                setNewRoom('');
              }
            }}
            placeholder="例）B506"
            className="w-48 border border-slate-300 bg-white px-3 py-2 text-[14px] focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={!newRoom.trim()}
            onClick={() => {
              if (!st.rooms.includes(newRoom.trim())) setSt({ ...st, rooms: [...st.rooms, newRoom.trim()] });
              setNewRoom('');
            }}
            className="border border-indigo-300 bg-indigo-50 px-3 text-[13px] font-bold text-indigo-700 disabled:opacity-40"
          >
            追加
          </button>
        </div>
        <p className="mt-2 text-[12px] text-slate-400">追加・削除のあとは、下の「保存する」を押してください。</p>
      </section>

      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">予約アラーム</h2>
        <p className="mt-1 text-[13px] text-slate-600">
          予約の開始・終了の○分前に、スケジュール画面で音を鳴らし、その予約のカードを点滅させます。
          スケジュール画面を開いているときだけ鳴ります（開くたびに「アラームの音をONにする」を1回押してください）。キャンセルの予約では鳴りません。
        </p>
        {st.alarms.length === 0 && <p className="mt-3 text-[13px] text-slate-400">アラームはありません（鳴らしません）</p>}
        <div className="mt-3 space-y-2">
          {st.alarms.map((a, i) => {
            const upd = (p: Partial<CrmAlarm>) => setSt({ ...st, alarms: st.alarms.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-[14px]">
                <select className="border border-slate-300 bg-white px-2 py-1.5" value={a.on} onChange={(e) => upd({ on: e.target.value === 'end' ? 'end' : 'start' })}>
                  <option value="start">予約開始</option>
                  <option value="end">予約終了</option>
                </select>
                <input className="w-16 border border-slate-300 px-2 py-1.5 text-right" inputMode="numeric" value={a.min} onChange={(e) => upd({ min: Math.min(120, Number(e.target.value.replace(/[^0-9]/g, '')) || 0) })} />
                <span>分前に</span>
                <input className="w-16 border border-slate-300 px-2 py-1.5 text-right" inputMode="numeric" value={a.sec} onChange={(e) => upd({ sec: Math.min(300, Number(e.target.value.replace(/[^0-9]/g, '')) || 0) })} />
                <span>秒</span>
                <select className="border border-slate-300 bg-white px-2 py-1.5" value={a.sound} onChange={(e) => upd({ sound: Number(e.target.value) })}>
                  {CRM_ALARM_SOUNDS.map((n) => <option key={n} value={n}>アラーム{n}</option>)}
                </select>
                <button type="button" onClick={async () => { if (await unlockAlarmAudio()) playAlarmOnce(a.sound); }} className="border border-slate-300 bg-white px-2 py-1 text-[12px] font-bold text-slate-600">▶ 試しに鳴らす</button>
                <button type="button" onClick={() => setSt({ ...st, alarms: st.alarms.filter((_, j) => j !== i) })} className="ml-auto text-[12px] font-bold text-slate-400 underline">削除</button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          disabled={st.alarms.length >= 10}
          onClick={() => setSt({ ...st, alarms: [...st.alarms, { on: 'start', min: 5, sec: 30, sound: 1 }] })}
          className="mt-3 border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700 disabled:opacity-40"
        >
          ＋ アラームを追加
        </button>
        <p className="mt-2 text-[12px] text-slate-400">「○分前」は0〜120分、鳴らす秒数は5〜300秒です。変えたあとは、下の「保存する」を押してください。</p>
      </section>

      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">来店時の同意書（ペーパーレス）</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          各部屋に置いた QR コードをお客様（かセラピスト・お店のタブレット）が読むと、この文面が出ます。
          最後の「上記の内容をすべて了承します」に☑を入れ、指でサインして送信すると、その部屋のいまの予約に「了承済」とサインが記録されます。
          ★ スケジュールで名前を押した「出勤情報」で、その日の待機場所（部屋）を選んでおいてください（部屋から予約を探すため）。
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[14px] font-bold">
          <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={st.consentEnabled} onChange={(e) => setSt({ ...st, consentEnabled: e.target.checked })} />
          同意書を使う
        </label>
        <p className="mb-1 mt-3 text-[12px] font-bold text-slate-500">題名（任意）</p>
        <input
          value={st.consentTitle}
          maxLength={60}
          onChange={(e) => setSt({ ...st, consentTitle: e.target.value })}
          placeholder="例）ご利用にあたっての注意事項"
          className="w-full border border-slate-300 bg-white px-3 py-2 text-[14px]"
        />
        <p className="mb-1 mt-3 text-[12px] font-bold text-slate-500">本文</p>
        <textarea
          value={st.consentBody}
          maxLength={8000}
          onChange={(e) => setSt({ ...st, consentBody: e.target.value })}
          placeholder={'例）\n・18歳未満の方はご利用いただけません\n・セラピストへの過度な接触は禁止です\n・…'}
          className="min-h-[220px] w-full border border-slate-300 bg-white px-3 py-2 text-[14px] leading-relaxed"
        />
        <p className="mt-1 text-right text-[11px] text-slate-400">{st.consentBody.length}/8000</p>

        <p className="mt-3 text-[13px] font-bold text-slate-700">部屋ごとの QR コード</p>
        {st.rooms.length === 0 ? (
          <p className="mt-1 text-[13px] text-slate-400">上の「待機場所（部屋）」を追加して保存すると、ここに部屋ごとの QR が出ます。</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {st.rooms.map((r) => <RoomQr key={r} salonId={salonId} room={r} />)}
          </div>
        )}
      </section>

      {err && <p className="mt-3 text-[13px] font-bold text-rose-600">{err}</p>}
      {msg && <p className="mt-3 text-[13px] font-bold text-emerald-700">{msg}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-4 w-full bg-indigo-600 py-3 text-[15px] font-bold text-white disabled:opacity-50">
        {busy ? '保存中…' : '保存する'}
      </button>
    </div>
  );
}

// 部屋ごとの QR（第560便）。★ 印刷はこの QR の画像を保存して印刷するか、「印刷用に開く」から。
function RoomQr({ salonId, room }: { salonId: number; room: string }) {
  const [img, setImg] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (regenerate: boolean) => {
    setBusy(true); setErr('');
    const r = await getCrmRoomQrUrl(salonId, room, regenerate);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setUrl(r.url);
    setImg(await QRCode.toDataURL(r.url, { width: 480, margin: 2, errorCorrectionLevel: 'M' }));
    setSure(false);
  };

  const printIt = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = room.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc}</title></head><body style="text-align:center;font-family:sans-serif;padding:24px"><p style="font-size:20px;font-weight:bold">ご来店時にこちらを読み取ってください</p><img src="${img}" style="width:300px;height:300px"><p style="font-size:14px;color:#555">${esc}</p><script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div className="border border-slate-200 p-3 text-center">
      <p className="text-[14px] font-black text-slate-800">{room}</p>
      {!img ? (
        <button type="button" disabled={busy} onClick={() => load(false)} className="mt-2 border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700 disabled:opacity-50">
          QRコードを出す
        </button>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={`${room}のQRコード`} className="mx-auto mt-2 h-[160px] w-[160px]" />
          <p className="mt-1 break-all text-[10px] text-slate-400">{url}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={printIt} className="bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white">印刷用に開く</button>
            <a href={img} download={`QR_${room}.png`} className="border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600">画像を保存</a>
            {sure ? (
              <button type="button" disabled={busy} onClick={() => load(true)} className="bg-rose-600 px-3 py-1.5 text-[12px] font-bold text-white">本当に作り直す</button>
            ) : (
              <button type="button" onClick={() => setSure(true)} className="border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-500">作り直す</button>
            )}
          </div>
          {sure && <p className="mt-1 text-[11px] text-rose-600">作り直すと、今の QR は使えなくなります（貼り替えが必要です）</p>}
        </>
      )}
      {err && <p className="mt-1 text-[12px] font-bold text-rose-600">{err}</p>}
    </div>
  );
}
