'use client';

import { PhotoRemoveConfirm } from '../PhotoRemoveConfirm';
import { useSitePush } from './useSitePush';

// 「エステ魂へ反映」（第430便）。★ 駅ちかの EkichikaEditPanel と同じ形。
// ★ 名前と「保存と同時に上位表示」は送らない。★★ 第434便: 「更新する」はプロフィールのあと写真もコネックエフに合わせる（送った記録のある写真だけ・消える写真は押す前に確認）
// ★★ 第449便（カッキーさん）: 「確かめる（送らない）」は消した（★ ボタンが2つあると迷うため。駅ちかと同じ1ボタンに揃える）。
// ★ 第732便: 動きは useSitePush へ（各タブの「保存して更新」と共通）。

export function EsutamaEditPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const p = useSitePush('esutama', id, enabled, onToast);
  return (
    <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3 text-[14px] text-[#212121]">
      <span className="font-bold">エステ魂</span>
      <button type="button" disabled={p.busy || p.removals !== null} onClick={() => void p.onUpdate()}
        className="ml-auto h-8 px-5 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
        {p.busy ? '受け付けています…' : '更新する'}
      </button>
      {p.removals && (
        <div className="basis-full">
          <PhotoRemoveConfirm site="エステ魂" items={p.removals} busy={p.busy}
            onRemove={() => void p.send(true)} onKeep={() => void p.send(false)} onCancel={() => p.setRemovals(null)} />
        </div>
      )}
    </div>
  );
}
