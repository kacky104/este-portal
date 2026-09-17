'use client';

import { useState } from 'react';
import { useConecfHref } from '../../ConecfBase';
import { getConecfGirlDeleteInfo, deleteConecfGirl, type ConecfGirlDeleteInfo } from '@/app/actions/conecfGirls';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';

// ★★ 第432便: 退店した女性の削除。
//   ★ 押すと、連携しているサイトと消えるものを出して確認 → 「削除する」で消す（取り消せない）。
//   ★ 駅ちか・エステ魂などサイト側の登録は消えない（★ 先に各サイトで削除・非表示を）。

export function DeleteGirlPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [info, setInfo] = useState<ConecfGirlDeleteInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (!enabled) { onToast('削除するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    setBusy(true);
    const r = await getConecfGirlDeleteInfo({ id });
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    setInfo(r.data);
  };

  const run = async () => {
    setBusy(true);
    const r = await deleteConecfGirl({ id });
    if (!r.ok) { setBusy(false); onToast(r.error); return; }
    void revalidateSalon(r.data.salonId); void revalidateTherapist(id);
    onToast(`${r.data.name}さんを削除しました`);
    window.location.href = href('/girls');
  };

  return (
    <div className="bg-white border border-slate-200 px-4 py-3 space-y-3 text-[14px] text-[#212121]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold">女性の削除</span>
        <span className="text-[12px] text-slate-500">退店した女性を消します（取り消せません）</span>
        {!info && (
          <button type="button" disabled={busy} onClick={() => void open()}
            className="ml-auto h-8 px-4 rounded border border-[#c62828] text-[#c62828] text-[12px] disabled:opacity-40">
            {busy ? '確認しています…' : 'この女性を削除'}
          </button>
        )}
      </div>
      {info && (
        <div className="border border-rose-300 bg-rose-50/40 p-4 space-y-2.5">
          <p className="font-bold text-[#c62828]">{info.name}さんを削除します。元に戻せません</p>
          <ul className="text-[13px] text-slate-600 leading-relaxed list-disc pl-5">
            <li>コネックエフとフクエスから、プロフィール・写真・出勤・写メ日記が消えます</li>
            {info.linked.length > 0 ? (
              <li className="text-[#c62828] font-bold">
                {info.linked.map((l) => l.label + (l.slot > 1 ? `（枠${l.slot}）` : '')).join('・')} の登録は消えません。先に各サイトの管理画面で削除（または非表示）してください
              </li>
            ) : (
              <li>サイトとの連携はありません</li>
            )}
          </ul>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setInfo(null)} className="h-8 px-4 rounded bg-black/[0.07] text-[12px]">やめる</button>
            <button type="button" disabled={busy} onClick={() => void run()} className="h-8 px-4 rounded bg-[#c62828] text-white text-[12px] disabled:opacity-40">
              {busy ? '削除しています…' : '削除する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
