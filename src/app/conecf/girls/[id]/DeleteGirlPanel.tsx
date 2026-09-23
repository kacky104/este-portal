'use client';

import { useState } from 'react';
import { useConecfHref } from '../../ConecfBase';
import { getConecfGirlDeleteInfo, deleteConecfGirl, type ConecfGirlDeleteInfo } from '@/app/actions/conecfGirls';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';

// ★★ 第432便: 退店した女性の削除。
//   ★ 押すと、連携しているサイトと消えるものを出して確認 → 「削除する」で消す（取り消せない）。
//   ★★ 第433便: 「サイトからも消す」（既定オン）で、駅ちかは削除・エステ魂は非表示を一緒に依頼する。

export function DeleteGirlPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [info, setInfo] = useState<ConecfGirlDeleteInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [alsoSites, setAlsoSites] = useState(true);

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
    const r = await deleteConecfGirl({ id, alsoSites: autoSites.length > 0 && alsoSites });
    if (!r.ok) { setBusy(false); onToast(r.error); return; }
    void revalidateSalon(r.data.salonId); void revalidateTherapist(id);
    onToast(`${r.data.name}さんを削除しました` + (r.data.queued.length > 0 ? `。${r.data.queued.join('・')}は数分で反映されます（結果は「更新結果」）` : ''));
    window.location.href = href('/girls');
  };

  const autoSites = (info?.linked ?? []).filter((l) => l.auto);
  const manualSites = (info?.linked ?? []).filter((l) => !l.auto);
  const siteName = (l: { label: string; slot: number }) => l.label + (l.slot > 1 ? `（枠${l.slot}）` : '');

  return (
    <div className="bg-white border border-slate-200 px-4 py-3 space-y-3 text-[14px] text-[#212121]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold">セラピストの削除</span>
        <span className="text-[12px] text-slate-500">退店したセラピストを消します（取り消せません）</span>
        {!info && (
          <button type="button" disabled={busy} onClick={() => void open()}
            className="ml-auto h-8 px-4 rounded border border-[#c62828] text-[#c62828] text-[12px] disabled:opacity-40">
            {busy ? '確認しています…' : 'このセラピストを削除'}
          </button>
        )}
      </div>
      {info && (
        <div className="border border-rose-300 bg-rose-50/40 p-4 space-y-2.5">
          <p className="font-bold text-[#c62828]">{info.name}さんを削除します。元に戻せません</p>
          <ul className="text-[13px] text-slate-600 leading-relaxed list-disc pl-5">
            <li>コネックエフとフクエスから、プロフィール・写真・出勤・写メ日記が消えます</li>
            {info.linked.length === 0 && <li>サイトとの連携はありません</li>}
            {manualSites.length > 0 && (
              <li className="text-[#c62828] font-bold">
                {manualSites.map(siteName).join('・')} の登録は自動では消せません（「反映しない」や停止中のサイトを含みます）。各サイトの管理画面で削除してください
              </li>
            )}
          </ul>
          {autoSites.length > 0 && (
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={alsoSites} onChange={(e) => setAlsoSites(e.target.checked)} className="mt-0.5 accent-[#c62828]" />
              <span>
                <b>サイトからも一緒に消す</b>：
                {autoSites.map((l) => siteName(l) + (l.auto === 'delete' ? 'は削除' : 'は非表示')).join('・')}
                <span className="block text-[12px] text-slate-500">駅ちかで削除した写真・情報は戻せません。エステ魂は非表示なので、エステ魂の画面から戻せます。反映は数分後です。</span>
              </span>
            </label>
          )}
          {autoSites.length > 0 && !alsoSites && (
            <p className="text-[12px] text-[#c62828] font-bold">{autoSites.map(siteName).join('・')} の登録は残ります。各サイトの管理画面で削除（または非表示）してください</p>
          )}
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
