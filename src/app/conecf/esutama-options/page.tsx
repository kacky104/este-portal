'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import {
  getConecfEsutamaOptions, saveConecfEsutamaOption, runConecfEsutamaOptionNow, type ConecfEsutamaOption,
  getConecfEsutamaPosts, saveConecfEsutamaPost, runConecfEsutamaPostNow, type ConecfEsutamaPost,
  addConecfEsutamaPostImage, removeConecfEsutamaPostImage,
} from '@/app/actions/conecfEsutamaOptions';
import { getConecfEsutamaNote, type ConecfEsutamaNote } from '@/app/actions/conecfEsutamaNotes';
import { EsutamaNoteCard } from './NoteCard';
import { ESUTAMA_POST_TITLE_MAX, esutamaPostBodyMax, ESUTAMA_POST_INTERVALS, ESUTAMA_POST_IMAGE_MAX, ESUTAMA_POST_DAILY, isDailyPostKey } from '@/lib/esutamaPost';

/** ★ 第1812便: ブラウザで長い辺 1440px の JPEG に縮めてから送る（サーバーアクションの上限 1MB の内側） */
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

// コネックエフ「エステ魂オプション」（第1799便・2026-11-09・カッキーさんの決定）。
// ★ 運営が /admin で ON にした店だけメニューに出る。★ 押すのはエステ魂で契約している有料オプションのボタン。
// ★ 時間は「朝6時はじまり」の1日（エステ魂の回数が朝6時に戻るため）。翌朝の時刻は「翌2:00」のように出す。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const HOURS = Array.from({ length: 25 }, (_, i) => 360 + i * 60); // 6:00 〜 翌6:00
const label = (m: number) => (m >= 1440 ? `翌${Math.floor((m - 1440) / 60)}:${String(m % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');

const DESC: Record<string, string> = {
  job_now: '「本日体験入店できるお店」をいつも掲載中にします。1時間に1回見て、止まっていたら掲載開始を押します（毎日0時に止まるため）。',
  shop_boost: '「◎今すぐご案内可」を表示し続けます（1回で1時間・1日24回まで。集客BOOSTER 契約で無制限）。押すたびに、出勤時間内のセラピストのご案内状況を「今すぐ」に、出勤時間が終わった方を「受付終了」にします（お店で選んだ「完売」などはそのまま）。',
  cast_appeal: 'その日の出勤者のうち、最後のアピールがいちばん古い方から、出勤時間内にアピールします（1時間に1回まで）。',
  job_appeal: '求人情報・お仕事体験談（残りがある行を両方）を、決めた時刻にアピールします。1日10回・毎朝6時に戻ります。',
};
const OUTCOME: Record<string, string> = { already: '掲載中でした（押していません）', ok: '押せました', no_remaining: '残り0回でした', no_cast: '出勤時間内のセラピストがいませんでした', not_ready: '準備中' };
// ★ 'ok: ◯◯' の◯◯は、セラピストアピールは名前・求人ワンクリックアピールは行の名前（求人情報・お仕事体験談）
// ★ 第1882便: 失敗の理由も出す（「うまくいきませんでした」だけでは何が起きたか分からなかった）
const errorText = (o: string) => {
  const r = o.replace(/^error:\s*/, '');
  const m: Record<string, string> = {
    unparseable: 'エステ魂の画面を読み取れませんでした',
    not_accepted: '押しましたが、回数が減りませんでした',
    verify_unreadable: '押したあと、画面を読み直せませんでした',
    not_listed: '掲載開始を押しましたが、掲載中になりませんでした',
  };
  return 'うまくいきませんでした（' + (m[r] ?? (/^http \d+$/.test(r) ? 'エステ魂の応答 ' + r.slice(5) : r)) + '）';
};
const outcomeText = (o: string | null, key?: string) => (!o ? '—' : o.startsWith('ok: ') ? (key === 'cast_appeal' ? `${o.slice(4)}さんを押せました` : `${o.slice(4)}を押せました`) : OUTCOME[o] ?? (o.startsWith('error') ? errorText(o) : o));

// ★ 第1815便: 縦に長くなったので、カードを開け閉めできるように（閉じていても名前・自動・最後の結果と「今すぐ」は見える）
function AccHead({ title, open, onToggle, auto, last, children }: { title: string; open: boolean; onToggle: () => void; auto: boolean; last: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className={`inline-block w-4 text-violet-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <h2 className={`text-[17px] font-bold ${auto ? 'conecf-glint' : 'text-violet-700'}`}>{title}</h2>
        <span className={`border px-2 py-0.5 text-[12px] font-bold ${auto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{auto ? '自動 ON' : '自動 OFF'}</span>
        {!open && <span className="truncate text-[12px] text-slate-500">最後：{last}</span>}
      </button>
      {children}
    </div>
  );
}

function OptionCard({ o, onToast, reload, open, onToggle }: { o: ConecfEsutamaOption; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(o.auto);
  const [startMin, setStart] = useState(o.startMin);
  const [endMin, setEnd] = useState(o.endMin);
  const [intervalMin, setInterval] = useState(o.intervalMin);
  const [timesText, setTimesText] = useState(o.timesMin.map(label).join(', '));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    // 「10:04, 20:06, 翌1:00」→ 朝6時はじまりの分
    const timesMin = timesText.split(/[,、\s]+/).map((t) => t.trim()).filter(Boolean).map((t) => {
      const m = /^(翌)?(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) return NaN;
      const v = Number(m[2]) * 60 + Number(m[3]);
      return m[1] || v < 360 ? v + 1440 : v;
    });
    if (o.key === 'job_appeal' && timesMin.some((v) => !Number.isFinite(v))) { onToast('時刻は「10:04, 20:06」のように入れてください'); return; }
    const r = await saveConecfEsutamaOption({ key: o.key, auto, startMin, endMin, intervalMin, timesMin });
    setBusy(false);
    onToast(r.ok ? '保存しました' : r.error);
    if (r.ok) reload();
  };
  const now = async () => {
    setBusy(true);
    const r = await runConecfEsutamaOptionNow({ key: o.key });
    setBusy(false);
    onToast(r.ok ? 'エステ魂へ送りました（1〜2分で届きます）' : r.error);
    if (r.ok) setTimeout(reload, 90_000);
  };
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <AccHead title={o.label} open={open} onToggle={onToggle} auto={o.auto} last={`${when(o.lastAt)}・${outcomeText(o.lastOutcome, o.key)}`}>
        {!o.ready && <span className="border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] text-amber-800">準備中</span>}
        <button type="button" disabled={busy || !o.ready} onClick={now}
          className="ml-auto bg-violet-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">今すぐ押す</button>
      </AccHead>
      {open && (<>
      <p className="text-[13px] leading-relaxed text-slate-600">{DESC[o.key]}</p>
      <div className="grid gap-1 text-[13px] text-slate-600 sm:grid-cols-3">
        <div>残り回数：<b className="text-slate-800">{o.remaining ?? '—'}</b>回（{when(o.readAt)} 時点）</div>
        <div>最後に押せた：<b className="text-slate-800">{when(o.lastAt)}</b></div>
        <div>最後の結果：{outcomeText(o.lastOutcome, o.key)}</div>
      </div>
      {o.ready && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で押す
          </label>
          {o.key === 'job_appeal' ? (
            <label className="flex items-center gap-2">押す時刻
              <input value={timesText} onChange={(e) => setTimesText(e.target.value)} className="w-56 border border-slate-300 px-2 py-1" placeholder="10:04, 20:06, 22:00" />
            </label>
          ) : (
          <span className="flex items-center gap-1">
            <select value={startMin} onChange={(e) => setStart(Number(e.target.value))} className="border border-slate-300 px-2 py-1">
              {HOURS.slice(0, -1).map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
            〜
            <select value={endMin} onChange={(e) => setEnd(Number(e.target.value))} className="border border-slate-300 px-2 py-1">
              {HOURS.slice(1).map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </span>
          )}
          {o.key === 'shop_boost' && (
            <select value={intervalMin} onChange={(e) => setInterval(Number(e.target.value))} className="border border-slate-300 px-2 py-1">
              {[60, 90, 120].map((m) => <option key={m} value={m}>{m}分おき</option>)}
            </select>
          )}
          <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
        </div>
      )}
      </>)}
    </section>
  );
}

// ★ 第1811便: 投稿（リアルタイム集客）。保存した文章を、決めた間隔で投稿する
const POST_DESC: Record<string, string> = {
  job_blog: '「店長の求人ブログ」に下の文章を決めた間隔で投稿します（1日10回まで）。画像は3枚まで、毎回1つずつずらします。',
  mailmag: '「メールマガジン」を毎日決めた時刻に1通配信します（登録しているお客様へ本当に届きます）。3時間過ぎたらその日は送りません。',
  job_realtime: '「リアルタイム求人」に下の文章を決めた間隔で投稿します。画像は投稿のたびに1枚ずつ替えます（無ければ今の画像のまま）。',
  guest_realtime: '「リアルタイム集客」に下の文章を決めた間隔で投稿します。画像は投稿のたびに1枚ずつ替えます（無ければ今の画像のまま）。',
};
const postOutcomeText = (o: string | null) => (!o ? '—' : o === 'ok' ? '送れました' : o.startsWith('ok: 画像は前のまま') ? '投稿できました（画像は前のまま）' + o.slice('ok: 画像は前のまま'.length) : o.startsWith('ok: 画像なし') ? '投稿できました（画像なし）' + o.slice('ok: 画像なし'.length) : o.startsWith('error') ? errorText(o) : o);

function PostCard({ p, onToast, reload, open, onToggle }: { p: ConecfEsutamaPost; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(p.auto);
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [startMin, setStart] = useState(p.startMin);
  const [endMin, setEnd] = useState(p.endMin);
  const [intervalMin, setIntervalMin] = useState(p.intervalMin);
  const [busy, setBusy] = useState(false);
  const dirty = title !== p.title || body !== p.body;
  const daily = isDailyPostKey(p.key);
  const addImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await shrinkToJpeg(file);
      const fd = new FormData();
      fd.set('key', p.key);
      fd.set('file', blob, 'image.jpg');
      const r = await addConecfEsutamaPostImage(fd);
      onToast(r.ok ? '画像を追加しました' : r.error);
      if (r.ok) reload();
    } catch {
      onToast('画像を読めませんでした');
    } finally {
      setBusy(false);
    }
  };
  const removeImage = async (path: string) => {
    if (!window.confirm('この画像を消します。よろしいですか？')) return;
    setBusy(true);
    const r = await removeConecfEsutamaPostImage({ key: p.key, path });
    setBusy(false);
    onToast(r.ok ? '画像を消しました' : r.error);
    if (r.ok) reload();
  };
  const save = async () => {
    setBusy(true);
    const r = await saveConecfEsutamaPost({ key: p.key, auto, title, body, startMin, endMin, intervalMin });
    setBusy(false);
    onToast(r.ok ? '保存しました' : r.error);
    if (r.ok) reload();
  };
  const now = async () => {
    if (dirty) { onToast('文章を変えたときは、先に「保存」を押してください'); return; }
    if (!window.confirm(daily ? 'いまの文章で、メールマガジンを1通配信します（登録しているお客様へ本当にメールが届きます）。よろしいですか？' : 'いまの文章で、エステ魂に1件投稿します。よろしいですか？')) return;
    setBusy(true);
    const r = await runConecfEsutamaPostNow({ key: p.key });
    setBusy(false);
    onToast(r.ok ? 'エステ魂へ送りました（1〜2分で届きます）' : r.error);
    if (r.ok) setTimeout(reload, 90_000);
  };
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <AccHead title={p.label} open={open} onToggle={onToggle} auto={p.auto} last={`${when(p.lastAt)}・${postOutcomeText(p.lastOutcome)}`}>
        <button type="button" disabled={busy} onClick={now}
          className="ml-auto bg-violet-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">{daily ? '今すぐ配信' : '今すぐ投稿'}</button>
      </AccHead>
      {open && (<>
      <p className="text-[13px] leading-relaxed text-slate-600">{POST_DESC[p.key]}</p>
      <div className="grid gap-1 text-[13px] text-slate-600 sm:grid-cols-2">
        <div>{daily ? '最後に配信できた' : '最後に投稿できた'}：<b className="text-slate-800">{when(p.lastAt)}</b></div>
        <div>最後の結果：{postOutcomeText(p.lastOutcome)}</div>
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-3 text-[14px]">
        <label className="block">
          <span className="font-bold">タイトル</span>
          <span className="ml-2 text-[12px] text-slate-500">{[...title].length}/{ESUTAMA_POST_TITLE_MAX}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-slate-300 px-2 py-1.5" placeholder="例：本日限定割引" />
        </label>
        <label className="block">
          <span className="font-bold">本文</span>
          <span className="ml-2 text-[12px] text-slate-500">{[...body].length}/{esutamaPostBodyMax(p.key)}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="mt-1 w-full border border-slate-300 px-2 py-1.5" />
        </label>
      </div>
      {!daily && (
      <div className="space-y-2 border-t border-slate-100 pt-3 text-[14px]">
        <div>
          <span className="font-bold">画像</span>
          <span className="ml-2 text-[12px] text-slate-500">{p.images.length}/{ESUTAMA_POST_IMAGE_MAX}枚・{p.key === 'job_blog' ? '1回に3枚まで付け、投稿のたびに並びを1つずらします' : '投稿のたびに順番に替わります'}（正方形に切り抜いて送ります）</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {p.images.map((im, i) => (
            <div key={im.path} className={`relative w-[110px] border ${p.images.length > 0 && i === p.nextImage % p.images.length ? 'border-violet-500 border-2' : 'border-slate-200'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.url} alt={`画像${i + 1}`} className="block h-[110px] w-full object-cover" />
              <div className="flex items-center justify-between px-1 py-0.5 text-[11px]">
                <span className="text-slate-600">{i + 1}枚目{p.images.length > 0 && i === p.nextImage % p.images.length ? '（次）' : ''}</span>
                <button type="button" disabled={busy} onClick={() => removeImage(im.path)} className="text-rose-600 disabled:opacity-40">消す</button>
              </div>
            </div>
          ))}
          {p.images.length < ESUTAMA_POST_IMAGE_MAX && (
            <label className={`flex h-[110px] w-[110px] cursor-pointer items-center justify-center border border-dashed border-slate-300 text-[13px] text-slate-500 ${busy ? 'opacity-40' : ''}`}>
              ＋ 追加
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void addImage(f); }} />
            </label>
          )}
        </div>
      </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
        <label className="flex items-center gap-2 font-bold">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {daily ? '毎日自動で配信する' : '自動で投稿する'}
        </label>
        {daily ? (
          <label className="flex items-center gap-2">送る時刻
            {/* ★ 第1819便: 1分単位で選べるように（ベンリーの 11:47 などそのまま入れられる）。0〜5時台は翌日の扱い（朝6時はじまり） */}
            <input type="time" step={60} value={`${String(Math.floor(startMin / 60) % 24).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`}
              onChange={(e) => {
                const m = /^(\d{2}):(\d{2})$/.exec(e.target.value);
                if (!m) return;
                const v = Number(m[1]) * 60 + Number(m[2]);
                setStart(v < 360 ? v + 1440 : v); setEnd(1800); setIntervalMin(ESUTAMA_POST_DAILY);
              }}
              className="border border-slate-300 px-2 py-1" />
          </label>
        ) : (<>
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
          {ESUTAMA_POST_INTERVALS.map((m) => <option key={m} value={m}>{m}分おき</option>)}
        </select>
        </>)}
        <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
      </div>
      </>)}
    </section>
  );
}

export default function ConecfEsutamaOptionsPage() {
  const { toast, showToast } = useToast();
  const [opts, setOpts] = useState<ConecfEsutamaOption[] | null>(null);
  const [posts, setPosts] = useState<ConecfEsutamaPost[]>([]);
  const [note, setNote] = useState<ConecfEsutamaNote | null>(null);
  // ★ 開いているカード（読み直しでカードが作り直されても閉じないよう、ここで持つ）。はじめは全部閉じる
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpenKeys((m) => ({ ...m, [k]: !m[k] }));
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await getConecfEsutamaOptions();
    if (!r.ok) { setError(r.error); return; }
    setOpts(r.data.options); setError('');
    const pr = await getConecfEsutamaPosts();
    if (pr.ok) setPosts(pr.data.posts);
    const nr = await getConecfEsutamaNote();
    if (nr.ok) setNote(nr.data);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <ConecfShell current="esutamaOpt" title="エステ魂オプション" toast={toast}>
      {() => (
      <div className="space-y-4">
        <p className="text-[14px] leading-relaxed text-slate-600">エステ魂で契約中の有料オプションを、決めた時間に自動で押します。1日は朝6時はじまりです（回数は毎朝6時に戻ります）。</p>
        {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
        {!error && !opts && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
        {opts && opts.length === 0 && posts.length === 0 && !note && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使えるオプションはまだありません。運営事務局までご連絡ください。</div>}
        {opts?.map((o) => <OptionCard key={o.key + String(o.lastAt) + String(o.readAt)} o={o} onToast={showToast} reload={load} open={openKeys[o.key] === true} onToggle={() => toggle(o.key)} />)}
        {posts.map((p) => <PostCard key={p.key + String(p.lastAt) + String(p.readAt)} p={p} onToast={showToast} reload={load} open={openKeys[p.key] === true} onToggle={() => toggle(p.key)} />)}
        {/* ★ 第1941便: 写メNote（ベンリーの【新】写メNote と同じ使い方） */}
        {note && <EsutamaNoteCard key={'note' + String(note.lastAt) + String(note.readAt) + note.items.length} n={note} onToast={showToast} reload={load} open={openKeys.note === true} onToggle={() => toggle('note')} />}
      </div>
      )}
    </ConecfShell>
  );
}
