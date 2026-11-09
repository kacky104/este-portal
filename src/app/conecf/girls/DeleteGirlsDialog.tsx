'use client';

import { useState } from 'react';
import { deleteConecfGirl } from '@/app/actions/conecfGirls';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';

// ★ 第1864便（カッキーさん・オイルクエスト様のご要望）: セラピスト一覧から、1人でも・まとめてでも削除できる小窓。
//   ・中身はプロフィール編集の「このセラピストを削除」と同じ（deleteConecfGirl）。「サイトからも一緒に消す」は既定でオン
//     （駅ちか・エステ魂・全国エステランキングから削除。各サイトで消えたのを確かめてから、コネックエフ・フクエスからも消す）。
//   ・まとめてのときは1人ずつ順に受け付ける。同じサイトに並べられる依頼は4件までなので、混んでいたら1分待って続きを受け付ける。

const WAIT_MS = 60_000;
const MAX_TRIES = 10;
const busyLike = (e: string) => /別の更新が動いています|受け付けられませんでした|開始できませんでした/.test(e);

export function DeleteGirlsDialog({ girls, onClose, onDone, onToast }: {
  girls: Array<{ id: number; name: string }>;
  onClose: () => void;
  onDone: () => void;
  onToast: (m: string) => void;
}) {
  const [alsoSites, setAlsoSites] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [results, setResults] = useState<Array<{ name: string; ok: boolean; note: string }>>([]);

  const run = async () => {
    setRunning(true);
    const out: Array<{ name: string; ok: boolean; note: string }> = [];
    for (const [i, g] of girls.entries()) {
      let done = false;
      for (let t = 0; t < MAX_TRIES && !done; t += 1) {
        setProgress(`${i + 1} / ${girls.length} 人目：${g.name}さんを受け付けています…` + (t > 0 ? `（サイトが混んでいるので待っています・${t}回目）` : ''));
        const r = await deleteConecfGirl({ id: g.id, alsoSites });
        if (r.ok) {
          void revalidateSalon(r.data.salonId); void revalidateTherapist(g.id);
          out.push({ name: g.name, ok: true, note: r.data.pending ? '各サイトから消えたのを確かめてから消します（数分）' : '削除しました' });
          done = true;
        } else if (alsoSites && busyLike(r.error) && t < MAX_TRIES - 1) {
          await new Promise((res) => setTimeout(res, WAIT_MS));
        } else {
          out.push({ name: g.name, ok: false, note: r.error });
          done = true;
        }
      }
      setResults([...out]);
    }
    setRunning(false);
    setProgress('');
    const ng = out.filter((x) => !x.ok).length;
    onToast(ng === 0 ? `${out.length}人の削除を受け付けました` : `${out.length - ng}人を受け付けました（${ng}人はできませんでした）`);
    onDone();
  };

  const finished = results.length === girls.length && !running;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!running) onClose(); }} aria-hidden />
      <div className="relative max-h-[90vh] w-full overflow-y-auto bg-white p-5 shadow-2xl sm:w-[460px] space-y-3 text-[14px]">
        <p className="text-[16px] font-black text-[#c62828]">{girls.length === 1 ? `${girls[0].name}さんを削除します` : `${girls.length}人を削除します`}（元に戻せません）</p>
        {girls.length > 1 && (
          <p className="max-h-28 overflow-y-auto border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed">{girls.map((g) => g.name || '（名前なし）').join('・')}</p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-600">
          <li>コネックエフとフクエスから、プロフィール・写真・出勤・写メ日記が消えます</li>
          {alsoSites && <li>まず非公開にして、連携しているサイトから消えたことを確かめてから、コネックエフからも消します（数分）</li>}
        </ul>
        <label className="flex cursor-pointer items-start gap-2 text-[13px]">
          <input type="checkbox" checked={alsoSites} disabled={running} onChange={(e) => setAlsoSites(e.target.checked)} className="mt-0.5 accent-[#c62828]" />
          <span>
            <b>サイト全体から消す</b>（連携している駅ちか・エステ魂・全国エステランキングからも削除）
            <span className="block text-[12px] text-slate-500">各サイトで削除した写真・情報は戻せません。そのほかのサイトや「反映しない」にしているサイトは、各サイトの管理画面で削除してください</span>
          </span>
        </label>
        {progress && <p className="border border-indigo-200 bg-indigo-50 px-3 py-2 text-[13px] text-indigo-800">{progress}<span className="block text-[12px] text-indigo-600">終わるまで、この画面を閉じないでください</span></p>}
        {results.length > 0 && (
          <ul className="space-y-0.5 text-[12.5px]">
            {results.map((x, i) => <li key={i} className={x.ok ? 'text-emerald-700' : 'text-[#c62828]'}>{x.ok ? '✓' : '×'} {x.name}：{x.note}</li>)}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-1">
          {!finished && <button type="button" disabled={running} onClick={onClose} className="h-9 rounded bg-black/[0.07] px-4 text-[13px] disabled:opacity-40">やめる</button>}
          {!finished
            ? <button type="button" disabled={running} onClick={() => void run()} className="h-9 rounded bg-[#c62828] px-5 text-[13px] font-bold text-white disabled:opacity-50">{running ? '受け付けています…' : '削除する'}</button>
            : <button type="button" onClick={onClose} className="h-9 rounded bg-slate-700 px-5 text-[13px] font-bold text-white">閉じる</button>}
        </div>
      </div>
    </div>
  );
}
