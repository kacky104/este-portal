'use client';

// ★ 第1930便（2026-11-11）: 「タイマー更新／時刻指定更新」の設定画面の中身を部品にした（駅ちかの枠・エステ魂の集客アピールの行で使う）
//   ★ もとは /bump/ekichika/[slot]/page.tsx の Editor。保存・いま1回は呼び出し側が渡す
import Link from 'next/link';
import { useState } from 'react';
import { useConecfHref } from '../ConecfBase';
import type { ConecfBumpSlot } from '@/app/actions/conecfBump';
import { bumpSlotsPerDay, BUMP_CUSTOM_INTERVAL_MIN, BUMP_CUSTOM_INTERVAL_MAX, isCustomBumpInterval, parseBumpTimesText, BUMP_TIMES_MAX } from '@/lib/ekichikaBump';
import { minuteLabel, minuteFromLabel } from '@/lib/bumpAuto';

function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d);
}

type Tab = 'timer' | 'times';
type BulkMode = 'step' | 'range' | 'paste';
const BULK_STEPS = [5, 10, 15, 20, 30, 40, 45, 60, 90, 120, 150, 180, 240] as const;

/** 全角数字も読める回数 */
function countFrom(text: string): number | null {
  const n = Number(text.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
  return Number.isInteger(n) && n >= 1 && n <= BUMP_TIMES_MAX ? n : null;
}

/** ① 始まりから「間隔」ごとに「回数」個（0時をまたいだら翌日の時刻として回す） */
export function bulkByStep(startMin: number, stepMin: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (startMin + i * stepMin) % 1440);
}

/** ② 始まり〜終わりの間に「回数」個を均等に（両端を含む・終わりが始まり以前なら日をまたぐ） */
export function bulkByRange(startMin: number, endMin: number, count: number): number[] {
  const span = endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
  if (count === 1) return [startMin];
  return Array.from({ length: count }, (_, i) => (startMin + Math.round((i * span) / (count - 1))) % 1440);
}

export type ScheduleSaveInput = { enabled: boolean; startMin: number; endMin: number; intervalMin: number; times?: number[] };
type SaveResult = { ok: true; data: { perDay: number } } | { ok: false; error: string };
type RunResult = { ok: true; data?: unknown } | { ok: false; error: string };

export function ScheduleEditor({ s, enabled, onToast, onSaved, name, siteName, heading, defaultQuota, choices, save: saveFn, run: runFn, what = '上位表示' }: {
  s: ConecfBumpSlot; enabled: boolean; onToast: (m: string) => void; onSaved: () => Promise<void>;
  /** 「枠1」「店舗情報」など */ name: string;
  /** 「駅ちか」「エステ魂」 */ siteName: string;
  heading?: React.ReactNode;
  defaultQuota: number;
  choices: readonly number[];
  save: (input: ScheduleSaveInput) => Promise<SaveResult>;
  run: () => Promise<RunResult>;
  /** 押すことの呼び名（「上位表示」「アピール」） */ what?: string;
}) {
  const href = useConecfHref();
  const [tab, setTab] = useState<Tab>(s.times ? 'times' : 'timer');
  const [start, setStart] = useState(minuteLabel(s.startMin));
  const [end, setEnd] = useState(minuteLabel(s.endMin));
  const [interval, setIntervalMin] = useState(s.intervalMin);
  // ★ 第1925便: 好きな分数を入れる（ベンリーの「入力…」）。選択肢にない分数で保存されていれば、はじめから入力の形
  const [customOn, setCustomOn] = useState(!(choices as readonly number[]).includes(s.intervalMin));
  const [customText, setCustomText] = useState(String(s.intervalMin));
  const [rows, setRows] = useState<string[]>((s.times ?? []).map((t) => minuteLabel(t)));
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  // ★ 第1934便: 一括登録をベンリーと同じ形に（①間隔と回数から ②範囲と回数から間隔を ③まとめて貼り付け）
  const [bulkMode, setBulkMode] = useState<BulkMode>('step');
  const [bStart, setBStart] = useState('');
  const [bEnd, setBEnd] = useState('');
  const [bStep, setBStep] = useState(15);
  const [bCount, setBCount] = useState('');
  const [busy, setBusy] = useState('');

  const usable = s.hasCredential && !s.linkOff;
  const quota = s.quota ?? defaultQuota;
  const remaining = s.countStale ? quota : s.remaining;
  const startMin = minuteFromLabel(start);
  const endMin = minuteFromLabel(end);
  const customVal = Number(customText.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
  const intervalNow = customOn ? customVal : interval;
  const intervalOk = isCustomBumpInterval(intervalNow);
  const filled = rows.map((r) => r.trim()).filter(Boolean);
  const badRows = filled.filter((r) => minuteFromLabel(r) === null);
  const timesMin = [...new Set(filled.map((r) => minuteFromLabel(r)).filter((m): m is number => m !== null))].sort((a, b) => a - b);
  const perDay = tab === 'times' ? timesMin.length
    : startMin !== null && endMin !== null && intervalOk ? bumpSlotsPerDay({ startMin, endMin, intervalMin: intervalNow }) : 0;

  const guard = () => {
    if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return false; }
    if (!usable) { onToast('この枠のID・パスワードが登録されていないか、止めています。「ID・パスワード登録」をご確認ください'); return false; }
    return true;
  };

  /** いまのタブの方式で保存する。nextOn … 自動のオン・オフ */
  const save = async (nextOn: boolean, label: string) => {
    if (!guard()) return;
    if (startMin === null || endMin === null) { onToast('タイマー更新の時間帯を「10:00」のような形で入れてください'); return; }
    if (tab === 'timer' && !intervalOk) { onToast(`間隔は${BUMP_CUSTOM_INTERVAL_MIN}〜${BUMP_CUSTOM_INTERVAL_MAX}分の数字で入れてください`); return; }
    let times: number[] | undefined;
    if (tab === 'times') {
      if (badRows.length > 0) { onToast(`読めない時刻があります: ${badRows.slice(0, 5).join('・')}`); return; }
      if (timesMin.length === 0) { onToast('時刻指定更新の時刻を1つ以上入れてください'); return; }
      if (timesMin.length > BUMP_TIMES_MAX) { onToast(`時刻は${BUMP_TIMES_MAX}個までです（いま ${timesMin.length}個）`); return; }
      times = timesMin;
    } else if (s.times) {
      if (!window.confirm(`タイマー更新に切り替えると、時刻指定更新の${s.times.length}個の時刻は消えます。よろしいですか？`)) return;
      times = [];
    }
    setBusy(label);
    const res = await saveFn({ enabled: nextOn, startMin, endMin, intervalMin: intervalOk ? intervalNow : s.intervalMin, times });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(nextOn
      ? `${name}を${tab === 'times' ? '時刻指定更新' : 'タイマー更新'}で自動更新します（1日最大${Math.min(res.data.perDay, quota)}回）`
      : label === 'stop' ? `${name}の自動更新を止めました` : `${name}の設定を保存しました（自動更新は止まっています）`);
    await onSaved();
  };

  const runNow = async () => {
    if (!guard()) return;
    if (!window.confirm(`${siteName}（${name}）の${what}をいま1回押しますか？${remaining != null ? `（本日残り ${remaining}回）` : ''}`)) return;
    setBusy('run');
    const res = await runFn();
    setBusy('');
    onToast(res.ok ? `${what}を受け付けました。1〜2分で${siteName}に反映されます` : res.error);
  };

  /** 作った時刻を今の時刻に足す（同じ時刻は1つ・時刻順） */
  const mergeTimes = (add: number[], bad: string[] = []) => {
    const merged = [...new Set([...timesMin, ...add])].sort((a, b) => a - b);
    if (merged.length > BUMP_TIMES_MAX) { onToast(`合わせて${merged.length}個になります。${BUMP_TIMES_MAX}個までです（今 ${timesMin.length}個・あと${BUMP_TIMES_MAX - timesMin.length}個まで）`); return false; }
    const added = merged.length - timesMin.length;
    setRows(merged.map((m) => minuteLabel(m)));
    onToast(`${added}個を足しました${add.length > added ? `（同じ時刻の${add.length - added}個はまとめました）` : ''}${bad.length ? `（読めなかったもの: ${bad.slice(0, 5).join('・')}）` : ''}。「設定を保存」で決まります`);
    return true;
  };

  const bStartMin = minuteFromLabel(bStart);
  const bEndMin = minuteFromLabel(bEnd);
  const bN = countFrom(bCount);
  const bulkReady = bulkMode === 'paste' ? bulk.trim() !== ''
    : bulkMode === 'step' ? bStartMin !== null && bN !== null
    : bStartMin !== null && bEndMin !== null && bStartMin !== bEndMin && bN !== null;
  const rangeGap = bulkMode === 'range' && bStartMin !== null && bEndMin !== null && bStartMin !== bEndMin && bN !== null && bN > 1
    ? Math.round(((bEndMin > bStartMin ? bEndMin - bStartMin : bEndMin + 1440 - bStartMin) / (bN - 1)) * 10) / 10 : null;

  const addBulk = () => {
    let ok = false;
    if (bulkMode === 'paste') {
      const p = parseBumpTimesText(bulk);
      if (p.times.length === 0) { onToast('読める時刻がありませんでした（「9:32 10:08」のように入れてください）'); return; }
      ok = mergeTimes(p.times, p.bad);
      if (ok) setBulk('');
    } else if (bulkMode === 'step') {
      if (bStartMin === null || bN === null) { onToast(`範囲のはじめの時刻と、回数（1〜${BUMP_TIMES_MAX}）を入れてください`); return; }
      ok = mergeTimes(bulkByStep(bStartMin, bStep, bN));
    } else {
      if (bStartMin === null || bEndMin === null || bStartMin === bEndMin || bN === null) { onToast(`範囲の時刻（はじめと終わりは別の時刻）と、回数（1〜${BUMP_TIMES_MAX}）を入れてください`); return; }
      ok = mergeTimes(bulkByRange(bStartMin, bEndMin, bN));
    }
    if (ok) setBulkOpen(false);
  };

  const tabBtn = (k: Tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      className={`px-6 py-3 text-[17px] font-bold border-t-2 ${tab === k ? 'bg-white border-orange-500 text-slate-800' : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700'}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-3 pb-40">
      <Link href={href('/bump')} className="inline-flex items-center gap-1 text-[17px] font-bold text-slate-500 hover:text-slate-700">← 上位表示設定の一覧へ</Link>
      {heading && <p className="text-[18px] font-black text-slate-700">{heading}</p>}

      {/* ── 上：自動のオン・オフ・残り・今すぐ ── */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-orange-100 px-4 py-2.5">
        {s.enabled ? (
          <button type="button" disabled={busy !== ''} onClick={() => void save(false, 'stop')}
            className="px-5 py-2.5 text-[17px] font-black text-slate-600 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40">
            {busy === 'stop' ? '止めています…' : '■ 自動更新を止める'}
          </button>
        ) : (
          <button type="button" disabled={busy !== ''} onClick={() => void save(true, 'start')}
            className="px-5 py-2.5 text-[17px] font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40">
            {busy === 'start' ? '始めています…' : `▶ ${tab === 'times' ? '時刻指定' : 'タイマー'}で自動更新を始める`}
          </button>
        )}
        {s.enabled ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[16px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />自動更新中（{s.times ? `時刻指定・${s.times.length}回` : `タイマー・${minuteLabel(s.startMin)}〜${minuteLabel(s.endMin)}・${s.intervalMin}分ごと`}）
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[16px] font-bold text-slate-500 bg-slate-50 border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />自動更新停止
          </span>
        )}
        <span className="text-[18px] text-slate-600 tabular-nums">残 <b className="text-[30px] font-black text-orange-500">{remaining ?? '—'}</b> 回</span>
        <span className="text-[15px] text-slate-400">{s.lastAt ? `最後 ${hm(s.lastAt)}` : ''}</span>
        <button type="button" disabled={busy !== '' || remaining === 0} onClick={() => void runNow()}
          className="ml-auto px-4 py-2 text-[17px] font-black text-white bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600 disabled:opacity-40">
          {busy === 'run' ? '受け付けています…' : `⬆ いま1回${what}する`}
        </button>
      </div>
      {!usable && (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-[17px] text-amber-900">
          この枠のID・パスワードが登録されていないか、止めています。<Link href={href('/sites')} className="font-bold underline">ID・パスワード登録</Link>をご確認ください。
        </p>
      )}

      {/* ── タブ ── */}
      <div>
        <div className="flex gap-0.5">
          {tabBtn('timer', 'タイマー更新')}
          {s.timesReady && tabBtn('times', '時刻指定更新')}
        </div>
        <div className="bg-white border border-slate-200 px-5 py-3 space-y-3">
          {tab === 'timer' ? (
            <>
              <div className="flex items-center gap-1.5 flex-wrap text-[18px] text-slate-600">
                <input type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} className="px-2 py-1.5 border border-slate-300 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200" />
                <span className="font-bold">〜</span>
                <input type="time" step={60} value={end} onChange={(e) => setEnd(e.target.value)} className="px-2 py-1.5 border border-slate-300 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200" />
                <span className="font-bold">の間</span>
                <select value={customOn ? 'custom' : interval} onChange={(e) => { if (e.target.value === 'custom') { setCustomOn(true); setCustomText(String(interval)); } else { setCustomOn(false); setIntervalMin(Number(e.target.value)); } }}
                  className="px-2 py-1.5 border border-slate-300 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200">
                  {choices.map((m) => <option key={m} value={m}>{m}分</option>)}
                  <option value="custom">入力…</option>
                </select>
                {customOn && (
                  <span className="inline-flex items-center gap-1">
                    <input type="text" inputMode="numeric" value={customText} onChange={(e) => setCustomText(e.target.value)} aria-label="間隔（分）"
                      className={`w-20 px-2 py-1 border bg-white text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200 ${intervalOk ? 'border-slate-300' : 'border-rose-400'}`} />
                    <span className="font-bold">分</span>
                  </span>
                )}
                <span className="font-bold">間隔で更新</span>
              </div>
              <p className="text-[16px] text-slate-500">
                この設定だと1日に最大 <b className="tabular-nums text-slate-700">{perDay}</b> 回押します。
                {customOn && !intervalOk && <span className="text-rose-700">間隔は{BUMP_CUSTOM_INTERVAL_MIN}〜{BUMP_CUSTOM_INTERVAL_MAX}分の数字で入れてください。</span>}
                {perDay > quota && <span className="text-rose-700">{siteName}は1日{quota}回までなので、超えた分は押しません。</span>}
                {startMin !== null && endMin !== null && startMin > endMin && <span>日をまたぐ時間帯として扱います。</span>}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap text-[17px] font-bold text-blue-600 border-b border-slate-100 pb-2">
                <button type="button" onClick={() => setBulkOpen((v) => !v)} className="underline">🔧 一括登録</button>
                <button type="button" onClick={() => setRows(timesMin.map((m) => minuteLabel(m)))} className="underline">⇅ 時刻順に並べ替え</button>
                <button type="button" onClick={() => { if (window.confirm('時刻をすべて消しますか？（「設定を保存」を押すまでは決まりません）')) setRows([]); }} className="underline">🗑 すべて削除</button>
                <span className="ml-auto text-[16px] font-normal text-slate-500 tabular-nums">{timesMin.length} / {BUMP_TIMES_MAX}個</span>
              </div>
              {bulkOpen && (
                <div className="relative space-y-3 border border-slate-200 bg-slate-100 p-3 sm:p-4 text-[16px] text-slate-700">
                  <button type="button" onClick={() => setBulkOpen(false)} aria-label="一括登録を閉じる" className="absolute right-2 top-1.5 px-2 text-[22px] leading-none text-slate-500 hover:text-slate-800">×</button>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 pr-8 border-b border-slate-200 pb-2 font-bold">
                    {([['step', '更新間隔と回数から設定'], ['range', '指定範囲時間と回数から間隔を設定'], ['paste', 'まとめて貼り付け']] as const).map(([k, label]) => (
                      <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="bulk-mode" checked={bulkMode === k} onChange={() => setBulkMode(k)} />{label}
                      </label>
                    ))}
                  </div>
                  {bulkMode === 'paste' ? (
                    <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={3}
                      placeholder="09:32 10:08 10:21 …（空白・改行・読点で区切って、まとめて貼り付け。全角も可）"
                      className="w-full px-2 py-1.5 border border-slate-300 bg-white text-[17px] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  ) : (
                    <div className="space-y-1">
                      <div className="text-[15px] font-bold text-slate-500">範囲</div>
                      <div className="flex items-center gap-2 flex-wrap tabular-nums">
                        <input type="time" step={60} value={bStart} onChange={(e) => setBStart(e.target.value)} aria-label="範囲のはじめ"
                          className="px-2 py-1.5 border border-slate-300 bg-amber-50 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                        {bulkMode === 'step' ? (
                          <>
                            <span>から</span>
                            <select value={bStep} onChange={(e) => setBStep(Number(e.target.value))} aria-label="間隔"
                              className="px-2 py-1.5 border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                              {BULK_STEPS.map((m) => <option key={m} value={m}>{m}分</option>)}
                            </select>
                            <span>間隔で</span>
                          </>
                        ) : (
                          <>
                            <span>〜</span>
                            <input type="time" step={60} value={bEnd} onChange={(e) => setBEnd(e.target.value)} aria-label="範囲の終わり"
                              className="px-2 py-1.5 border border-slate-300 bg-amber-50 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            <span>の間に</span>
                          </>
                        )}
                        <input type="text" inputMode="numeric" value={bCount} onChange={(e) => setBCount(e.target.value)} aria-label="回数"
                          className={`w-20 px-2 py-1.5 border text-right bg-amber-50 focus:outline-none focus:ring-2 focus:ring-blue-200 ${bCount.trim() && bN === null ? 'border-rose-400' : 'border-slate-300'}`} />
                        <span>回追加する</span>
                      </div>
                      <p className="text-[14px] text-slate-500">
                        {bulkMode === 'step'
                          ? '例: 10:00 から 15分間隔で 4回 → 10:00・10:15・10:30・10:45。0時をまたいだ分は次の日の時刻になります。'
                          : rangeGap !== null ? `約${rangeGap}分ごと（はじめと終わりの時刻も入ります）。終わりがはじめより前なら日をまたぎます。`
                          : 'はじめと終わりの時刻も入れて、その間を回数で均等に分けます。'}
                        {' '}今 {timesMin.length}個・あと{BUMP_TIMES_MAX - timesMin.length}個まで足せます。
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="button" onClick={addBulk} disabled={!bulkReady}
                      className="px-5 py-2 text-[16px] font-black text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400">一括登録</button>
                  </div>
                </div>
              )}
              <ol className="space-y-1">
                {rows.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-7 text-right text-[17px] text-slate-400 tabular-nums">{i + 1}</span>
                    <input type="time" step={60} value={r} onChange={(e) => setRows((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                      className={`w-52 px-3 py-1 border bg-white text-[18px] tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200 ${r && minuteFromLabel(r) === null ? 'border-rose-400' : 'border-slate-300'}`} />
                    <button type="button" onClick={() => setRows((v) => v.filter((_, j) => j !== i))} aria-label={`${i + 1}番目を消す`} className="px-2 text-slate-400 hover:text-rose-600">×</button>
                  </li>
                ))}
              </ol>
              {rows.length < BUMP_TIMES_MAX && (
                <button type="button" onClick={() => setRows((v) => [...v, ''])} className="px-3 py-1.5 text-[17px] font-bold text-slate-600 border border-dashed border-slate-300 hover:bg-slate-50">＋ 時刻を足す</button>
              )}
              <p className="text-[16px] text-slate-500 leading-relaxed">
                1日に <b className="tabular-nums text-slate-700">{perDay}</b> 回押します。実際に{siteName}に反映するのは数分以内になります。
              </p>
            </>
          )}
          <div className="flex items-center gap-3 flex-wrap border-t border-slate-100 pt-3">
            <button type="button" disabled={busy !== ''} onClick={() => void save(s.enabled, 'save')}
              className="px-6 py-2.5 text-[17px] font-black text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40">
              {busy === 'save' ? '保存中…' : '設定を保存'}
            </button>
            <span className="text-[16px] text-slate-500">
              保存すると、この枠は「{tab === 'times' ? '時刻指定更新' : 'タイマー更新'}」で押します。{s.enabled ? '' : '自動更新は止まったままです（上の「始める」で始まります）。'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

