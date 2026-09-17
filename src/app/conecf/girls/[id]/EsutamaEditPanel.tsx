'use client';

import { useState } from 'react';
import { startConecfEsutamaEdit } from '@/app/actions/conecfGirlEdit';

// 「エステ魂へ反映」（第430便）。★ 駅ちかの EkichikaEditPanel と同じ形。
// ★ 送るのはプロフィールだけ（写真は送らない）。★ 名前と「保存と同時に上位表示」は送らない。
// ★ 「確かめる」は編集ページを読んで何欄変わるかを「更新結果」に出すだけ（1文字も送らない）。

export function EsutamaEditPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);

  const run = async (apply: boolean) => {
    if (!enabled) { onToast('更新するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    setBusy(apply ? 'apply' : 'check');
    const r = await startConecfEsutamaEdit({ id, apply });
    setBusy(null);
    onToast(r.ok
      ? (apply ? 'エステ魂への更新を受け付けました。結果は「更新結果」に出ます' : 'エステ魂の確認を受け付けました（送りません）。結果は「更新結果」に出ます')
      : r.error);
  };

  return (
    <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3 text-[14px] text-[#212121]">
      <span className="font-bold">エステ魂</span>
      <span className="text-[12px] text-slate-500">保存した内容をエステ魂へ送ります（名前・写真は送りません／空の欄はエステ魂のまま）</span>
      <div className="ml-auto flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void run(false)}
          className="h-8 px-4 rounded border border-[#218925] text-[#218925] text-[12px] disabled:opacity-40">
          {busy === 'check' ? '受け付けています…' : '確かめる（送らない）'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void run(true)}
          className="h-8 px-5 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
          {busy === 'apply' ? '受け付けています…' : '更新する'}
        </button>
      </div>
    </div>
  );
}
