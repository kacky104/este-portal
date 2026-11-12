'use client';

import { conecfConfirm } from '@/app/conecf/ConecfConfirm';
import { useCallback, useState } from 'react';
import { when, useLoadOnMount } from '../conecfClientUtil';
import { parseConecfClock } from '@/lib/conecfClock';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import {
  getConecfEkichikaMagazines, saveConecfEkichikaMagazine, runConecfEkichikaMagazineNow, type ConecfEkichikaMagazineSetting,
} from '@/app/actions/conecfEkichikaMagazines';
import { EKICHIKA_MAGAZINE_TITLE_MAX, EKICHIKA_MAGAZINE_BODY_MAX, EKICHIKA_MAGAZINE_ROWS_MAX, magazineMinLabel } from '@/lib/ekichikaMagazine';

// コネックエフ「駅ちかプラチナムマガジン」（第1844便・2026-11-09・カッキーさん）。ベンリーの「駅ちか（プラチナムマガジン）」と同じことをする。
// ★ 決めた時刻に、同じタイトル・本文（HTML）のマガジンを投稿する。受け取るのは駅ちかの会員（マイショップ登録者）

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const outcomeText = (o: string | null) => {
  if (!o) return '—';
  if (o.startsWith('ok: ')) return `投稿できました（${o.slice(4)} 配信）`;
  if (o.startsWith('ok_unverified: ')) return `投稿しました（${o.slice(15)} 配信・一覧での確認はまだ）`;
  if (o.startsWith('error')) return 'うまくいきませんでした（' + o.replace(/^error:\s*/, '') + '）';
  return o;
};

type Row = { time: string; title: string; body: string };

function SettingCard({ s, onToast, reload, open, onToggle }: { s: ConecfEkichikaMagazineSetting; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(s.auto);
  const [rows, setRows] = useState<Row[]>(() => s.schedule.map((r) => ({ time: magazineMinLabel(r.min), title: r.title, body: r.body })));
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const save = async () => {
    const mins = rows.map((r) => parseConecfClock(r.time));
    if (mins.some((m) => !Number.isFinite(m))) { onToast('時刻は「12:15」のように入れてください（翌朝は「翌1:00」）'); return; }
    if (new Set(mins).size !== mins.length) { onToast('同じ時刻が2つあります'); return; }
    setBusy(true);
    const r = await saveConecfEkichikaMagazine({ slot: s.slot, auto, schedule: rows.map((x, i) => ({ min: mins[i], title: x.title, body: x.body })) });
    setBusy(false);
    onToast(r.ok ? '保存しました' : r.error);
    if (r.ok) reload();
  };
  const now = async (i: number) => {
    if (!(await conecfConfirm('駅ちかの会員さんにマガジンが1通届きます。いま送りますか？', { ok: '送る' }))) return;
    setBusy(true);
    const r = await runConecfEkichikaMagazineNow({ slot: s.slot, index: i });
    setBusy(false);
    onToast(r.ok ? '駅ちかへ送りました（1分ほどで結果が出ます）' : r.error);
    if (r.ok) setTimeout(reload, 60_000);
  };
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className={`inline-block w-4 text-violet-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <h2 className={`text-[17px] font-bold ${s.auto ? 'conecf-glint' : 'text-violet-700'}`}>駅ちか（枠{s.slot}）</h2>
        <span className={`border px-2 py-0.5 text-[12px] font-bold ${s.auto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{s.auto ? '自動 ON' : '自動 OFF'}</span>
        {!open && <span className="truncate text-[12px] text-slate-500">{s.schedule.map((r) => magazineMinLabel(r.min)).join('・') || '—'} ／ 最後：{when(s.lastAt)}・{outcomeText(s.lastOutcome)}</span>}
      </button>
      {open && (<>
        <p className="text-[13px] leading-relaxed text-slate-600">決めた時刻に、その行のタイトル・本文を投稿します。駅ちかの配信は10分刻みのため、<b>配信したい時刻の5分前</b>を入れてください（12:20 に配信 → 「12:15」）。</p>
        <p className="text-[12.5px] leading-relaxed text-slate-500">本文は HTML です。駅ちかの管理画面でいまのマガジンを開き、本文の「HTMLタグを表示」で出てくる中身をそのまま貼り付けてください。</p>
        <div className="text-[13px] text-slate-600">最後に送れた：<b>{when(s.lastAt)}</b> ／ 最後の結果：{outcomeText(s.lastOutcome)}</div>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 border border-slate-200 p-3 text-[14px]">
            <div className="flex flex-wrap items-center gap-2">
              <input value={r.time} onChange={(e) => set(i, { time: e.target.value })} placeholder="12:15" className="w-20 border border-slate-300 px-2 py-1" />
              <input value={r.title} maxLength={EKICHIKA_MAGAZINE_TITLE_MAX} onChange={(e) => set(i, { title: e.target.value })} placeholder="タイトル" className="min-w-[14rem] flex-1 border border-slate-300 px-2 py-1" />
              <button type="button" disabled={busy} onClick={() => void now(i)} className="border border-violet-400 px-3 py-1 text-[13px] font-bold text-violet-700 disabled:opacity-40">この行をいま1回</button>
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="text-[12.5px] text-rose-600 underline">消す</button>
            </div>
            <textarea value={r.body} maxLength={EKICHIKA_MAGAZINE_BODY_MAX} onChange={(e) => set(i, { body: e.target.value })} placeholder="本文（HTML）" rows={6} className="border border-slate-300 px-2 py-1 font-mono text-[12.5px]" />
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
              <span>{r.body.length.toLocaleString()} / {EKICHIKA_MAGAZINE_BODY_MAX.toLocaleString()} 文字</span>
              <button type="button" className="text-indigo-600 underline" onClick={() => setPreview(preview === i ? null : i)}>{preview === i ? '見え方を閉じる' : '見え方を確かめる'}</button>
              {i > 0 && <button type="button" className="text-indigo-600 underline" onClick={() => set(i, { title: rows[0].title, body: rows[0].body })}>1行目と同じにする</button>}
            </div>
            {preview === i && <iframe title="マガジンの見え方" sandbox="" srcDoc={r.body} className="h-96 w-full border border-slate-200 bg-white" />}
          </div>
        ))}
        {rows.length < EKICHIKA_MAGAZINE_ROWS_MAX && (
          <button type="button" onClick={() => setRows((rs) => [...rs, { time: '', title: rs[0]?.title ?? '', body: rs[0]?.body ?? '' }])} className="border border-dashed border-violet-400 px-3 py-1.5 text-[13px] text-violet-700">＋ 時刻を足す</button>
        )}
        <p className="text-[12px] text-slate-400">「この行をいま1回」は保存してある内容で送ります（会員さんに1通届きます）。変えたら先に「保存」を押してください。</p>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で投稿する</label>
          <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
        </div>
      </>)}
    </section>
  );
}

export default function ConecfEkichikaMagazinesPage() {
  const { toast, showToast } = useToast();
  const [data, setData] = useState<{ settings: ConecfEkichikaMagazineSetting[] } | null>(null);
  const [error, setError] = useState('');
  const [openSlots, setOpenSlots] = useState<Record<number, boolean>>({});
  const load = useCallback(async () => {
    const r = await getConecfEkichikaMagazines();
    if (!r.ok) { setError(r.error); return; }
    setData(r.data); setError('');
  }, []);
  useLoadOnMount(load);
  return (
    <ConecfShell current="ekiMagazine" title="駅ちかプラチナムマガジン" toast={toast}>
      {() => (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-slate-600">駅ちかの「プラチナムマガジン」を決めた時刻に配信します。届くのはマイショップ登録の会員です。</p>
          {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
          {!error && !data && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
          {data && data.settings.length === 0 && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使えるようになっていません。運営事務局までご連絡ください。</div>}
          {data?.settings.map((s) => (
            <SettingCard key={s.slot + String(s.lastAt) + JSON.stringify(s.schedule) + String(s.auto)} s={s} onToast={showToast} reload={load}
              open={openSlots[s.slot] === true} onToggle={() => setOpenSlots((m) => ({ ...m, [s.slot]: !m[s.slot] }))} />
          ))}
        </div>
      )}
    </ConecfShell>
  );
}
