'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import {
  getConecfEkichikaRankImages, saveConecfEkichikaRankImage, runConecfEkichikaRankImageNow, type ConecfEkichikaRankImageSetting,
} from '@/app/actions/conecfEkichikaRankImages';
import { EKICHIKA_RANKIMG_INTERVALS, EKICHIKA_RANKIMG_PAIRS_MAX, nextRankImageAt } from '@/lib/ekichikaRankImage';

// コネックエフ「駅ちかランキング画像」（第1846便・2026-11-09・カッキーさん）。ベンリーの「駅ちか（店舗メイン／ランキング）」と同じことをする。
// ★ ◯分おきに、駅ちかの女の子一覧の上の「店舗メイン」「ランキング」の女の子を、決めた組の順に入れ替える

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');
const outcomeText = (o: string | null) => {
  if (!o) return '—';
  if (o.startsWith('ok: ')) return `入れ替えました（${o.slice(4)}）`;
  if (o.startsWith('ok_unverified: ')) return `入れ替えました（${o.slice(15)}・一覧での確認はまだ）`;
  if (o.startsWith('error')) return 'うまくいきませんでした（' + o.replace(/^error:\s*/, '') + '）';
  return o;
};
const SLOT_NOTE: Record<number, string> = { 1: 'ベンリーの無印', 2: 'ベンリーの「-B」', 3: 'ベンリーの「-C」' };

type Pair = { main: string; ranking: string };

function GirlSelect({ value, girls, onChange }: { value: string; girls: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-[9rem] border border-slate-300 bg-white px-2 py-1">
      <option value="">（変えない）</option>
      {[...new Set([value, ...girls].filter(Boolean))].map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
}

function SettingCard({ s, girls, onToast, reload, open, onToggle }: { s: ConecfEkichikaRankImageSetting; girls: string[]; onToast: (m: string) => void; reload: () => void; open: boolean; onToggle: () => void }) {
  const [auto, setAuto] = useState(s.auto);
  const [interval, setIntervalMin] = useState(s.intervalMin);
  const [pairs, setPairs] = useState<Pair[]>(() => s.pairs.map((p) => ({ ...p })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Partial<Pair>) => setPairs((ps) => ps.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const next = nextRankImageAt(s.lastDueAt, s.intervalMin);
  const save = async () => {
    if (pairs.some((p) => !p.main && !p.ranking)) { onToast('店舗メインもランキングも空の組があります'); return; }
    setBusy(true);
    const r = await saveConecfEkichikaRankImage({ slot: s.slot, auto, intervalMin: interval, pairs });
    setBusy(false);
    onToast(r.ok ? '保存しました' : r.error);
    if (r.ok) reload();
  };
  const now = async (i: number) => {
    if (!window.confirm('駅ちかの店舗メイン／ランキングを、この組の女の子にいま入れ替えますか？')) return;
    setBusy(true);
    const r = await runConecfEkichikaRankImageNow({ slot: s.slot, index: i });
    setBusy(false);
    onToast(r.ok ? '駅ちかへ送りました（1分ほどで結果が出ます）' : r.error);
    if (r.ok) setTimeout(reload, 60_000);
  };
  return (
    <section className={`${CARD} p-5 space-y-3`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className={`inline-block w-4 text-violet-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <h2 className="text-[17px] font-bold text-violet-700">駅ちか（枠{s.slot}）</h2>
        {SLOT_NOTE[s.slot] && <span className="text-[12px] text-slate-400">{SLOT_NOTE[s.slot]}</span>}
        <span className={`border px-2 py-0.5 text-[12px] font-bold ${s.auto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{s.auto ? '自動 ON' : '自動 OFF'}</span>
        {!open && <span className="truncate text-[12px] text-slate-500">{s.intervalMin}分おき・{s.pairs.length}組 ／ 最後：{when(s.lastAt)}・{outcomeText(s.lastOutcome)}</span>}
      </button>
      {open && (<>
        <p className="text-[13px] leading-relaxed text-slate-600">決めた間隔ごとに、下の組を上から順に、駅ちかの女の子一覧の上にある「店舗メイン」と「ランキング」へ置きます。最後の組のあとは最初に戻ります。名前は駅ちかの女の子一覧と同じ書き方にしてください（写真が入っていない方は駅ちかが受け付けません）。</p>
        <div className="text-[13px] text-slate-600">
          最後に入れ替えた：<b>{when(s.lastAt)}</b> ／ 最後の結果：{outcomeText(s.lastOutcome)}
          {s.auto && s.pairs.length > 0 && <> ／ 次：<b>{s.nextIndex + 1}組目</b>{next ? `（${when(next)} ごろ）` : '（次の見回りで）'}</>}
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} className="border border-slate-300 bg-white px-2 py-1">
            {EKICHIKA_RANKIMG_INTERVALS.map((m) => <option key={m} value={m}>{m}分</option>)}
          </select>
          間隔で入れ替える
        </label>
        {pairs.map((p, i) => (
          <div key={i} className={`flex flex-wrap items-center gap-3 border p-3 text-[14px] ${s.auto && i === s.nextIndex ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200'}`}>
            <span className="w-14 font-bold text-slate-700">{i + 1}組目</span>
            <label className="flex items-center gap-2">店舗メイン <GirlSelect value={p.main} girls={girls} onChange={(v) => set(i, { main: v })} /></label>
            <label className="flex items-center gap-2">ランキング <GirlSelect value={p.ranking} girls={girls} onChange={(v) => set(i, { ranking: v })} /></label>
            <button type="button" disabled={busy} onClick={() => void now(i)} className="border border-violet-400 px-3 py-1 text-[13px] font-bold text-violet-700 disabled:opacity-40">この組をいま1回</button>
            <button type="button" onClick={() => setPairs((ps) => ps.filter((_, k) => k !== i))} className="text-[12.5px] text-rose-600 underline">消す</button>
          </div>
        ))}
        {pairs.length < EKICHIKA_RANKIMG_PAIRS_MAX && (
          <button type="button" onClick={() => setPairs((ps) => [...ps, { main: '', ranking: '' }])} className="border border-dashed border-violet-400 px-3 py-1.5 text-[13px] text-violet-700">＋ 組を足す</button>
        )}
        <p className="text-[12px] text-slate-400">「この組をいま1回」は保存してある組で入れ替えます（次の自動はその次の組から・間隔はそこから数え直し）。変えたら先に「保存」を押してください。</p>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で入れ替える</label>
          <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
        </div>
      </>)}
    </section>
  );
}

export default function ConecfEkichikaRankImagesPage() {
  const { toast, showToast } = useToast();
  const [data, setData] = useState<{ settings: ConecfEkichikaRankImageSetting[]; girls: string[] } | null>(null);
  const [error, setError] = useState('');
  const [openSlots, setOpenSlots] = useState<Record<number, boolean>>({});
  const load = useCallback(async () => {
    const r = await getConecfEkichikaRankImages();
    if (!r.ok) { setError(r.error); return; }
    setData(r.data); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <ConecfShell current="ekiRankImg" title="駅ちかランキング画像（店舗メイン／ランキング）" toast={toast}>
      {() => (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-slate-600">駅ちか（駅ちか人気！風俗ランキング）の女の子一覧の上にある「店舗メイン」と「ランキング」の女の子を、決めた間隔で順番に入れ替えます。ランキングの女の子の写真が、駅ちかのランキングページのお店の写真になります。</p>
          {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
          {!error && !data && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
          {data && data.settings.length === 0 && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使えるようになっていません。運営事務局までご連絡ください。</div>}
          {data?.settings.map((s) => (
            <SettingCard key={s.slot + String(s.lastAt) + JSON.stringify(s.pairs) + String(s.auto) + s.intervalMin + s.nextIndex} s={s} girls={data.girls} onToast={showToast} reload={load}
              open={openSlots[s.slot] === true} onToggle={() => setOpenSlots((m) => ({ ...m, [s.slot]: !m[s.slot] }))} />
          ))}
        </div>
      )}
    </ConecfShell>
  );
}
