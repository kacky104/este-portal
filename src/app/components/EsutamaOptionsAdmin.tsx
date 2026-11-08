'use client';

// エステ魂【オプション】を使えるようにする店（運営・第1799便・2026-11-09）。
// ★ ON にした店だけ、コネックエフのメニューに「エステ魂オプション」が出る（店舗様が自動の ON/OFF と時間を決める）。
// ★ OFF にすると、その店の自動も止める（auto=false）。

import { useEffect, useState } from 'react';
import { adminGetEsutamaOptions, adminSetEsutamaOption } from '@/app/actions/conecfEsutamaOptions';

type SalonOption = { id: number; name: string };
const KEYS: Array<[string, string]> = [['shop_boost', '集客ブースト'], ['cast_appeal', 'セラピストアピール'], ['job_appeal', '求人ワンクリックアピール']];

export default function EsutamaOptionsAdmin({ allSalons, onToast }: { allSalons: SalonOption[]; onToast: (msg: string) => void }) {
  const [salonId, setSalonId] = useState<number>(0);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!salonId) { setEnabled({}); return; }
    let alive = true;
    adminGetEsutamaOptions(salonId).then((r) => {
      if (!alive) return;
      if (r.ok) { setEnabled(r.data.enabled); setReady(r.data.ready); } else onToast(r.error);
    });
    return () => { alive = false; };
  }, [salonId, onToast]);

  const toggle = async (key: string, on: boolean) => {
    setBusy(true);
    const r = await adminSetEsutamaOption({ salonId, key, enabled: on });
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    setEnabled((e) => ({ ...e, [key]: on }));
    onToast(on ? 'ON にしました' : 'OFF にしました（その店の自動も止めました）');
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-[12px] text-gray-500">ON にした店だけ、コネックエフの左メニューに「エステ魂オプション」が出ます。押すのはエステ魂で有料オプションを契約している店だけにしてください。</p>
      <select className="w-full max-w-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white" value={salonId} onChange={(e) => setSalonId(Number(e.target.value))}>
        <option value={0}>店舗を選ぶ…</option>
        {allSalons.map((s) => <option key={s.id} value={s.id}>{s.id}：{s.name}</option>)}
      </select>
      {salonId > 0 && (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
          {KEYS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-3 px-3 py-2">
              <input type="checkbox" disabled={busy} checked={enabled[k] === true} onChange={(e) => toggle(k, e.target.checked)} />
              <span className="font-bold">{l}</span>
              {ready[k] === false && <span className="text-[11px] text-amber-600">準備中（押す仕組みはまだ。ON にしても押しません）</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
