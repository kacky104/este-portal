'use client';

// ★★ 第428便: 「更新する」で駅ちかから写真が消えるときの確認（女性の編集・まとめて更新の両方）。
//   ★ 消える枠 ＝ 前にコネックエフから送った写真で、いまコネックエフに無い枠（画像1は駅ちかで消せないので出ない）。
//   ★ 「消して更新」／「消さずに更新」（写真は消さず、ほかは送る）／「やめる」。

export type PhotoRemoval = { id: number; name: string; slots: number[] };

export function PhotoRemoveConfirm({ items, busy, onRemove, onKeep, onCancel }: {
  items: PhotoRemoval[]; busy: boolean; onRemove: () => void; onKeep: () => void; onCancel: () => void;
}) {
  const total = items.reduce((a, x) => a + x.slots.length, 0);
  return (
    <div className="bg-white border border-amber-300 p-4 space-y-3 text-[14px] text-[#212121]">
      <p className="font-bold text-amber-800">駅ちかから写真が {total} 枚消えます</p>
      <ul className="text-[13px] text-slate-600 leading-relaxed list-disc pl-5">
        {items.map((x) => (
          <li key={x.id}>{x.name}さん：画像{x.slots.join('・')}</li>
        ))}
      </ul>
      <p className="text-[12px] text-slate-500">コネックエフで減らした写真です。駅ちかで消した写真は元に戻せません。</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="h-8 px-4 rounded bg-black/[0.07] text-[12px]">やめる</button>
        <button type="button" onClick={onKeep} disabled={busy} className="h-8 px-4 rounded border border-[#218925] text-[#218925] text-[12px] disabled:opacity-40">写真は消さずに更新</button>
        <button type="button" onClick={onRemove} disabled={busy} className="h-8 px-4 rounded bg-[#c62828] text-white text-[12px] disabled:opacity-40">消して更新</button>
      </div>
    </div>
  );
}
