// 駅ちかの枠2以降を「枠1と同じ」にそろえる自動登録（第1681便）の【打ち切り】（第1698便・A-3・2026-10-28・カッキーさんの決定）。★ 純粋関数のみ。
//
// ★★★ 何が起きていたか
//   slotMirror は「直近6時間に試した方を後ろに回す」だけで、あきらめがなかった。
//   1人でも駅ちかに登録できない方が残ると、全員そろったあとも20分ごとに駅ちかへログインして同じ方を試し続ける
//   （相手サイトへの負荷・目立ち方の方針に反する）。
// ★★★ 決まり
//   ・同じ方の登録が【24時間で3回】うまくいかなかったら、その方は試さない。
//     ★ 数えるのは、登録の流れが残す create_girl の記録のうち ok でないもの（名前で見る）。
//     ★ 24時間を過ぎた失敗は数えない＝一時的な不調なら、翌日また試す。
//   ・最後の失敗より後に、店舗様がその方を直した（therapists.updated_at が新しい）なら、すぐまた試す。
//   ・ホームの帯には【店舗様が直せる理由】の方だけ出す（カッキーさんの決定）。
//     直せないもの（駅ちか側の不調・画面が読めない等）は運営だけ（更新結果に今までどおり残る）。

import { normalizeName } from './mediaMatch';

/** この回数うまくいかなかったら試さない */
export const SLOT_MIRROR_GIVE_UP_COUNT = 3;
/** 数える期間 */
export const SLOT_MIRROR_GIVE_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type CreateGirlFailure = {
  name: string;
  at: string;
  /** create_girl の detail.reason */
  reason: string | null;
  /** 同じ名前が何人いたか（reason 'already_listed' のとき） */
  sameCount: number | null;
  /** 組み立てが止めた理由など（detail.note） */
  note: string | null;
};

/** 記録（salon_media_audit の行）から、登録がうまくいかなかったものだけを拾う */
export function createGirlFailures(rows: ReadonlyArray<{ event?: unknown; outcome?: unknown; detail?: unknown; created_at?: unknown }>): CreateGirlFailure[] {
  const out: CreateGirlFailure[] = [];
  for (const r of rows) {
    if (r.event !== 'create_girl' || r.outcome === 'ok') continue;
    const d = (r.detail && typeof r.detail === 'object' ? r.detail : {}) as Record<string, unknown>;
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    const at = typeof r.created_at === 'string' ? r.created_at : '';
    if (!name || !at) continue;
    out.push({
      name, at,
      reason: typeof d.reason === 'string' ? d.reason : null,
      sameCount: typeof d.sameCount === 'number' ? d.sameCount : null,
      note: typeof d.note === 'string' ? d.note : null,
    });
  }
  return out;
}

/**
 * ★ この方を試すのをやめているか。
 * @returns givenUp＝試さない／last＝いちばん新しい失敗（無ければ null）／count＝期間内の失敗の数
 */
export function slotMirrorGiveUp(input: {
  name: string;
  failures: ReadonlyArray<CreateGirlFailure>;
  nowMs: number;
  /** therapists.updated_at（読めなければ null） */
  updatedAt?: string | null;
}): { givenUp: boolean; last: CreateGirlFailure | null; count: number } {
  const want = normalizeName(input.name);
  const from = input.nowMs - SLOT_MIRROR_GIVE_UP_WINDOW_MS;
  const mine = input.failures
    .filter((f) => normalizeName(f.name) === want)
    .filter((f) => { const t = Date.parse(f.at); return Number.isFinite(t) && t >= from && t <= input.nowMs + 60_000; })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const last = mine[0] ?? null;
  if (mine.length < SLOT_MIRROR_GIVE_UP_COUNT || !last) return { givenUp: false, last, count: mine.length };
  // ★ 最後の失敗より後に直した → また試す
  const upd = Date.parse(String(input.updatedAt ?? ''));
  if (Number.isFinite(upd) && upd > Date.parse(last.at)) return { givenUp: false, last, count: mine.length };
  return { givenUp: true, last, count: mine.length };
}

/**
 * ★ ホームの帯に出す理由（店舗様が直せるものだけ）。直せないものは null＝帯に出さない（運営だけ）。
 */
export function slotMirrorStuckReason(f: CreateGirlFailure | null): string | null {
  if (!f) return null;
  if (f.reason === 'already_listed' && (f.sameCount ?? 0) > 1) {
    return '駅ちかに同じ名前の方が' + f.sameCount + '人いて、どの方か決められないため（セラピスト登録状況一覧で、結びつける方を選んでください）';
  }
  if (f.reason === 'blocked' && f.note) {
    return '登録する内容に問題があるため（' + f.note + '）';
  }
  return null;
}

/** ★ 帯の「閉じる」を覚える鍵（端末の localStorage）。中身は閉じたときに出ていた方の一覧（slotMirrorStuckIds） */
export function slotMirrorStuckDismissKey(salonId: number): string {
  return 'conecf:slotMirrorStuck:' + salonId;
}

/** ★ 出ている方の印（枠-セラピスト） */
export function slotMirrorStuckIds(people: ReadonlyArray<{ slot: number; therapistId: number }>): string[] {
  return people.map((p) => p.slot + '-' + p.therapistId).sort();
}

/** ★ 閉じたあとに【新しい方が増えた】か（＝また出す）。閉じた記録が無ければ true（出す） */
export function slotMirrorStuckShouldShow(current: ReadonlyArray<string>, dismissed: ReadonlyArray<string> | null): boolean {
  if (current.length === 0) return false;
  if (!dismissed) return true;
  const seen = new Set(dismissed);
  return current.some((id) => !seen.has(id));
}
