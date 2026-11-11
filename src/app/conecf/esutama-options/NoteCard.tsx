'use client';

// コネックエフ「エステ魂オプション」の写メNote のカード（第1941便・2026-11-11・カッキーさん）。★ 決まりは lib/esutamaNote.ts
// ★ ベンリーの「エステ魂【オプション】(【新】写メNote)」と同じ形: 投稿内容（タイトル・本文・画像3枚・カテゴリ・セラピスト）を
//   何件か並べ、決めた間隔で上から順に1件ずつ投稿する。並べた内容は「設定を保存」で決まる。

import { useState } from 'react';
import {
  saveConecfEsutamaNote, runConecfEsutamaNoteNow, uploadConecfEsutamaNoteImage, type ConecfEsutamaNote,
} from '@/app/actions/conecfEsutamaNotes';
import {
  ESUTAMA_NOTE_CATEGORIES, ESUTAMA_NOTE_TITLE_MAX, ESUTAMA_NOTE_BODY_MAX, ESUTAMA_NOTE_IMAGE_MAX, ESUTAMA_NOTE_ITEMS_MAX, esutamaNoteItemProblem,
} from '@/lib/esutamaNote';
import { ESUTAMA_POST_INTERVALS } from '@/lib/esutamaPost';

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const HOURS = Array.from({ length: 25 }, (_, i) => 360 + i * 60); // 6:00 〜 翌6:00
const label = (m: number) => (m >= 1440 ? `翌${Math.floor((m - 1440) / 60)}:${String(m % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');
const intervalLabel = (m: number) => (m % 60 === 0 ? `${m / 60}時間` : m > 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`);
const outcomeText = (o: string | null) => (!o ? '—' : o === 'sent' ? '送れました' : o === 'unknown' ? '送りました（受け取られたか判定できませんでした）' : 'うまくいきませんでした' + (o.startsWith('failed: ') ? '（' + o.slice(8).split(' → ').slice(-1)[0] + '）' : ''));

/** ブラウザで長い辺 1440px の JPEG に縮めてから送る（サーバーアクションの上限の内側） */
async function shrinkToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('read'));
      el.src = url;
    });
    const scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Row = { title: string; body: string; categoryId: string; therapistId: number | null; images: Array<{ path: string; url: string }> };
const emptyRow = (): Row => ({ title: '', body: '', categoryId: '1', therapistId: null, images: [] });

export function EsutamaNoteCard({ n, onToast, reload, open, onToggle }: { n: ConecfEsutamaNote; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(n.auto);
  const [startMin, setStart] = useState(n.startMin);
  const [endMin, setEnd] = useState(n.endMin);
  const [intervalMin, setIntervalMin] = useState(n.intervalMin);
  const [rows, setRows] = useState<Row[]>(n.items.map((it) => ({ title: it.title, body: it.body, categoryId: it.categoryId, therapistId: it.therapistId, images: it.images.map((p, i) => ({ path: p, url: it.imageUrls[i] ?? '' })) })));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rows.map((r) => ({ ...r, images: r.images.map((x) => x.path) })))
    !== JSON.stringify(n.items.map((it) => ({ title: it.title, body: it.body, categoryId: it.categoryId, therapistId: it.therapistId, images: it.images })))
    || auto !== n.auto || startMin !== n.startMin || endMin !== n.endMin || intervalMin !== n.intervalMin;
  const set = (i: number, patch: Partial<Row>) => setRows((v) => v.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const nextNo = rows.length > 0 ? (n.nextIndex % rows.length) : -1;

  const addImage = async (i: number, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', await shrinkToJpeg(file), 'image.jpg');
      const r = await uploadConecfEsutamaNoteImage(fd);
      if (!r.ok) { onToast(r.error); return; }
      setRows((v) => v.map((row, j) => (j === i ? { ...row, images: [...row.images, r.data].slice(0, ESUTAMA_NOTE_IMAGE_MAX) } : row)));
      onToast('画像を入れました。「設定を保存」で決まります');
    } catch {
      onToast('画像を読めませんでした');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const bad = rows.findIndex((r) => esutamaNoteItemProblem({ ...r, images: [] }) !== null);
    if (bad >= 0) { onToast(`${bad + 1}件目: ${esutamaNoteItemProblem({ ...rows[bad], images: [] })}`); return; }
    setBusy(true);
    const r = await saveConecfEsutamaNote({ auto, startMin, endMin, intervalMin, items: rows.map((x) => ({ ...x, images: x.images.map((im) => im.path) })) });
    setBusy(false);
    onToast(r.ok ? '保存しました' : r.error);
    if (r.ok) reload();
  };
  const now = async () => {
    if (dirty) { onToast('内容を変えたときは、先に「設定を保存」を押してください'); return; }
    if (nextNo < 0) { onToast('投稿内容を1件以上入れてください'); return; }
    if (!window.confirm(`${nextNo + 1}件目を、いまエステ魂の写メNote に1件投稿します（セラピストの名前で載り、お店からは消せません）。よろしいですか？`)) return;
    setBusy(true);
    const r = await runConecfEsutamaNoteNow();
    setBusy(false);
    onToast(r.ok ? r.data.note : r.error);
    if (r.ok) setTimeout(reload, 180_000);
  };

  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
          <span className={`inline-block w-4 text-violet-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <h2 className={`text-[17px] font-bold ${n.auto ? 'conecf-glint' : 'text-violet-700'}`}>写メNote</h2>
          <span className={`border px-2 py-0.5 text-[12px] font-bold ${n.auto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{n.auto ? '自動 ON' : '自動 OFF'}</span>
          {!open && <span className="truncate text-[12px] text-slate-500">最後：{when(n.lastAt)}・{outcomeText(n.lastOutcome)}</span>}
        </button>
        <button type="button" disabled={busy} onClick={now} className="ml-auto bg-violet-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">今すぐ投稿</button>
      </div>
      {open && (<>
        <p className="text-[13px] leading-relaxed text-slate-600">
          並べた投稿内容を、決めた間隔で上から順に1件ずつ、選んだセラピストの写メNote に投稿します（最後まで行ったら1件目に戻ります）。
          セラピスト本人のアカウントに代理ログインして投稿するので、エステ魂で魂セラピストを始めている方だけ送れます。
        </p>
        <div className="grid gap-1 text-[13px] text-slate-600 sm:grid-cols-3">
          <div>最後に投稿できた：<b className="text-slate-800">{when(n.lastAt)}</b></div>
          <div>最後の結果：{outcomeText(n.lastOutcome)}</div>
          <div>次に送るのは：<b className="text-slate-800">{nextNo >= 0 ? `${nextNo + 1}件目` : '—'}</b></div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で投稿する
          </label>
          <span className="flex items-center gap-1">
            <select value={startMin} onChange={(e) => setStart(Number(e.target.value))} className="border border-slate-300 px-2 py-1">
              {HOURS.slice(0, -1).map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
            〜
            <select value={endMin} onChange={(e) => setEnd(Number(e.target.value))} className="border border-slate-300 px-2 py-1">
              {HOURS.slice(1).map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </span>
          <select value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} className="border border-slate-300 px-2 py-1">
            {ESUTAMA_POST_INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}おき</option>)}
          </select>
        </div>

        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className={`border ${i === nextNo ? 'border-violet-400' : 'border-slate-200'} bg-slate-50/60`}>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
                <span className="text-[14px] font-bold text-slate-700">
                  <span className="mr-2 inline-block min-w-7 bg-slate-800 px-1.5 text-center text-white">{i + 1}</span>件目{i === nextNo && <span className="ml-2 text-[12px] font-bold text-violet-600">（次に送る）</span>}
                </span>
                <span className="flex gap-3 text-[13px] font-bold text-blue-600">
                  {i > 0 && <button type="button" onClick={() => setRows((v) => { const c = [...v]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })} className="underline">↑</button>}
                  {i < rows.length - 1 && <button type="button" onClick={() => setRows((v) => { const c = [...v]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })} className="underline">↓</button>}
                  <button type="button" onClick={() => { if (window.confirm(`${i + 1}件目を消しますか？（「設定を保存」を押すまでは決まりません）`)) setRows((v) => v.filter((_, j) => j !== i)); }} className="text-rose-600 underline">枠を削除</button>
                </span>
              </div>
              <div className="space-y-2 p-3 text-[14px]">
                <label className="block">
                  <span className="font-bold">タイトル</span>
                  <span className={`ml-2 text-[12px] ${[...r.title].length > ESUTAMA_NOTE_TITLE_MAX ? 'text-rose-600' : 'text-slate-500'}`}>{[...r.title].length}/{ESUTAMA_NOTE_TITLE_MAX}</span>
                  <input value={r.title} onChange={(e) => set(i, { title: e.target.value })} className="mt-1 w-full border border-slate-300 bg-white px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="font-bold">本文</span>
                  <span className={`ml-2 text-[12px] ${[...r.body].length > ESUTAMA_NOTE_BODY_MAX ? 'text-rose-600' : 'text-slate-500'}`}>{[...r.body].length}/{ESUTAMA_NOTE_BODY_MAX}</span>
                  <textarea value={r.body} onChange={(e) => set(i, { body: e.target.value })} rows={5} className="mt-1 w-full border border-slate-300 bg-white px-2 py-1.5" />
                </label>
                <div>
                  <span className="font-bold">画像</span><span className="ml-2 text-[12px] text-slate-500">{r.images.length}/{ESUTAMA_NOTE_IMAGE_MAX}枚（入れないときは、セラピストのプロフィール写真から1枚を付けます）</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {r.images.map((im, k) => (
                      <div key={im.path} className="relative w-[84px] border border-slate-200 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.url} alt={`画像${k + 1}`} className="block h-[130px] w-full object-cover" />
                        <button type="button" onClick={() => set(i, { images: r.images.filter((_, x) => x !== k) })} className="block w-full py-0.5 text-[11px] text-rose-600">外す</button>
                      </div>
                    ))}
                    {r.images.length < ESUTAMA_NOTE_IMAGE_MAX && (
                      <label className={`flex h-[130px] w-[84px] cursor-pointer items-center justify-center border border-dashed border-slate-300 bg-white text-[12px] text-slate-500 ${busy ? 'opacity-40' : ''}`}>
                        ＋ 追加
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void addImage(i, f); }} />
                      </label>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">カテゴリ</span>
                  <select value={r.categoryId} onChange={(e) => set(i, { categoryId: e.target.value })} className="border border-slate-300 bg-white px-2 py-1">
                    {ESUTAMA_NOTE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <select value={r.therapistId ?? ''} onChange={(e) => set(i, { therapistId: e.target.value ? Number(e.target.value) : null })}
                    className={`border bg-white px-2 py-1 ${r.therapistId ? 'border-slate-300' : 'border-rose-400'}`}>
                    <option value="">セラピストを選ぶ</option>
                    {n.therapists.map((t) => <option key={t.id} value={t.id} disabled={!t.linked}>{t.name}{t.linked ? '' : '（エステ魂と未連携）'}</option>)}
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ol>
        {rows.length < ESUTAMA_NOTE_ITEMS_MAX && (
          <div className="flex justify-center">
            <button type="button" onClick={() => setRows((v) => [...v, emptyRow()])} className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-[24px] font-bold text-white" aria-label="投稿内容を1件足す">＋</button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-3">
          <button type="button" disabled={busy} onClick={save} className="bg-emerald-700 px-6 py-2 text-[15px] font-black text-white disabled:opacity-40">設定を保存</button>
          {dirty && <span className="text-[13px] text-amber-700">まだ保存していない変更があります</span>}
        </div>
      </>)}
    </section>
  );
}
