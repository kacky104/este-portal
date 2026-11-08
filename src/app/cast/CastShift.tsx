'use client';

// /cast「シフト提出」タブ（2026-11-04・店舗様のご要望・カッキーさんの決定）。
// ★ 上: 次の提出期間（来週の月〜日など・お店の設定で 1週間／2週間／1か月）。日ごとに希望の時間を書いて「提出する」。
//   ・締切なし。お店が確定するまでは何度でも書き直せる。確定した日は変えられない（お店に連絡）。
// ★ 下: 今の期間（見るだけ）。確定のあとにお店が週間スケジュールで変えた日は「お店が変更しました」と出る（期間が終わるまで残る）。
// ★ お店の確定は通知しない（このページに出るだけ・カッキーさん）。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CastCardTitle } from './CastCardTitle';
import { useCastView } from './CastView';
import { getCastShift, saveCastShift, type CastShiftData, type CastShiftDay } from '@/app/actions/shift';
import { endOptions, minLabel, shiftDateLabel, shiftDateTone, shiftDayState, startOptions, type ShiftDayState } from '@/lib/shift';

type Draft = { on: boolean; s: number; e: number; note: string };
const CARD = 'bg-white/90 backdrop-blur rounded-3xl border border-pink-100 shadow-sm p-4';

function md(ymd: string) { const [, m, d] = ymd.split('-').map(Number); return `${m}/${d}`; }

function StateLine({ st }: { st: ShiftDayState }) {
  switch (st.kind) {
    case 'none': return <span className="text-slate-400">—</span>;
    case 'requested': return (
      <span className="text-amber-700 font-bold">
        {st.req} 希望<span className="ml-1 text-[11px] font-normal text-amber-600">（未確定）</span>
        {st.cancelledConf && <span className="block text-[11px] font-bold text-rose-600">お店が確定を取り消しました（確定 {st.cancelledConf}）</span>}
      </span>
    );
    case 'confirmed': return (
      <span className="font-bold text-emerald-700">
        {st.conf} で確定しました
        {st.changedFromReq && <span className="block text-[11px] font-normal text-slate-500">希望 {st.changedFromReq} から変更</span>}
      </span>
    );
    case 'changed': return (
      <span className="font-bold text-orange-600">
        {st.now} にお店が変更しました
        <span className="block text-[11px] font-normal text-slate-500">確定 {st.conf}</span>
      </span>
    );
    case 'off': return (
      <span className="font-bold text-orange-600">
        お休みに変更されました
        <span className="block text-[11px] font-normal text-slate-500">確定 {st.conf}</span>
      </span>
    );
    case 'direct': return <span className="font-bold text-emerald-700">{st.now} 出勤</span>;
  }
}

function initDraft(d: CastShiftDay): Draft {
  if (d.req && d.req.status === 'requested') return { on: true, s: d.req.reqS, e: d.req.reqE, note: d.req.note };
  return { on: false, s: 21 * 60, e: 26 * 60, note: '' };
}

export function CastShift() {
  // ★ 第1777便: オーナー様が見るだけで開いているとき（希望は書き換えられない・提出ボタンを出さない）
  const { viewAs, readOnly } = useCastView();
  const [data, setData] = useState<CastShiftData | null>(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await getCastShift(viewAs).catch(() => null);
    if (!r) { setError('読み込めませんでした。しばらくしてから開き直してください。'); return; }
    if (!r.ok) { setError(r.error); return; }
    setError('');
    setData(r.data);
    setDrafts(Object.fromEntries(r.data.next.days.map((d) => [d.date, initDraft(d)])));
  }, [viewAs]);
  useEffect(() => { void load(); }, [load]);

  // 変えた日（元の希望と違う日）
  const dirty = useMemo(() => {
    if (!data) return [] as string[];
    return data.next.days.filter((d) => {
      if (d.req?.status === 'confirmed') return false;
      const a = drafts[d.date]; if (!a) return false;
      const b = initDraft(d);
      return a.on !== b.on || (a.on && (a.s !== b.s || a.e !== b.e || a.note.trim() !== b.note.trim()));
    }).map((d) => d.date);
  }, [data, drafts]);

  const setDraft = (date: string, patch: Partial<Draft>) => setDrafts((p) => {
    const cur = { ...p[date], ...patch };
    // 開始を変えて終了が選べない時間になったら、終了を開始の5時間後（選べる範囲で）にそろえる
    const opts = endOptions(cur.s);
    if (!opts.includes(cur.e)) cur.e = opts.includes(cur.s + 300) ? cur.s + 300 : opts[opts.length - 1];
    return { ...p, [date]: cur };
  });

  const onSave = async () => {
    if (!data || dirty.length === 0) return;
    setSaving(true); setMsg('');
    const entries = dirty.map((date) => {
      const d = drafts[date];
      return d.on ? { date, s: d.s, e: d.e, note: d.note } : { date, clear: true };
    });
    const r = await saveCastShift({ entries }).catch(() => null);
    setSaving(false);
    if (!r || !r.ok) { setMsg(r && !r.ok ? r.error : '提出できませんでした。もう一度お試しください。'); return; }
    setMsg('提出しました。お店が確定すると、ここに「確定しました」と出ます。');
    await load();
  };

  if (error) return <div className={CARD}><p className="text-[14px] text-slate-500 text-center py-4">{error}</p></div>;
  if (!data) return <div className={CARD}><p className="text-[14px] text-slate-400 text-center py-4">読み込み中...</p></div>;

  return (
    <div className="space-y-5">
      {/* ── 次の提出期間 ── */}
      <div className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <CastCardTitle icon="list">シフト提出（{md(data.next.from)}〜{md(data.next.to)}）</CastCardTitle>
        </div>
        {!readOnly && <p className="mt-2 text-[12px] text-slate-500 leading-relaxed">出勤したい日に「出勤する」を付けて時間を選び、下の「提出する」を押してください。お店が確定するまでは何度でも書き直せます。確定した後の変更は直接お店にお伝えください。</p>}
        <ul className="mt-3 divide-y divide-pink-50">
          {data.next.days.map((d) => {
            const st = shiftDayState(d.req, d.sched);
            const locked = readOnly || d.req?.status === 'confirmed';
            const dr = drafts[d.date];
            return (
              <li key={d.date} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className={`text-[15px] font-black tabular-nums ${shiftDateTone(d.date)}`}>{shiftDateLabel(d.date)}</span>
                  {locked ? (
                    <span className="text-right text-[13px] leading-snug"><StateLine st={st} /></span>
                  ) : (
                    <label className="inline-flex items-center gap-2 text-[13px] font-bold text-slate-600">
                      <input type="checkbox" className="w-5 h-5 accent-pink-500" checked={!!dr?.on} onChange={(e) => setDraft(d.date, { on: e.target.checked })} />
                      出勤する
                    </label>
                  )}
                </div>
                {!locked && dr?.on && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <select value={dr.s} onChange={(e) => setDraft(d.date, { s: Number(e.target.value) })}
                        className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[15px] tabular-nums">
                        {startOptions().map((m) => <option key={m} value={m}>{minLabel(m)}</option>)}
                      </select>
                      <span className="text-slate-400">〜</span>
                      <select value={dr.e} onChange={(e) => setDraft(d.date, { e: Number(e.target.value) })}
                        className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[15px] tabular-nums">
                        {endOptions(dr.s).map((m) => <option key={m} value={m}>{minLabel(m)}</option>)}
                      </select>
                    </div>
                    <input value={dr.note} maxLength={100} onChange={(e) => setDraft(d.date, { note: e.target.value })}
                      placeholder="ひとこと（例：終わりは延長できます）" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]" />
                  </div>
                )}
                {!locked && d.req?.status === 'requested' && (() => {
                  const st2 = shiftDayState(d.req, d.sched);
                  return st2.kind === 'requested' && st2.cancelledConf
                    ? <p className="mt-1 text-[12px] font-bold text-rose-600">お店が確定を取り消しました（確定 {st2.cancelledConf}）。もう一度確定されるまでは希望のままです</p>
                    : <p className="mt-1 text-[11px] text-amber-600">提出済み・お店の確定待ち</p>;
                })()}
              </li>
            );
          })}
        </ul>
        {msg && <p className="mt-2 text-[13px] font-bold text-pink-600">{msg}</p>}
        {!readOnly && (
        <button type="button" onClick={() => void onSave()} disabled={saving || dirty.length === 0}
          className="mt-3 w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 text-white text-[15px] font-black disabled:opacity-40">
          {saving ? '提出しています…' : dirty.length > 0 ? `提出する（${dirty.length}日）` : '提出する'}
        </button>
        )}
      </div>

      {/* ── 今の期間（見るだけ）── */}
      <div className={CARD}>
        <CastCardTitle icon="list">今のシフト（{md(data.current.from)}〜{md(data.current.to)}）</CastCardTitle>
        <ul className="mt-3 divide-y divide-pink-50">
          {data.current.days.map((d) => (
            <li key={d.date} className="py-2.5 flex items-start justify-between gap-3">
              <span className={`text-[14px] font-black tabular-nums ${shiftDateTone(d.date)}`}>{shiftDateLabel(d.date)}</span>
              <span className="text-right text-[13px] leading-snug"><StateLine st={shiftDayState(d.req, d.sched)} /></span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-400">急な変更はお店と直接やり取りしてください。</p>
      </div>
    </div>
  );
}
