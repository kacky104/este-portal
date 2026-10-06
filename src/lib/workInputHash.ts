// ★★ 出勤の自動反映の「フクエス側の材料の指紋」（第1245便・2026-10-06・カッキーさんの決定＝案B）。
//
// ★ ねらい: 自動反映の周（30分ごと）は、フクエス側の出勤が【前回送ったときから変わっていなければ】相手サイトへ行かない。
//   相手サイト（駅ちか・エステ魂）への負荷と目立ち方を抑える（ベンリーは1日1回しか読まない）。反映の速さ（30分以内）は保つ。
// ★ 指紋に入れるもの＝計画（planWork・planEsutamaWork）が読んでいるフクエス側の材料そのもの:
//   ・営業日（todayISO）… 日付が変わると窓がずれる＝指紋が変わる＝その日の最初の周は必ず行く
//   ・在籍（id・公開／非公開）・名簿の結び（castId）・送り先サイトで「送らない」の人
//   ・窓の中の出勤（人・日・出勤か・開始・終了）
//   ★ どれか1つでも変われば別の指紋＝行く。★ 余計に行く（空振り）ことはあっても、行くべきときに行かないことは無い。
// ★ 純粋関数（通信も DB も触らない）。材料を集めるのは src/app/lib/media/workInputHash.ts。

import { createHash } from 'node:crypto';

export type WorkInputTherapist = { id: number; active: boolean; castId: string | null; off: boolean };
export type WorkInputShift = { therapistId: number; dateISO: string; active: boolean; start: string | null; end: string | null };

export function workInputFingerprint(input: {
  todayISO: string;
  therapists: readonly WorkInputTherapist[];
  shifts: readonly WorkInputShift[];
}): string {
  const t = [...input.therapists]
    .sort((a, b) => a.id - b.id)
    .map((x) => `${x.id}:${x.active ? 1 : 0}:${x.castId ?? ''}:${x.off ? 1 : 0}`);
  const s = [...input.shifts]
    .sort((a, b) => a.therapistId - b.therapistId || a.dateISO.localeCompare(b.dateISO))
    .map((x) => `${x.therapistId}@${x.dateISO}:${x.active ? 1 : 0}:${x.start ?? ''}-${x.end ?? ''}`);
  const text = ['d=' + input.todayISO, 't=' + t.join(','), 's=' + s.join(',')].join('\n');
  return createHash('sha1').update(text).digest('hex');
}

/** ★ これより古い「同期済み」は信じない＝少なくとも1日1回は相手サイトを読みに行く（相手側で手で直されたぶんを拾う） */
export const WORK_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * 周を飛ばしてよいか。★ 指紋が同じで、同期が新しいときだけ true。
 * @param syncedHash 前回「同期できた」と記録した指紋（無ければ null）
 * @param syncedAt   その時刻（ISO・無ければ null）
 */
export function canSkipAutoPush(input: { hash: string; syncedHash: string | null; syncedAt: string | null; now: Date }): boolean {
  if (!input.syncedHash || !input.syncedAt) return false;
  if (input.syncedHash !== input.hash) return false;
  const at = Date.parse(input.syncedAt);
  if (!Number.isFinite(at)) return false;
  const age = input.now.getTime() - at;
  if (age < 0) return false;                    // 時計のずれ。★ 行く側へ倒す
  return age < WORK_SYNC_MAX_AGE_MS;
}
