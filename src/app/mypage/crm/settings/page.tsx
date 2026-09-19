'use client';

import { useEffect, useState } from 'react';
import { getCrmSettings, saveCrmSettings } from '@/app/actions/crm';
import { CRM_END_LABEL, type CrmEndType, type CrmSettings } from '@/app/lib/crm/types';
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

      {err && <p className="mt-3 text-[13px] font-bold text-rose-600">{err}</p>}
      {msg && <p className="mt-3 text-[13px] font-bold text-emerald-700">{msg}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-4 w-full bg-indigo-600 py-3 text-[15px] font-bold text-white disabled:opacity-50">
        {busy ? '保存中…' : '保存する'}
      </button>
    </div>
  );
}
