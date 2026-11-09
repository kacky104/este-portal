'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import {
  getConecfZenkokuOptions, saveConecfZenkokuOption, runConecfZenkokuOptionNow, uploadConecfZenkokuNewsImage, type ConecfZenkokuOption,
} from '@/app/actions/conecfZenkokuOptions';
import { ZENKOKU_NEWS_MAX, ZENKOKU_NEWS_TITLE_MAX, ZENKOKU_NEWS_BODY_MAX, ZENKOKU_OPT_OUTCOME, zenkokuMinLabel } from '@/lib/zenkokuOption';

// コネックエフ「全国エステランキング設定」（第1831便・2026-11-09・カッキーさん）。ベンリーの「ニュース」「おすすめセラピスト」と同じことをする。
// ★ 運営が /admin で ON にした店だけメニューに出る。★ 時間は朝6時はじまりの1日（全国エステランキングのニュースの回数は毎朝6時に戻る）

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');
const outcomeText = (o: string | null) => {
  if (!o) return '—';
  if (o.startsWith('ok: ')) return `「${o.slice(4)}」を送れました`;
  if (o.startsWith('ok_unverified: ')) return `「${o.slice(15)}」を送りました（一覧での確認はまだ）`;
  if (o.startsWith('already: ')) return `${o.slice(9)}さんはもう入っていました`;
  if (o.startsWith('error')) return 'うまくいきませんでした（' + o.replace(/^error:\s*/, '') + '）';
  return ZENKOKU_OPT_OUTCOME[o] ?? o;
};
/** 「6:11」「翌1:00」→ 朝6時はじまりの分 */
function parseTime(t: string): number {
  // ★ 第1838便: 全角の数字・コロン（２１：４２）や「時」区切りでも通す
  const m = /^(翌)?\s*(\d{1,2})\s*[:時]\s*(\d{2})\s*分?$/.exec(t.normalize('NFKC').trim());
  if (!m) return NaN;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] || v < 360 ? v + 1440 : v;
}

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

/** ★ カードの見出し（閉じていても名前・自動・最後の結果と「今すぐ」は見える）。エステ魂オプションの画面と同じ形 */
function AccHead({ title, open, onToggle, auto, last, children }: { title: string; open: boolean; onToggle: () => void; auto: boolean; last: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className={`inline-block w-4 text-violet-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <h2 className="text-[17px] font-bold text-violet-700">{title}</h2>
        <span className={`border px-2 py-0.5 text-[12px] font-bold ${auto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{auto ? '自動 ON' : '自動 OFF'}</span>
        {!open && <span className="truncate text-[12px] text-slate-500">最後：{last}</span>}
      </button>
      {children}
    </div>
  );
}

type NewsRow = { time: string; title: string; body: string; image: string | null; imageUrl: string | null };

function NewsCard({ o, onToast, reload, open, onToggle }: { o: ConecfZenkokuOption; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(o.auto);
  const [rows, setRows] = useState<NewsRow[]>(() => {
    const n = Math.max(o.timesMin.length, o.news.length, 1);
    return Array.from({ length: Math.min(n, ZENKOKU_NEWS_MAX) }, (_, i) => ({
      time: o.timesMin[i] !== undefined ? zenkokuMinLabel(o.timesMin[i]) : '',
      title: o.news[i]?.title ?? '', body: o.news[i]?.body ?? '', image: o.news[i]?.image ?? null, imageUrl: o.news[i]?.imageUrl ?? null,
    }));
  });
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<NewsRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const upload = async (i: number, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', await shrinkToJpeg(file), 'news.jpg');
      const r = await uploadConecfZenkokuNewsImage(fd);
      if (r.ok) { set(i, { image: r.data.path, imageUrl: r.data.url }); onToast('画像を入れました（「保存」を押すと決まります）'); } else onToast(r.error);
    } catch { onToast('画像を読めませんでした'); }
    setBusy(false);
  };
  const save = async () => {
    const used = rows.filter((r) => r.time.trim() !== '' || r.title.trim() !== '' || r.body.trim() !== '');
    const times = used.map((r) => parseTime(r.time));
    if (times.some((t) => !Number.isFinite(t))) { onToast('時刻は「6:11」のように入れてください'); return; }
    if (new Set(times).size !== times.length) { onToast('同じ時刻が2つあります'); return; }
    // ★ 時刻の早い順に並べ替えて保存（i 番目の時刻に i 番目の中身を送る）
    const sorted = used.map((r, i) => ({ r, t: times[i] })).sort((a, b) => a.t - b.t);
    setBusy(true);
    const res = await saveConecfZenkokuOption({ key: 'news', auto, timesMin: sorted.map((x) => x.t), news: sorted.map((x) => ({ title: x.r.title, body: x.r.body, image: x.r.image })) });
    setBusy(false);
    onToast(res.ok ? '保存しました' : res.error);
    if (res.ok) reload();
  };
  const now = async () => {
    setBusy(true);
    const r = await runConecfZenkokuOptionNow({ key: 'news' });
    setBusy(false);
    onToast(r.ok ? '全国エステランキングへ送りました（1〜2分で届きます）' : r.error);
    if (r.ok) setTimeout(reload, 90_000);
  };
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <AccHead title="ニュース投稿" open={open} onToggle={onToggle} auto={o.auto} last={`${when(o.lastAt)}・${outcomeText(o.lastOutcome)}`}>
        <button type="button" disabled={busy} onClick={now} className="ml-auto bg-violet-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">今すぐ1件投稿</button>
      </AccHead>
      {open && (<>
      <p className="text-[13px] leading-relaxed text-slate-600">決めた時刻に、その行のニュースを投稿します。1日5回まで（毎朝6時に戻ります）。「今すぐ1件投稿」も1回に数えます。</p>
      <div className="grid gap-1 text-[13px] text-slate-600 sm:grid-cols-2">
        <div>最後に送れた：<b className="text-slate-800">{when(o.lastAt)}</b></div>
        <div>最後の結果：{outcomeText(o.lastOutcome)}</div>
      </div>
      <div className="space-y-3 border-t border-slate-100 pt-3">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 border border-slate-200 p-3 sm:grid-cols-[90px_1fr_120px]">
            <label className="text-[13px]">時刻
              <input value={r.time} onChange={(e) => set(i, { time: e.target.value })} placeholder="6:11" className="mt-1 w-full border border-slate-300 px-2 py-1" />
            </label>
            <div className="space-y-2">
              <input value={r.title} maxLength={ZENKOKU_NEWS_TITLE_MAX} onChange={(e) => set(i, { title: e.target.value })} placeholder="題名" className="w-full border border-slate-300 px-2 py-1 text-[14px]" />
              <textarea value={r.body} maxLength={ZENKOKU_NEWS_BODY_MAX} onChange={(e) => set(i, { body: e.target.value })} placeholder="本文" rows={5} className="w-full border border-slate-300 px-2 py-1 text-[14px]" />
            </div>
            <div className="space-y-1 text-[12px]">
              {r.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.imageUrl} alt="" className="h-24 w-full border border-slate-200 object-contain" />
                : <div className="flex h-24 items-center justify-center border border-dashed border-slate-300 text-slate-400">画像なし</div>}
              <label className="block cursor-pointer text-center text-violet-700 underline">画像を選ぶ
                <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { void upload(i, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {r.image && <button type="button" onClick={() => set(i, { image: null, imageUrl: null })} className="block w-full text-center text-slate-500 underline">画像を外す</button>}
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="block w-full text-center text-rose-600 underline">この行を消す</button>
            </div>
          </div>
        ))}
        {rows.length < ZENKOKU_NEWS_MAX && (
          <button type="button" onClick={() => setRows((rs) => [...rs, { time: '', title: '', body: '', image: null, imageUrl: null }])} className="border border-dashed border-violet-400 px-3 py-1.5 text-[13px] text-violet-700">＋ 行を足す（{ZENKOKU_NEWS_MAX}件まで）</button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で投稿する</label>
        <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
      </div>
      </>)}
    </section>
  );
}

function RecommendCard({ o, therapists, onToast, reload, open, onToggle }: { o: ConecfZenkokuOption; therapists: string[]; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(o.auto);
  const [time, setTime] = useState(zenkokuMinLabel(o.timesMin[0] ?? 369));
  const [names, setNames] = useState<string[]>(o.recommend.map((r) => r.name));
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = parseTime(time);
    if (!Number.isFinite(t)) { onToast('時刻は「6:09」のように入れてください'); return; }
    setBusy(true);
    const r = await saveConecfZenkokuOption({ key: 'recommend', auto, timesMin: [t], recommend: names.map((name) => ({ name })) });
    setBusy(false);
    onToast(r.ok ? '保存しました' : r.error);
    if (r.ok) reload();
  };
  const now = async () => {
    setBusy(true);
    const r = await runConecfZenkokuOptionNow({ key: 'recommend' });
    setBusy(false);
    onToast(r.ok ? '全国エステランキングへ送りました（1〜2分で届きます）' : r.error);
    if (r.ok) setTimeout(reload, 90_000);
  };
  const move = (i: number, d: -1 | 1) => setNames((ns) => { const a = [...ns]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const next = names.length > 0 ? names[o.nextItem % names.length] : null;
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <AccHead title="おすすめセラピスト" open={open} onToggle={onToggle} auto={o.auto} last={`${when(o.lastAt)}・${outcomeText(o.lastOutcome)}`}>
        <button type="button" disabled={busy} onClick={now} className="ml-auto bg-violet-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">今すぐ次の方にする</button>
      </AccHead>
      {open && (<>
      <p className="text-[13px] leading-relaxed text-slate-600">毎日決めた時刻に、リストの上から1人ずつ「おすすめセラピスト」を入れ替えます。<b>変更回数には月ごとの上限</b>があり、使い切った月は入れ替えません。サイトにいない方・非公開の方は飛ばします。</p>
      <div className="grid gap-1 text-[13px] text-slate-600 sm:grid-cols-3">
        <div>今月の残り：<b className="text-slate-800">{o.remaining ?? '—'}</b>回（{when(o.readAt)} 時点）</div>
        <div>最後に入れ替えた：<b className="text-slate-800">{when(o.lastAt)}</b></div>
        <div>最後の結果：{outcomeText(o.lastOutcome)}</div>
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <ol className="space-y-1">
          {names.map((n, i) => (
            <li key={n + i} className="flex items-center gap-2 border border-slate-200 px-3 py-1.5 text-[14px]">
              <span className="w-6 text-slate-400">{i + 1}</span>
              <span className="flex-1 font-bold">{n}{next === n && i === o.nextItem % names.length && <span className="ml-2 text-[12px] font-normal text-violet-600">← 次はこの方</span>}</span>
              <button type="button" onClick={() => move(i, -1)} className="px-1 text-slate-500">▲</button>
              <button type="button" onClick={() => move(i, 1)} className="px-1 text-slate-500">▼</button>
              <button type="button" onClick={() => setNames((ns) => ns.filter((_, k) => k !== i))} className="px-1 text-rose-600">外す</button>
            </li>
          ))}
          {names.length === 0 && <li className="text-[13px] text-slate-400">まだ誰も入っていません</li>}
        </ol>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="border border-slate-300 px-2 py-1">
            <option value="">セラピストを選ぶ…</option>
            {therapists.filter((t) => !names.includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" disabled={!pick} onClick={() => { setNames((ns) => [...ns, pick]); setPick(''); }} className="border border-violet-600 px-3 py-1 text-violet-700 disabled:opacity-40">リストに足す</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で入れ替える</label>
        <label className="flex items-center gap-2">毎日 <input value={time} onChange={(e) => setTime(e.target.value)} className="w-20 border border-slate-300 px-2 py-1" placeholder="6:09" /></label>
        <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
      </div>
      </>)}
    </section>
  );
}

export default function ConecfZenkokuOptionsPage() {
  const { toast, showToast } = useToast();
  const [opts, setOpts] = useState<ConecfZenkokuOption[] | null>(null);
  const [therapists, setTherapists] = useState<string[]>([]);
  const [error, setError] = useState('');
  // ★ 開いているカード（読み直しでカードが作り直されても閉じないよう、ここで持つ）。はじめは全部閉じる
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpenKeys((m) => ({ ...m, [k]: !m[k] }));
  const load = useCallback(async () => {
    const r = await getConecfZenkokuOptions();
    if (!r.ok) { setError(r.error); return; }
    setOpts(r.data.options); setTherapists(r.data.therapists); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <ConecfShell current="zenkokuOpt" title="全国エステランキング設定" toast={toast}>
      {() => (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-slate-600">全国エステランキングの「ニュース」と「おすすめセラピスト」を、決めた時刻に自動で送ります。1日は朝6時はじまりです（翌朝は「翌1:00」のように入れます）。</p>
          {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
          {!error && !opts && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
          {opts && opts.length === 0 && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使える設定はまだありません。運営事務局までご連絡ください。</div>}
          {opts?.map((o) => o.key === 'news'
            ? <NewsCard key={'news' + String(o.lastAt) + String(o.readAt)} o={o} onToast={showToast} reload={load} open={openKeys.news === true} onToggle={() => toggle('news')} />
            : <RecommendCard key={'rec' + String(o.lastAt) + String(o.readAt)} o={o} therapists={therapists} onToast={showToast} reload={load} open={openKeys.recommend === true} onToggle={() => toggle('recommend')} />)}
        </div>
      )}
    </ConecfShell>
  );
}
