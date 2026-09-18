'use client';

import { useState } from 'react';
import { startConecfEsutamaEdit, previewConecfEsutamaPhotoRemovals } from '@/app/actions/conecfGirlEdit';
import { PhotoRemoveConfirm, type PhotoRemoval } from '../PhotoRemoveConfirm';

// 「エステ魂へ反映」（第430便）。★ 駅ちかの EkichikaEditPanel と同じ形。
// ★ 名前と「保存と同時に上位表示」は送らない。★★ 第434便: 「更新する」はプロフィールのあと写真もコネックエフに合わせる（送った記録のある写真だけ・消える写真は押す前に確認）
// ★★ 第449便（カッキーさん）: 「確かめる（送らない）」は消した（★ ボタンが2つあると迷うため。駅ちかと同じ1ボタンに揃える）。

export function EsutamaEditPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [removals, setRemovals] = useState<PhotoRemoval[] | null>(null);

  const send = async (allowRemove: boolean) => {
    setBusy(true);
    const r = await startConecfEsutamaEdit({ id, apply: true, allowRemove });
    setBusy(false);
    setRemovals(null);
    onToast(r.ok ? 'エステ魂への更新を受け付けました。結果は「更新結果」に出ます' : r.error);
  };

  const onUpdate = async () => {
    if (!enabled) { onToast('更新するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    setBusy(true);
    const p = await previewConecfEsutamaPhotoRemovals({ ids: [id] });
    setBusy(false);
    if (!p.ok) { onToast(p.error); return; }
    if (p.data.length > 0) { setRemovals(p.data); return; }
    await send(false);
  };

  return (
    <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3 text-[14px] text-[#212121]">
      <span className="font-bold">エステ魂</span>
      <button type="button" disabled={busy || removals !== null} onClick={() => void onUpdate()}
        className="ml-auto h-8 px-5 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
        {busy ? '受け付けています…' : '更新する'}
      </button>
      {removals && (
        <div className="basis-full">
          <PhotoRemoveConfirm site="エステ魂" items={removals} busy={busy}
            onRemove={() => void send(true)} onKeep={() => void send(false)} onCancel={() => setRemovals(null)} />
        </div>
      )}
    </div>
  );
}
