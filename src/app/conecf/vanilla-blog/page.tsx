'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import {
  getConecfVanillaBlog, saveConecfVanillaBlog, runConecfVanillaBlogNow, uploadConecfVanillaBlogImage, type ConecfVanillaBlog,
} from '@/app/actions/conecfVanillaBlog';
import { VANILLA_BLOG_ITEMS_MAX, VANILLA_BLOG_TIMES_MAX, VANILLA_BLOG_TITLE_MAX, VANILLA_BLOG_BODY_MAX, vanillaMinLabel } from '@/lib/vanillaBlog';

// コネックエフ「バニラ店長ブログ」（第1903便・2026-11-10・カッキーさん）。ベンリーの「バニラ(店長ブログ)」と同じことをする。
// ★ 運営が /admin で ON にした店だけ（サイト自動更新一覧の中）。★ 時刻は朝6時はじまりの1日（翌朝は「翌1:00」）
// ★ 決めた時刻ごとに、記事を上から順に1本ずつ投稿し、前にコネックエフが出した記事を消す（ベンリーと同じ）

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');
const outcomeText = (o: string | null) => {
  if (!o) return '—';
  if (o.startsWith('ok: ')) return `「${o.slice(4)}」を投稿しました`;
  if (o.startsWith('ok_unverified: ')) return `「${o.slice(15)}」を投稿しました（一覧での確認はまだ）`;
  if (o.startsWith('ok_not_deleted: ')) return `「${o.slice(16)}」を投稿しました（前の記事を消せたかは確かめられませんでした）`;
  if (o === 'no_items') return '記事が登録されていません';
  if (o.startsWith('error')) return 'うまくいきませんでした（' + o.replace(/^error:\s*/, '') + '）';
  return o;
};
// ★ 第1904便（カッキーさん）: 時刻は文字で打たず、時と分のプルダウンで選ぶ（「28:00」のような書き方で詰まらないように）
//   値は朝6時はじまりの分（6:00 = 360 … 翌5:59 = 1799）
const HOURS = Array.from({ length: 24 }, (_, i) => 6 + i);   // 6 … 29（＝翌5時）
const hourLabel = (h: number) => (h >= 24 ? `翌${h - 24}時` : `${h}時`);
function TimePick({ value, onChange, minutes = true }: { value: number; onChange: (m: number) => void; minutes?: boolean }) {
  const h = Math.floor(value / 60), m = value % 60;
  return (
    <span className="inline-flex items-center gap-1">
      <select value={h} onChange={(e) => onChange(Number(e.target.value) * 60 + (minutes ? m : 0))} className="border border-slate-300 bg-white px-1.5 py-1">
        {HOURS.map((x) => <option key={x} value={x}>{hourLabel(x)}</option>)}
      </select>
      {minutes && (
        <select value={m} onChange={(e) => onChange(h * 60 + Number(e.target.value))} className="border border-slate-300 bg-white px-1.5 py-1">
          {Array.from({ length: 60 }, (_, i) => i).map((x) => <option key={x} value={x}>{String(x).padStart(2, '0')}分</option>)}
        </select>
      )}
    </span>
  );
}
const GAP_CHOICES = [30, 45, 60, 90, 120, 180, 240];

/** ★ ブラウザで長い辺 1440px の JPEG に縮めてから送る（サーバーアクションの上限 1MB の内側） */
async function shrinkToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error('read')); el.src = url; });
    const scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

type Row = { title: string; body: string; image: string | null; imageUrl: string | null };

function Editor({ v, onToast, reload }: { v: ConecfVanillaBlog; onToast: (m: string) => void; reload: () => void }) {
  const href = useConecfHref();
  const [auto, setAuto] = useState(v.auto);
  const [deleteOld, setDeleteOld] = useState(v.deleteOld);
  const [times, setTimes] = useState<number[]>(v.timesMin);
  const [addAt, setAddAt] = useState(368);
  const [rows, setRows] = useState<Row[]>(() => (v.items.length > 0 ? v.items.map((x) => ({ ...x })) : [{ title: '', body: '', image: null, imageUrl: null }]));
  // ★ 間隔で入れる（ベンリーの「間隔で更新」の代わり）
  const [gapFrom, setGapFrom] = useState(368);
  const [gapTo, setGapTo] = useState(1620);
  const [gapMin, setGapMin] = useState(90);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => { const a = [...rs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  const fillByGap = () => {
    if (gapTo < gapFrom) { onToast('終わりの時刻は、はじめの時刻より後にしてください'); return; }
    const list: number[] = [];
    for (let t = gapFrom; t <= gapTo && list.length < VANILLA_BLOG_TIMES_MAX; t += gapMin) list.push(t);
    setTimes(list);
    onToast(`${list.length}個の時刻を入れました（「保存」を押すと決まります）`);
  };
  const addTime = () => {
    if (times.includes(addAt)) { onToast('その時刻はもう入っています'); return; }
    if (times.length >= VANILLA_BLOG_TIMES_MAX) { onToast(`時刻は${VANILLA_BLOG_TIMES_MAX}個までです`); return; }
    setTimes((ts) => [...ts, addAt].sort((x, y) => x - y));
  };
  const upload = async (i: number, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', await shrinkToJpeg(file), 'blog.jpg');
      const r = await uploadConecfVanillaBlogImage(fd);
      if (r.ok) { set(i, { image: r.data.path, imageUrl: r.data.url }); onToast('画像を入れました（「保存」を押すと決まります）'); } else onToast(r.error);
    } catch { onToast('画像を読めませんでした'); }
    setBusy(false);
  };
  const save = async () => {
    const t = [...new Set(times)].sort((x, y) => x - y);
    const used = rows.filter((r) => r.title.trim() !== '' || r.body.trim() !== '' || r.image);
    setBusy(true);
    const res = await saveConecfVanillaBlog({ auto, deleteOld, timesMin: t, items: used.map((r) => ({ title: r.title, body: r.body, image: r.image })) });
    setBusy(false);
    onToast(res.ok ? '保存しました' : res.error);
    if (res.ok) reload();
  };
  const now = async () => {
    setBusy(true);
    const r = await runConecfVanillaBlogNow();
    setBusy(false);
    onToast(r.ok ? 'バニラへ投稿を始めました（1〜3分で届きます）' : r.error);
    if (r.ok) setTimeout(reload, 120_000);
  };
  const next = v.items.length > 0 ? v.nextItem % v.items.length : -1;

  return (
    <div className="space-y-4">
      {!v.hasLogin && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          バニラのログインID・パスワードがまだ登録されていません。先に<Link href={href('/sites')} className="mx-1 font-bold underline">ID・パスワード登録</Link>で「バニラ」を登録してください。
        </div>
      )}
      <section className={`${CARD} space-y-3 p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={`text-[17px] font-bold ${v.auto ? 'conecf-glint' : 'text-violet-700'}`}>投稿の時刻</h2>
          <span className={`border px-2 py-0.5 text-[12px] font-bold ${v.auto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{v.auto ? '自動 ON' : '自動 OFF'}</span>
          <button type="button" disabled={busy || !v.hasLogin} onClick={now} className="ml-auto bg-violet-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">今すぐ次の1本を投稿</button>
        </div>
        <div className="grid gap-1 text-[13px] text-slate-600 sm:grid-cols-2">
          <div>最後に投稿できた：<b className="text-slate-800">{when(v.lastAt)}</b></div>
          <div>最後の結果：{outcomeText(v.lastOutcome)}</div>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-600">
          決めた時刻が来るたびに、下の記事を上から順に1本ずつ投稿します（最後まで行ったら1本目へ戻ります）。1日は朝6時はじまりです（夜中の0時〜5時台は「翌0時」〜「翌5時」で選びます）。
        </p>
        <div className="text-[13px] font-bold text-slate-700">時刻（{times.length}個・{VANILLA_BLOG_TIMES_MAX}個まで）</div>
        <div className="flex flex-wrap gap-1.5">
          {times.length === 0 && <span className="text-[13px] text-slate-400">まだ入っていません（下で選んで足してください）</span>}
          {times.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 border border-violet-300 bg-violet-50 px-2 py-0.5 text-[13px] text-violet-800">
              {vanillaMinLabel(t)}
              <button type="button" onClick={() => setTimes((ts) => ts.filter((x) => x !== t))} className="text-violet-400 hover:text-rose-600" aria-label={vanillaMinLabel(t) + 'を消す'}>×</button>
            </span>
          ))}
          {times.length > 0 && <button type="button" onClick={() => setTimes([])} className="px-1 text-[12px] text-slate-500 underline">すべて消す</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
          <span>1つ足す：</span>
          <TimePick value={addAt} onChange={setAddAt} />
          <button type="button" onClick={addTime} className="border border-violet-400 px-3 py-1 text-violet-700">足す</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
          <span>間隔でまとめて入れる：</span>
          <TimePick value={gapFrom} onChange={setGapFrom} />
          <span>から</span>
          <TimePick value={gapTo} onChange={setGapTo} />
          <span>まで</span>
          <select value={gapMin} onChange={(e) => setGapMin(Number(e.target.value))} className="border border-slate-300 bg-white px-1.5 py-1">
            {GAP_CHOICES.map((g) => <option key={g} value={g}>{g}分おき</option>)}
          </select>
          <button type="button" onClick={fillByGap} className="border border-violet-400 px-3 py-1 text-violet-700">時刻を入れる</button>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={deleteOld} onChange={(e) => setDeleteOld(e.target.checked)} className="mt-1" />
          <span>新しく投稿できたら、前にコネックエフが投稿した記事を消す（ベンリーと同じ。記事の画像も消えます）</span>
        </label>
      </section>

      <section className={`${CARD} space-y-3 p-5`}>
        <h2 className="text-[17px] font-bold text-violet-700">記事（{VANILLA_BLOG_ITEMS_MAX}本まで）</h2>
        <p className="text-[13px] leading-relaxed text-slate-600">タイトルは{VANILLA_BLOG_TITLE_MAX}文字まで、本文は{VANILLA_BLOG_BODY_MAX}文字までです。本文の改行はそのまま改行で載ります。画像は1枚（バニラでは正方形 300×300 に切って載ります）。</p>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 border border-slate-200 p-3 sm:grid-cols-[1fr_130px]">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-slate-500">
                <b className="text-slate-700">{i + 1}本目</b>
                {i === next && v.auto && <span className="text-violet-600">← 次はこの記事</span>}
              </div>
              <input value={r.title} maxLength={VANILLA_BLOG_TITLE_MAX} onChange={(e) => set(i, { title: e.target.value })} placeholder="タイトル" className="w-full border border-slate-300 px-2 py-1 text-[14px]" />
              <textarea value={r.body} maxLength={VANILLA_BLOG_BODY_MAX} onChange={(e) => set(i, { body: e.target.value })} placeholder="本文" rows={8} className="w-full border border-slate-300 px-2 py-1 text-[14px]" />
              <div className="text-right text-[12px] text-slate-400">{r.body.length} / {VANILLA_BLOG_BODY_MAX}</div>
            </div>
            <div className="space-y-1 text-[12px]">
              {r.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.imageUrl} alt="" className="aspect-square w-full border border-slate-200 object-cover" />
                : <div className="flex aspect-square w-full items-center justify-center border border-dashed border-slate-300 text-slate-400">画像なし</div>}
              <label className="block cursor-pointer text-center text-violet-700 underline">画像を選ぶ
                <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { void upload(i, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {r.image && <button type="button" onClick={() => set(i, { image: null, imageUrl: null })} className="block w-full text-center text-slate-500 underline">画像を外す</button>}
              <div className="flex justify-center gap-3 pt-1">
                <button type="button" onClick={() => move(i, -1)} className="text-slate-500">▲</button>
                <button type="button" onClick={() => move(i, 1)} className="text-slate-500">▼</button>
              </div>
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="block w-full text-center text-rose-600 underline">この記事を消す</button>
            </div>
          </div>
        ))}
        {rows.length < VANILLA_BLOG_ITEMS_MAX && (
          <button type="button" onClick={() => setRows((rs) => [...rs, { title: '', body: '', image: null, imageUrl: null }])} className="border border-dashed border-violet-400 px-3 py-1.5 text-[13px] text-violet-700">＋ 記事を足す</button>
        )}
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 text-[14px]">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で投稿する</label>
        <button type="button" disabled={busy} onClick={save} className="bg-violet-600 px-5 py-2 font-bold text-white disabled:opacity-40">保存</button>
      </div>
    </div>
  );
}

export default function ConecfVanillaBlogPage() {
  const { toast, showToast } = useToast();
  const [v, setV] = useState<ConecfVanillaBlog | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await getConecfVanillaBlog();
    if (!r.ok) { setError(r.error); return; }
    setV(r.data); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <ConecfShell current="vanillaBlog" title="バニラ店長ブログ" toast={toast}>
      {() => (
        <div className="space-y-4 pb-24">
          {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
          {!error && v === undefined && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
          {v === null && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>バニラ店長ブログは、まだ使えるようになっていません。「運営お問い合わせ」からご連絡ください。</div>}
          {v && <Editor key={String(v.lastAt) + String(v.readAt)} v={v} onToast={showToast} reload={load} />}
        </div>
      )}
    </ConecfShell>
  );
}
