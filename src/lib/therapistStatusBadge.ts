// セラピストの名前隣ステータスバッジの導出（今すぐ ＞ 出勤中 ＞ 出勤予定 ＞ 受付終了 ＞ お休み）。
// サーバー初期描画（ISR）とクライアント（マウント時の現在時刻）の両方から同じロジックで呼べる純関数。
// 今すぐ判定はオーナー枠 OR キャスト枠の和集合（src/lib/imasugu）、出勤中判定は共有の getScheduleWindowStatus を使う。
import { isImasuguLiveValues } from '@/lib/imasugu';
import { getScheduleWindowStatus } from '@/lib/dutyStatus';

export type StatusBadgeData = { label: string; bg: string; color: string; blink: boolean };

export function deriveTherapistStatusBadge(p: {
  ownerOn: boolean;
  ownerUntil: string | null;
  castOn: boolean;
  castUntil: string | null;
  todayIsActive: boolean;
  todayStart: string | null;
  todayEnd: string | null;
  now: Date;
}): StatusBadgeData {
  // 今すぐ（オーナー発・キャスト発の和集合。available_until が未来か＝時刻依存判定）。
  const availableNow = isImasuguLiveValues(p.ownerOn, p.ownerUntil, p.castOn, p.castUntil, p.now);
  // 本日の出勤窓（出勤日かつ実シフト時刻の時間帯。時刻未設定は出勤中扱い＝サイト標準）。
  const todayWindow: 'off' | 'onDuty' | 'before' | 'after' = !p.todayIsActive
    ? 'off'
    : p.todayStart && p.todayEnd
      ? getScheduleWindowStatus(p.todayStart, p.todayEnd)
      : 'onDuty';

  if (availableNow) return { label: '今すぐ', bg: 'linear-gradient(to right, #ec4899, #f97316)', color: '#ffffff', blink: true };
  if (todayWindow === 'onDuty') return { label: '出勤中', bg: '#22c55e', color: '#ffffff', blink: true };
  if (todayWindow === 'before') return { label: '出勤予定', bg: '#f97316', color: '#ffffff', blink: false };
  if (todayWindow === 'after') return { label: '受付終了', bg: '#94a3b8', color: '#ffffff', blink: false };
  return { label: 'お休み', bg: '#e2e8f0', color: '#475569', blink: false };
}
