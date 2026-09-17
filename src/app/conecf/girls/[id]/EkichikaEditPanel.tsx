'use client';

import { useState } from 'react';
import { startConecfEkichikaEdit, previewConecfEkichikaPhotoRemovals } from '@/app/actions/conecfGirlEdit';
import { PhotoRemoveConfirm, type PhotoRemoval } from '../PhotoRemoveConfirm';

// 「駅ちかへ反映」（第418便 → 第419便でカッキーさんの指示により1ボタンに）。
// ★ 押したら受け付けて終わり（★ 待たせない）。★ 結果（更新した／変わるところが無い／できなかった）は「更新結果」に出る。
// ★ 決めごと（空の欄は触らない・上限超えは送らない・名前は送らない・読み直して照合）はそのまま。
// ★★ 第428便: 駅ちかから写真が消えるときは、送る前に確認を出す（PhotoRemoveConfirm）。

export function EkichikaEditPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [removals, setRemovals] = useState<PhotoRemoval[] | null>(null);

  const send = async (allowRemove: boolean) => {
    setBusy(true);
    const r = await startConecfEkichikaEdit({ id, apply: true, allowRemove });
    setBusy(false);
    setRemovals(null);
    onToast(r.ok ? '駅ちかへの更新を受け付けました。結果は「更新結果」に出ます' : r.error);
  };

  const onUpdate = async () => {
    if (!enabled) { onToast('更新するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    setBusy(true);
    const p = await previewConecfEkichikaPhotoRemovals({ ids: [id] });
    setBusy(false);
    if (!p.ok) { onToast(p.error); return; }
    if (p.data.length > 0) { setRemovals(p.data); return; }
    await send(false);
  };

  return (
    <div className="space-y-2">
      <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3 text-[14px] text-[#212121]">
        <span className="font-bold">駅ちか</span>
        <span className="text-[12px] text-slate-500">保存した内容を駅ちかへ送ります（名前は送りません／空の欄は駅ちかのまま）</span>
        <button type="button" disabled={busy || removals !== null} onClick={() => void onUpdate()}
          className="ml-auto h-8 px-5 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
          {busy ? '受け付けています…' : '更新する'}
        </button>
      </div>
      {removals && (
        <PhotoRemoveConfirm items={removals} busy={busy}
          onRemove={() => void send(true)} onKeep={() => void send(false)} onCancel={() => setRemovals(null)} />
      )}
    </div>
  );
}
