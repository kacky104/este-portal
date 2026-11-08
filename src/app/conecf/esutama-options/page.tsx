'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import {
  getConecfEsutamaOptions, saveConecfEsutamaOption, runConecfEsutamaOptionNow, type ConecfEsutamaOption,
} from '@/app/actions/conecfEsutamaOptions';

// コネックエフ「エステ魂オプション」（第1799便・2026-11-09・カッキーさんの決定）。
// ★ 運営が /admin で ON にした店だけメニューに出る。★ 押すのはエステ魂で契約している有料オプションのボタン。
// ★ 時間は「朝6時はじまり」の1日（エステ魂の回数が朝6時に戻るため）。翌朝の時刻は「翌2:00」のように出す。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const HOURS = Array.from({ length: 25 }, (_, i) => 360 + i * 60); // 6:00 〜 翌6:00
const label = (m: number) => (m >= 1440 ? `翌${Math.floor((m - 1440) / 60)}:${String(m % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');

const DESC: Record<string, string> = {
  shop_boost: 'エステ魂の「ご案内状況」を「◎今すぐご案内可」で表示します（1回で1時間）。間隔ごとに押し直して、ずっと表示を続けます。1日24回まで（集客BOOSTER のご契約で無制限）。',
  cast_appeal: 'その日の出勤者のうち、最終アピールがいちばん古いセラピスト（一度もない方が先）を、その方の出勤時間内にアピールします。残り回数がある限り、1時間に1回まで見に行きます。',
  job_appeal: '求人情報・お仕事体験談を上位に表示します（準備中）。',
};
const OUTCOME: Record<string, string> = { ok: '押せました', no_remaining: '残り0回でした', no_cast: '出勤時間内のセラピストがいませんでした', not_ready: '準備中' };
const outcomeText = (o: string | null) => (!o ? '—' : o.startsWith('ok: ') ? `${o.slice(4)}さんを押せました` : OUTCOME[o] ?? (o.startsWith('error') ? 'うまくいきませんでした' : o));

function OptionCard({ o, onToast, reload }: { o: ConecfEsutamaOption; onToast: (m: string) => void; reload: () => void }) {
  const [auto, setAuto] = useState(o.auto);
  const [startMin, setStart] = useState(o.startMin);
  const [endMin, setEnd] = useState(o.endMin);
  const [intervalMin, setInterval] = useState(o.intervalMin);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await saveConecfEsutamaOption({ key: o.key, auto, startMin, endMin, intervalMin });
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
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-bold text-violet-700">{o.label}</h2>
        {!o.ready && <span className="border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] text-amber-800">準備中</span>}
        <button type="button" disabled={busy || !o.ready} onClick={now}
          className="ml-auto bg-violet-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">今すぐ押す</button>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600">{DESC[o.key]}</p>
      <div className="grid gap-1 text-[13px] text-slate-600 sm:grid-cols-3">
        <div>残り回数：<b className="text-slate-800">{o.remaining ?? '—'}</b>回（{when(o.readAt)} 時点）</div>
        <div>最後に押せた：<b className="text-slate-800">{when(o.lastAt)}</b></div>
        <div>最後の結果：{outcomeText(o.lastOutcome)}</div>
      </div>
      {o.ready && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で押す
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
          {o.key === 'shop_boost' && (
            <select value={intervalMin} onChange={(e) => setInterval(Number(e.target.value))} className="border border-slate-300 px-2 py-1">
              {[60, 90, 120].map((m) => <option key={m} value={m}>{m}分おき</option>)}
            </select>
          )}
          <button type="button" disabled={busy} onClick={save} className="border border-violet-600 px-4 py-1.5 font-bold text-violet-700 disabled:opacity-40">保存</button>
        </div>
      )}
    </section>
  );
}

export default function ConecfEsutamaOptionsPage() {
  const { toast, showToast } = useToast();
  const [opts, setOpts] = useState<ConecfEsutamaOption[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await getConecfEsutamaOptions();
    if (!r.ok) { setError(r.error); return; }
    setOpts(r.data.options); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <ConecfShell current="esutamaOpt" title="エステ魂オプション" toast={toast}>
      {() => (
      <div className="space-y-4">
        <p className="text-[14px] leading-relaxed text-slate-600">エステ魂でご契約の有料オプションのボタンを、コネックエフから押します。時間は朝6時はじまりの1日です（エステ魂の回数は毎朝6時に戻ります）。</p>
        {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
        {!error && !opts && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
        {opts && opts.length === 0 && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使えるオプションはまだありません。運営事務局までご連絡ください。</div>}
        {opts?.map((o) => <OptionCard key={o.key + String(o.lastAt) + String(o.readAt)} o={o} onToast={showToast} reload={load} />)}
      </div>
      )}
    </ConecfShell>
  );
}
