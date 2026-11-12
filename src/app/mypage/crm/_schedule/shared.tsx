'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { yen, type CrmScheduleBooking, type CrmScheduleTherapist } from '@/app/lib/crm/types';
import { FREE_LANE_MAX } from '@/app/lib/booking/freeLane';
import { getBusinessDateJST } from '@/lib/dutyStatus';

// ★ 2026-10-09 点検#4: Server Action は、圏外・デプロイ直後の古いチャンクなどで ok:false ではなく【例外】になることがある。
//   例外のまま busy が true に残ると、小窓のボタン・ESC・背景タップが全部効かなくなり、再読込しかなくなる（しかも無言）。
//   → 画面から呼ぶ所は全部ここを通し、例外は ok:false の文に変える（呼び出し側の setBusy(false) がそのまま動く）。
export const NET_ERR = '通信できませんでした。もう一度お試しください';
export async function safeCall<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error('[crm] server action failed', e);
    return { ok: false, error: NET_ERR };
  }
}

// フクエスCRM「スケジュール」（第530便・2026-09-19）。★ 風俗CTIv2 の本日スケジュールにならった画面。
//
// ★ 行＝その日に出勤しているセラピスト（＋予約だけ残っている人）。上にフリー客の行（予約があるときだけ）。
// ★ 横＝時間。ピンクの帯が出勤、カードが予約。★ カードにお客様の分類・要注意・女子NG を重ねる。
// ★ カードを押すと右にお客様と予約の詳細（台帳へのリンク・悪質キャンセルの付け外し）。
// ★ 出勤と予約は予約ボード（無料）と同じデータ・同じサーバー処理（actions/booking.ts）。
// ★ 第531便：この画面で予約の受付・変更（担当・時間・内容）・確定・キャンセル・削除ができる。
//   空いているところを押す＝受付／カードを押す＝詳細（そこから変更・キャンセル）。
//   受付フォームで電話番号を入れると台帳を引き、分類・要注意・女子NG を出す（名前が空なら入れる）。
// ★ 日付は【営業日】（朝6時区切り）。★ 表示は 6:00〜翌7:00 の中で、予定がある範囲（最低 10時〜翌5時）。

/** ★ 第1984便: スマホの件数の行だけで使う短い金額。1万円以上は「12.5万」（0.1万＝千円の単位で四捨五入）、1万円未満は ¥9,500 */
export function yenShort(v: number): string {
  if (Math.abs(v) < 10000) return yen(v);
  const man = Math.round(v / 1000) / 10;
  return `${Number.isInteger(man) ? man.toFixed(0) : man.toFixed(1)}万`;
}

export const PX_PER_MIN = 1.6;       // 1時間＝96px
export const NAME_W = 150;
export const MEMO_W = 160;             // 女子メモの列（2026-09-19）
// ★★ 行の高さは伸ばさない（カッキーさん 2026-11-12:「店舗様は、できるだけ1画面にたくさんの行が写ることを喜ばれます」）。
//   第1977便で 72 にしたのは誤り → 第1978便で 66 に戻した。
//   名前・時刻・報酬の3行は、左の枠の中を詰めて 66px に収める（1行目 20px・2行目 16px・3行目 22px ＝ 58px）。
//   ★ 第1980便: 左の枠の中身は【上下の真ん中】に置く（前は上にだけ隙間があって、下が切れていた）。文字・ボタンの大きさは元のまま
//   ★ 左の枠に何か足すときは、65px の中に収めること（はみ出すと3行目の「確定」と ▲▼ が切れる）
export const ROW_H = 66;
/** ★ 第1787便: グループ予約の最大人数 */
export const PARTY_MAX = 10;
/** ★ 第1786便: フリーの行の最大数（★ 第1788便: サーバーの「フリーは同じ時間に3件まで」と同じ数） */
export const FREE_ROWS_MAX = FREE_LANE_MAX;

/**
 * ★ 第1786便: 担当未定の予約をフリーの行に分ける。時間が重ならないように、上の行から順に入れる。
 *   行は want 本（1〜3）。重なって入りきらないときは行を増やす（最大3行。それでも重なるときは、いちばん早く空く行に重ねる）。
 */
export function splitFreeLanes(bookings: CrmScheduleBooking[], want: number): Row[] {
  const sorted = [...bookings].sort((a, b) => a.slotStartISO.localeCompare(b.slotStartISO));
  const lanes: { end: number; items: CrmScheduleBooking[] }[] = [];
  for (const b of sorted) {
    const s = new Date(b.slotStartISO).getTime();
    const e = new Date(b.slotEndISO).getTime();
    let lane = lanes.find((l) => l.end <= s);
    if (!lane && lanes.length < FREE_ROWS_MAX) { lane = { end: 0, items: [] }; lanes.push(lane); }
    if (!lane) lane = lanes.reduce((a, l) => (l.end < a.end ? l : a));
    lane.items.push(b);
    lane.end = Math.max(lane.end, e);
  }
  const n = Math.max(1, Math.min(FREE_ROWS_MAX, Math.max(want, lanes.length)));
  return Array.from({ length: n }, (_, i) => ({ key: i === 0 ? 'free' : `free${i + 1}`, therapist: null, bookings: lanes[i]?.items ?? [] }));
}
export const DAY_START_MIN = 6 * 60;  // 営業日の始まり（6:00）
export const WINDOW_END_MIN = 31 * 60; // 予約ボードの窓の終わり（翌7:00）
export const REFRESH_MS = 60_000;
// ★ 第1116便: 変更マークが同じでも、これだけ経ったら読み直す（「これから → 利用」のように時間で変わる表示のため）
export const FORCE_RELOAD_MS = 10 * 60_000;
export const CLICK_STEP_MIN = 15;   // 空きを押したときの開始時刻の刻み
export const FORM_STEP_MIN = 5;     // フォームで選べる開始時刻の刻み（CTIv2 と同じ5分）
// ★ 第1361便（カッキーさん）: インターバルの選択肢を なし・5・10・15・20・25・30分 に（前は 0・15・30・45・60）。
//   ★ 既存の予約や店の既定が 45・60 のときは、その値も選択肢に足して出す（変更して保存できるように・サーバーは5分刻み 0〜60 を受ける）
export const INTERVAL_OPTIONS = [0, 5, 10, 15, 20, 25, 30] as const;
export const intervalOptionsWith = (cur: number): number[] =>
  (INTERVAL_OPTIONS as readonly number[]).includes(cur) ? [...INTERVAL_OPTIONS] : [...INTERVAL_OPTIONS, cur].sort((a, b) => a - b);

export const JST_HM = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });

/** 営業日（朝6時区切り）の YYYY-MM-DD。★ 第1986便: 正本は lib/dutyStatus（写しを4か所に持たない） */
export const businessTodayJST = (): string => getBusinessDateJST();
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${date.slice(0, 4)}年${date.slice(5, 7)}月${date.slice(8, 10)}日（${w}）`;
}
/** その日 0:00 からの分（翌日なら 24*60 以上） */
export function minOfDay(iso: string, baseMs: number): number {
  return Math.round((new Date(iso).getTime() - baseMs) / 60000);
}
export function hourLabel(h: number): string {
  return h >= 24 ? `翌${h - 24}時` : `${h}時`;
}
export function hm(iso: string): string {
  return JST_HM.format(new Date(iso));
}

// ★ スマホ（md 未満）かどうか（第541便）。★ サーバーでは false（PC の形）。
export function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia('(max-width: 767px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
// ★ 点検（低 T・a11y）: 小窓を開いたら枠にフォーカスを移す（Tab で背景の「◀前日」などへ抜けない・読み上げが題名を言う）。
//   開いたときの1回だけ。入力欄に autoFocus があるものはそちらが勝つ
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.contains(document.activeElement)) return; // すでに中の入力にフォーカスがある
    el.focus({ preventScroll: true });
  }, []);
  return ref;
}

// ★ 第1790便（カッキーさん）: 小窓（受付・お客様と予約）を、見出しの帯をつかんで動かせる。
//   ★ 帯の中のボタン（×・かんたん／くわしく）は今までどおり押せる（そこからはつかまない）。★ 画面の外へは出しきらない（見出しが少し残る）。
//   ★ 閉じて開き直すと真ん中に戻る。
export function useDragMove() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const st = start.current;
    if (!st) return;
    const lim = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    setPos({ x: lim(st.x + e.clientX - st.px, window.innerWidth / 2), y: lim(st.y + e.clientY - st.py, window.innerHeight / 2 - 30) });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    style: { transform: `translate(${pos.x}px, ${pos.y}px)` } as React.CSSProperties,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, title: 'つかんで動かせます' },
    handleCls: 'cursor-move select-none touch-none',
  };
}

export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false,
  );
}

export type Row = { key: string; therapist: CrmScheduleTherapist | null; bookings: CrmScheduleBooking[]; done?: boolean };
