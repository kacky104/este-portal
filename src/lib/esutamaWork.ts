// フクエスの出勤 → エステ魂の形（第109便・純粋関数）。
//
// ★★★ 営業日の物差しは駅ちか・エステラブと同じ（第104便: workPlan.toBusinessDayMinutes）。
//   フクエス   素の時刻（20:00〜03:00）。営業日が6時始まりなので 03:00 は【翌3:00】
//   エステ魂   24時超え表記（20:00〜27:00）。軸は店の営業時間で決まる（例 9:00〜30:00）
//   → 6:00 より前は +24時間。★ 日はずらさない（schedule_date がそのまま column[日付]）。
//
// ★ 30分刻みへの寄せは timeSnap.snapInward（内側へ・第73便の決定）。ここでも同じ。
// ★ 軸の外（例 8:00 開始）は **寄せない・送らない**。理由を返す（applyEsutamaShift が 'outside_axis' で止める）。

import { toBusinessDayMinutes } from './workPlan';
import { snapInward, snapNote } from './timeSnap';
import type { EsutamaRange } from './esutamaWorkParse';

export type EsutamaShift =
  | { ok: true; range: EsutamaRange; snappedNote: string | null }
  | { ok: false; reason: string };

/** フクエスの1人1日ぶん（素の時刻）→ エステ魂の範囲（営業日の分・24時超えあり） */
export function toEsutamaRange(input: { start: string; end: string }): EsutamaShift {
  const conv = toBusinessDayMinutes(input.start, input.end);
  if (!conv.ok) return { ok: false, reason: conv.reason };
  const snapped = snapInward(conv.startMin, conv.endMin);
  if (!snapped.ok) return { ok: false, reason: snapped.reason };
  return {
    ok: true,
    range: { startMin: snapped.startMin, endMin: snapped.endMin },
    snappedNote: snapNote(conv.startMin, conv.endMin, snapped),
  };
}
