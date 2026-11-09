'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { createClient } from '@/app/lib/supabase/client';
import {
  getConecfEkichikaMovies, createConecfVideoUpload, registerConecfVideo, renameConecfVideo, deleteConecfVideo,
  saveConecfEkichikaMovie, runConecfEkichikaMovieNow, type ConecfVideo, type ConecfEkichikaMovieSetting,
} from '@/app/actions/conecfEkichikaMovies';
import { CONECF_VIDEO_BUCKET, EKICHIKA_MOVIE_DAILY_MAX, EKICHIKA_MOVIE_TITLE_MAX, EKICHIKA_MOVIE_BODY_MAX, EKICHIKA_VIDEO_MAX_BYTES, movieMinLabel } from '@/lib/ekichikaMovie';

// コネックエフ「駅ちか動画投稿」（第1840便・2026-11-09・カッキーさん）。ベンリーの「駅ちか人気！風俗ランキング（動画投稿）」と同じことをする。
// ★ 動画はブラウザから Supabase へ直接上げる（署名付きアップロード URL）。★ 時間は朝6時はじまりの1日・駅ちかは1日5件まで

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const supabase = createClient();
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');
const mb = (b: number | null) => (b == null ? '' : (b / 1024 / 1024).toFixed(1) + 'MB');
const outcomeText = (o: string | null) => {
  if (!o) return '—';
  if (o.startsWith('ok: ')) return `${o.slice(4)}さんの動画を投稿できました`;
  if (o.startsWith('ok_unverified: ')) return `${o.slice(15)}さんの動画を投稿しました（一覧での確認はまだ）`;
  if (o === 'no_girl') return '駅ちかにその女の子がいませんでした';
  if (o.startsWith('error')) return 'うまくいきませんでした（' + o.replace(/^error:\s*/, '') + '）';
  return o;
};
function parseTime(t: string): number {
  const m = /^(翌)?\s*(\d{1,2})\s*[:時]\s*(\d{2})\s*分?$/.exec(t.normalize('NFKC').trim());
  if (!m) return NaN;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] || v < 360 ? v + 1440 : v;
}

function VideoLibrary({ videos, onToast, reload }: { videos: ConecfVideo[]; onToast: (m: string) => void; reload: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const type = file.type === 'video/quicktime' ? 'video/quicktime' : file.type === 'video/mp4' ? 'video/mp4' : '';
    if (!type) { onToast('動画は MP4 か MOV にしてください'); return; }
    if (file.size > EKICHIKA_VIDEO_MAX_BYTES) { onToast('動画が大きすぎます（駅ちかの上限は256MBです）'); return; }
    setBusy(true);
    try {
      const a = await createConecfVideoUpload({ size: file.size, type });
      if (!a.ok) { onToast(a.error); return; }
      const { error } = await supabase.storage.from(CONECF_VIDEO_BUCKET).uploadToSignedUrl(a.data.path, a.data.token, file, { contentType: type });
      if (error) { onToast('アップロードに失敗しました: ' + error.message); return; }
      const r = await registerConecfVideo({ path: a.data.path, name: name || file.name.replace(/\.[^.]+$/, ''), type });
      if (!r.ok) { onToast(r.error); return; }
      setName(''); onToast('動画を登録しました'); reload();
    } finally { setBusy(false); }
  };
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <h2 className="text-[17px] font-bold text-violet-700">動画の置き場</h2>
      <p className="text-[13px] text-slate-600">投稿に使う動画を登録します（MP4・MOV、1本256MBまで）。登録した動画は下の「投稿する時刻」で選べます。</p>
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前（例: りな動画）" className="w-48 border border-slate-300 px-2 py-1" />
        <label className={`cursor-pointer px-4 py-1.5 font-bold text-white ${busy ? 'bg-slate-400' : 'bg-violet-600'}`}>
          {busy ? 'アップロード中…（そのままお待ちください）' : '動画を選んで登録'}
          <input type="file" accept="video/mp4,video/quicktime" className="hidden" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      <ul className="divide-y divide-slate-100 border border-slate-200">
        {videos.length === 0 && <li className="px-3 py-2 text-[13px] text-slate-400">まだ動画がありません</li>}
        {videos.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[14px]">
            <span className="font-bold">{v.name}</span>
            <span className="text-[12px] text-slate-400">{mb(v.bytes)}・{when(v.createdAt)}</span>
            <button type="button" className="ml-auto text-[12.5px] text-indigo-600 underline" onClick={async () => { const n = window.prompt('新しい名前', v.name); if (!n) return; const r = await renameConecfVideo({ id: v.id, name: n }); onToast(r.ok ? '名前を変えました' : r.error); if (r.ok) reload(); }}>名前を変える</button>
            <button type="button" className="text-[12.5px] text-rose-600 underline" onClick={async () => { const r = await deleteConecfVideo({ id: v.id }); onToast(r.ok ? '消しました' : r.error); if (r.ok) reload(); }}>消す</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Row = { time: string; girlName: string; videoId: string; title: string; body: string; deleteSame: boolean };

function SettingCard({ s, videos, girls, onToast, reload, open, onToggle }: { s: ConecfEkichikaMovieSetting; videos: ConecfVideo[]; girls: string[]; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(s.auto);
  const [rows, setRows] = useState<Row[]>(() => s.schedule.map((r) => ({ time: movieMinLabel(r.min), girlName: r.girlName, videoId: String(r.videoId), title: r.title, body: r.body, deleteSame: r.deleteSame })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const save = async () => {
    const mins = rows.map((r) => parseTime(r.time));
    if (mins.some((m) => !Number.isFinite(m))) { onToast('時刻は「12:00」のように入れてください（翌朝は「翌1:00」）'); return; }
    if (new Set(mins).size !== mins.length) { onToast('同じ時刻が2つあります'); return; }
    setBusy(true);
    const r = await saveConecfEkichikaMovie({ slot: s.slot, auto, schedule: rows.map((x, i) => ({ min: mins[i], girlName: x.girlName, videoId: Number(x.videoId), title: x.title, body: x.body, deleteSame: x.deleteSame })) });
    setBusy(false);
    onToast(r.ok ? '保存しました' : r.error);
    if (r.ok) reload();
  };
  const now = async (i: number) => {
    setBusy(true);
    const r = await runConecfEkichikaMovieNow({ slot: s.slot, index: i });
    setBusy(false);
    onToast(r.ok ? '駅ちかへ送りました（動画の大きさによって数分かかります）' : r.error);
    if (r.ok) setTimeout(reload, 120_000);
  };
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className={`inline-block w-4 text-violet-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <h2 className="text-[17px] font-bold text-violet-700">駅ちか（枠{s.slot}）</h2>
        <span className={`border px-2 py-0.5 text-[12px] font-bold ${s.auto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{s.auto ? '自動 ON' : '自動 OFF'}</span>
        {!open && <span className="truncate text-[12px] text-slate-500">{s.schedule.map((r) => movieMinLabel(r.min)).join('・') || '—'} ／ 最後：{when(s.lastAt)}・{outcomeText(s.lastOutcome)}</span>}
      </button>
      {open && (<>
        <p className="text-[13px] leading-relaxed text-slate-600">決めた時刻に、その行の女の子の動画を駅ちかへ投稿します。駅ちかは1日{EKICHIKA_MOVIE_DAILY_MAX}件まで・同じ女の子で同じタイトルを5分以内に出すと反映されません。「前の同じ記事を消す」にすると、同じ女の子・同じタイトルの前の記事を消してから出します（ベンリーと同じ）。</p>
        <div className="text-[13px] text-slate-600">最後に送れた：<b>{when(s.lastAt)}</b> ／ 最後の結果：{outcomeText(s.lastOutcome)}</div>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 border border-slate-200 p-3 text-[14px]">
            <div className="flex flex-wrap items-center gap-2">
              <input value={r.time} onChange={(e) => set(i, { time: e.target.value })} placeholder="12:00" className="w-20 border border-slate-300 px-2 py-1" />
              <select value={r.girlName} onChange={(e) => set(i, { girlName: e.target.value })} className="border border-slate-300 px-2 py-1">
                <option value="">女の子を選ぶ…</option>
                {[...new Set([r.girlName, ...girls].filter(Boolean))].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={r.videoId} onChange={(e) => set(i, { videoId: e.target.value })} className="border border-slate-300 px-2 py-1">
                <option value="">動画を選ぶ…</option>
                {videos.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <label className="flex items-center gap-1 text-[13px]"><input type="checkbox" checked={r.deleteSame} onChange={(e) => set(i, { deleteSame: e.target.checked })} /> 前の同じ記事を消す</label>
              <button type="button" disabled={busy} onClick={() => void now(i)} className="ml-auto border border-violet-400 px-3 py-1 text-[13px] font-bold text-violet-700 disabled:opacity-40">この行をいま1回</button>
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="text-[12.5px] text-rose-600 underline">消す</button>
            </div>
            <input value={r.title} maxLength={EKICHIKA_MOVIE_TITLE_MAX} onChange={(e) => set(i, { title: e.target.value })} placeholder="タイトル" className="border border-slate-300 px-2 py-1" />
            <textarea value={r.body} maxLength={EKICHIKA_MOVIE_BODY_MAX} onChange={(e) => set(i, { body: e.target.value })} placeholder="本文" rows={3} className="border border-slate-300 px-2 py-1" />
          </div>
        ))}
        {rows.length < EKICHIKA_MOVIE_DAILY_MAX && (
          <button type="button" onClick={() => setRows((rs) => [...rs, { time: '', girlName: '', videoId: '', title: '', body: '', deleteSame: true }])} className="border border-dashed border-violet-400 px-3 py-1.5 text-[13px] text-violet-700">＋ 時刻を足す（1日{EKICHIKA_MOVIE_DAILY_MAX}件まで）</button>
        )}
        <p className="text-[12px] text-slate-400">「この行をいま1回」は保存してある内容で送ります。変えたら先に「保存」を押してください。</p>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で投稿する</label>
          <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
        </div>
      </>)}
    </section>
  );
}

export default function ConecfEkichikaMoviesPage() {
  const { toast, showToast } = useToast();
  const [data, setData] = useState<{ settings: ConecfEkichikaMovieSetting[]; videos: ConecfVideo[]; girls: string[] } | null>(null);
  const [error, setError] = useState('');
  const [openSlots, setOpenSlots] = useState<Record<number, boolean>>({});
  const load = useCallback(async () => {
    const r = await getConecfEkichikaMovies();
    if (!r.ok) { setError(r.error); return; }
    setData(r.data); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <ConecfShell current="ekiMovie" title="駅ちか動画投稿" toast={toast}>
      {() => (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-slate-600">駅ちか（駅ちか人気！風俗ランキング）の「動画投稿」に、女の子の動画を決めた時刻に投稿します。時刻は朝6時はじまりの1日です。</p>
          {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
          {!error && !data && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
          {data && data.settings.length === 0 && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使えるようになっていません。運営事務局までご連絡ください。</div>}
          {data && data.settings.length > 0 && <VideoLibrary videos={data.videos} onToast={showToast} reload={load} />}
          {data?.settings.map((s) => (
            <SettingCard key={s.slot + String(s.lastAt) + JSON.stringify(s.schedule) + String(s.auto) + data.videos.length} s={s} videos={data.videos} girls={data.girls} onToast={showToast} reload={load}
              open={openSlots[s.slot] === true} onToggle={() => setOpenSlots((m) => ({ ...m, [s.slot]: !m[s.slot] }))} />
          ))}
        </div>
      )}
    </ConecfShell>
  );
}
