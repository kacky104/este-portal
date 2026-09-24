'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAnnouncePhotoBoard, saveAnnouncePhotoPool } from '@/app/actions/announcePost';
import { ARTICLE_PHOTO_MAX } from '@/lib/articlePhotoPick';

// コネックエフ「フクエスお知らせ」の【写真】の節（第775便・2026-09-24・カッキーさん）。
// ★ 駅ちか新着情報の「写真」（NewsBoard・第373便）と同じ形。★ 箱はフクエス用に別（salon_announce_state）。
// ★ 画像なしのお知らせを出すたび（自動・再投稿・新規公開）に、ここで選んだ中から1枚が入る。
//   ★ 自分で画像を付けたお知らせは、その画像のまま（カッキーさんの決定）。
// ★ SQL 前（available=false）は節ごと出さない。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

type Board = { available: boolean; photoIds: number[]; therapists: Array<{ id: number; name: string; photoUrl: string }> };

const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function AnnouncePhotoPool({ salonId, enabled, onToast }: { salonId: number; enabled: boolean; onToast: (m: string) => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [pool, setPool] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await getAnnouncePhotoBoard({ salonId });
    if (!r.ok) return;
    setBoard(r.data);
    setPool(r.data.photoIds);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  if (!board || !board.available) return null;

  const toggle = (id: number) => {
    if (pool.includes(id)) { setPool(pool.filter((x) => x !== id)); return; }
    if (pool.length >= ARTICLE_PHOTO_MAX) { onToast('写真は' + ARTICLE_PHOTO_MAX + '枚までです'); return; }
    setPool([...pool, id]);
  };
  const onSave = async () => {
    if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    setBusy(true);
    const r = await saveAnnouncePhotoPool({ salonId, therapistIds: pool });
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    onToast(pool.length === 0 ? '写真を外しました' : '写真を保存しました（' + pool.length + '枚）');
    await load();
  };
  const dirty = !sameIds(pool, board.photoIds);

  return (
    <section className={CARD}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 hover:bg-slate-50">
        <div className="min-w-0">
          <h2 className="text-[15px] font-black text-slate-800">写真</h2>
          <p className="text-[13px] text-slate-500 leading-relaxed mt-0.5">
            画像を付けていないお知らせに、選んだ中から1枚がランダムで表示されます（投稿のたびに入れ替わります）。
          </p>
        </div>
        <span className="flex items-center gap-2 flex-none pt-0.5">
          {dirty && <span className="text-[12.5px] font-bold text-amber-700">未保存</span>}
          <span className="text-[13px] text-slate-400 tabular-nums">{pool.length} / {ARTICLE_PHOTO_MAX} 枚</span>
          <span className={'text-[13px] text-slate-400 ' + (open ? 'rotate-180' : '')}>▼</span>
        </span>
      </button>

      {open && (
        <div className="px-4 py-3.5 border-t border-slate-200">
          {board.therapists.length === 0 ? (
            <p className="text-[13.5px] text-slate-500 leading-relaxed">
              写真が登録されているセラピストがまだいません。セラピストの画像を入れると、ここから選べるようになります。
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {board.therapists.map((t) => {
                const on = pool.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggle(t.id)} disabled={busy} aria-pressed={on}
                    className={'text-left border p-1 disabled:opacity-60 ' + (on ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50')}>
                    <span className="block aspect-square bg-slate-100 overflow-hidden relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.photoUrl} alt="" className="w-full h-full object-cover" />
                      {on && <span className="absolute left-1 top-1 text-[11px] font-black text-white bg-indigo-600 px-1.5 py-0.5">選択中</span>}
                    </span>
                    <span className={'block text-[12.5px] font-bold truncate mt-1 px-0.5 ' + (on ? 'text-indigo-800' : 'text-slate-600')}>{t.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {dirty && (
            <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-slate-200">
              <button type="button" onClick={() => void onSave()} disabled={busy}
                className="text-[15px] font-black px-6 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
                {busy ? '保存しています…' : '写真を保存する'}
              </button>
              <button type="button" onClick={() => setPool(board.photoIds)} disabled={busy}
                className="text-[14px] font-bold px-3 py-2 text-slate-500 hover:text-slate-700 disabled:opacity-40">
                元に戻す
              </button>
              <span className="text-[13.5px] text-amber-700">まだ保存していません</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
