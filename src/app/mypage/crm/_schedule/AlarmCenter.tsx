'use client';

import { safeAction } from '../CrmBase';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCrmChangeMark, getCrmSchedule } from '@/app/actions/crm';
import { type CrmScheduleBooking, type CrmScheduleTherapist, type CrmAlarm } from '@/app/lib/crm/types';
import { alarmAudioReady, playAlarmOnce, resumeAlarmAudio, unlockAlarmAudio, vibrateAlarm } from '@/app/lib/crm/alarmSound';
import { REFRESH_MS, businessTodayJST, hm } from './shared';

// ── 予約アラーム（第559便・風俗CTIv2 の予約アラームにあたる）──────────────
// ★ スケジュール画面を開いている間だけ動く（閉じている・スリープ中は鳴らない）。
// ★ 1秒ごとに見て、「開始（終了）○分前」を過ぎたら、その予約のカードを点滅させ、音を○秒鳴らす。
//   別タブだとブラウザが時計を遅らせる（最大1分ほど）ので、時刻を過ぎて90秒（か鳴らす秒数）までは拾う。
// ★ 一度鳴らした予約×アラームは覚えておく（読み直しても二度鳴らさない・sessionStorage）。
// ★ 別の日を見ているときは、今日の予約を自分で読みに行く（60秒ごと）。
export type ActiveAlarm = { key: string; bookingId: string; text: string; until: number; sound: number };
export const FIRED_KEY = 'crm_alarm_fired';

export function AlarmCenter({
  salonId, isToday, bookings, therapists, alarms, hideButton = false, buttonHost = null,
}: {
  salonId: number;
  isToday: boolean;
  bookings: CrmScheduleBooking[];
  therapists: CrmScheduleTherapist[];
  alarms: CrmAlarm[];
  /** ★ 第1229便: 表の上をたたんでいるときは小さいボタンにする（前は出していなかった＝スマホは最初からたたんであるので、実質 ON にできなかった） */
  hideButton?: boolean;
  /** ★ 第1981便: 「アラームの音をON」のボタンを置く場所（日付の行の右端）。無ければ今までどおり表の上に1行 */
  buttonHost?: HTMLElement | null;
}) {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  useEffect(() => { readyRef.current = ready; }, [ready]);
  // ★ 第1982便（カッキーさん）: 一度 ON にすると切る手段が無かった → 緑のボタンを押すと音だけ止める（OFF）。もう一度押すと ON。
  //   OFF のあいだも、時間が来た予約の赤い帯と点滅は出す（音と振動だけ止める）。画面を読み直すと、いつもの「音をON」に戻る
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // ★ 第1229便: iOS はスリープ・電話・裏に回ると音の仕組みが止まる（state が running でなくなる）。
  //   前は一度 ON にすると「アラームON」のまま鳴らなかった → 画面に戻ったとき・1秒ごとの確認で止まっていたら、動かし直す。戻らなければボタンを出し直す。
  useEffect(() => {
    const check = async () => {
      if (!readyRef.current) return;
      if (alarmAudioReady()) return;
      const ok = await resumeAlarmAudio();
      if (!ok) setReady(false);
    };
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { void check(); }, 5000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, []);
  const [active, setActive] = useState<ActiveAlarm[]>([]);
  const [own, setOwn] = useState<{ bookings: CrmScheduleBooking[]; therapists: CrmScheduleTherapist[] } | null>(null);

  // 別の日を見ているときは、今日の分を自分で読む
  useEffect(() => {
    if (isToday || alarms.length === 0) return;
    let alive = true;
    // ★ 第1113便: アラームに要るのは予約と出勤だけ → lite で読む（設定・料金表は読まない）
    // ★ 第1116便: 変更マークが前回と同じなら読まない（マークを読めないときは毎回読む）
    let lastMark: string | null = null;
    const load = async () => {
      // ★ 2026-11-12 点検#11: 例外（圏外など）で止まらないように。読めなかった回は、次の回（60秒後）にもう一度
      let mark: string | null = null;
      try { mark = await getCrmChangeMark(salonId); } catch { mark = null; }
      if (!alive) return;
      if (mark !== null && lastMark !== null && mark === lastMark) return;
      const r = await safeAction(getCrmSchedule(salonId, businessTodayJST(), { lite: true }));
      if (!alive) return;
      if (r.ok) { setOwn({ bookings: r.data.bookings, therapists: r.data.therapists }); lastMark = mark; }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [isToday, salonId, alarms.length]);

  const src = useMemo(() => (isToday ? { bookings, therapists } : own), [isToday, bookings, therapists, own]);
  const activeRef = useRef<ActiveAlarm[]>([]);
  const lastPlayRef = useRef(0);
  const stop = (key: string | null) => {
    const next = key ? activeRef.current.filter((x) => x.key !== key) : [];
    activeRef.current = next;
    setActive(next);
  };

  useEffect(() => {
    if (!src || alarms.length === 0) return;
    const names = new Map(src.therapists.map((t) => [t.id, t.name]));
    const readFired = (): Set<string> => {
      try { return new Set(JSON.parse(sessionStorage.getItem(FIRED_KEY) || '[]') as string[]); } catch { return new Set(); }
    };
    const fired = readFired();
    const saveFired = () => {
      try { sessionStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-500))); } catch { /* 何もしない */ }
    };
    const step = () => {
      const now = Date.now();
      const found: ActiveAlarm[] = [];
      for (const b of src.bookings) {
        if (b.status === 'cancelled') continue;
        const start = new Date(b.slotStartISO).getTime();
        const end = b.courseMin ? start + b.courseMin * 60000 : new Date(b.slotEndISO).getTime();
        alarms.forEach((a, i) => {
          const at = (a.on === 'start' ? start : end) - a.min * 60000;
          const key = `${b.id}|${a.on}|${a.min}|${i}`;
          if (now < at || now >= at + Math.max(a.sec * 1000, 90_000) || fired.has(key)) return;
          fired.add(key);
          const who = b.therapistId != null ? names.get(b.therapistId) ?? '' : 'フリー';
          const cust = b.customer?.name || b.customerName || '';
          found.push({
            key,
            bookingId: b.id,
            text: `${who} ${hm(b.slotStartISO)}〜 ${cust} ／ 予約${a.on === 'start' ? '開始' : '終了'}${a.min}分前`,
            until: now + a.sec * 1000,
            sound: a.sound,
          });
        });
      }
      if (found.length > 0) saveFired();
      const cur = activeRef.current;
      const next = [...cur.filter((x) => x.until > now), ...found];
      if (next.length !== cur.length || found.length > 0) {
        activeRef.current = next;
        setActive(next);
      }
      if (next.length > 0 && !mutedRef.current && now - lastPlayRef.current >= 1200) {
        lastPlayRef.current = now;
        playAlarmOnce(next[next.length - 1].sound);
        vibrateAlarm(); // ★ 第1229便: 音が出せない状態でも、対応しているスマホは振動で知らせる
      }
    };
    step();
    const t = setInterval(step, 1000);
    return () => clearInterval(t);
  }, [src, alarms]);

  if (alarms.length === 0) return null;
  const blinkCss = active.length > 0
    ? `@keyframes crmAlarmBlink{0%,100%{box-shadow:0 0 0 3px #f43f5e}50%{box-shadow:0 0 0 3px transparent;opacity:.55}}${
      [...new Set(active.map((a) => a.bookingId))].map((id) => `[data-bid="${id.replace(/"/g, '')}"]`).join(',')
    }{animation:crmAlarmBlink .8s linear infinite;z-index:30}`
    : '';

  // ★ 第1981便（カッキーさん）: 表の上の隙間を詰める。ボタンは日付の行の右端（buttonHost）へ出し、
  //   鳴っているときの赤い帯だけここ（表の上）に出す。説明「画面を開くたびに1回押してください」はボタンの title へ
  const button = !ready ? (
    <button
      type="button"
      onClick={async () => { const ok = await unlockAlarmAudio(); setReady(ok && alarmAudioReady()); if (ok) playAlarmOnce(1); }}
      title="アラームの音を鳴らせるようにします（画面を開くたびに1回押してください）"
      className="whitespace-nowrap border border-amber-500 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 md:px-3 md:py-1 md:text-[13px]"
    >
      {hideButton ? '🔔 音をON' : '🔔 アラームの音をON'}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setMuted((v) => !v)}
      title={muted ? '押すとアラームの音を鳴らします' : '押すとアラームの音を止めます（時間が来た予約の赤い帯は出ます）'}
      className={`whitespace-nowrap px-2 py-0.5 text-[11px] font-bold text-white md:px-3 md:py-1 md:text-[13px] ${muted ? 'bg-slate-500' : 'bg-emerald-600'}`}
    >
      {muted ? `🔕 ${hideButton ? 'OFF' : 'アラームOFF'}` : `🔔 ${hideButton ? 'ON' : 'アラームON'}`}
    </button>
  );

  return (
    <>
      {blinkCss && <style>{blinkCss}</style>}
      {buttonHost ? createPortal(button, buttonHost) : <div className="mb-2">{button}</div>}
      {active.length > 0 && (
        <div className="sticky top-0 z-40 mb-2 space-y-1">
          {active.map((a) => (
            <div key={a.key} className="flex items-center gap-2 bg-rose-600 px-3 py-2 text-[14px] font-bold text-white shadow-lg">
              <span className="animate-pulse">⏰</span>
              <span className="min-w-0 flex-1 truncate">{a.text}</span>
              <button type="button" onClick={() => stop(a.key)} className="bg-white px-3 py-1 text-[13px] font-bold text-rose-700">止める</button>
            </div>
          ))}
          {active.length > 1 && (
            <button type="button" onClick={() => stop(null)} className="bg-slate-800 px-3 py-1 text-[12px] font-bold text-white">全部止める</button>
          )}
        </div>
      )}
    </>
  );
}
