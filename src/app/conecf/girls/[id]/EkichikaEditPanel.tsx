'use client';

import { PhotoRemoveConfirm } from '../PhotoRemoveConfirm';
import { useSitePush } from './useSitePush';

// 「駅ちかへ反映」（第418便 → 第419便でカッキーさんの指示により1ボタンに）。
// ★ 押したら受け付けて終わり（★ 待たせない）。★ 結果（更新した／変わるところが無い／できなかった）は「更新結果」に出る。
// ★ 決めごと（空の欄は触らない・上限超えは送らない・名前は送らない・読み直して照合）はそのまま。
// ★★ 第428便: 駅ちかから写真が消えるときは、送る前に確認を出す（PhotoRemoveConfirm）。
// ★ 第732便: 動きは useSitePush へ（各タブの「保存して更新」と共通）。

export function EkichikaEditPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const p = useSitePush('ekichika', id, enabled, onToast);
  return (
    <div className="space-y-2">
      <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3 text-[14px] text-[#212121]">
        <span className="font-bold">駅ちか</span>
        <button type="button" disabled={p.busy || p.removals !== null} onClick={() => void p.onUpdate()}
          className="ml-auto h-8 px-5 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
          {p.busy ? '受け付けています…' : '更新する'}
        </button>
      </div>
      {p.removals && (
        <PhotoRemoveConfirm items={p.removals} busy={p.busy}
          onRemove={() => void p.send(true)} onKeep={() => void p.send(false)} onCancel={() => p.setRemovals(null)} />
      )}
    </div>
  );
}
