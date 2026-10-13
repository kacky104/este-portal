// フクエスポイントの決まりごと（第1444便・2026-10-14・カッキーさん）。★ 純粋な値と判定だけ（通信も DB も触らない）。番人: npm run check:points
//
// ★★ 決まっていること
//   ・フクエス共通ポイント（運営が負担）。お客様向けの呼び方は「フクエスポイント」「フクエスポイント加盟店」（「CRM」とは言わない）。
//   ・来店1回 50pt（キャンペーン中）。1,000pt で税込 1,000円引き（使うのは第2弾・1回の来店で 1,000円まで）。
//   ・貯まるのは加盟店の部屋の QR で同意したあと、完了画面で「受け取る」を押した会員だけ。予約1件1回・同じ会員は1日1回まで。
//   ・受け取りは同意から24時間以内。有効期限は「最後に貯めた日から1年」。
//   ・お店には、誰が会員か・何ポイントかは見せない。

/** 来店1回で付くポイント（★ 変えるときはここだけ。表示の「キャンペーン中」も下の値） */
export const POINT_VISIT = 50;
/** 「来店1回 50pt（キャンペーン中）」の かっこ の中。空にすると出さない */
export const POINT_VISIT_NOTE = 'キャンペーン中';
/** 1回の利用の単位（pt）と、そのときの割引（円・税込） */
export const POINT_USE_UNIT = 1000;
export const POINT_USE_YEN = 1000;
/** 受け取りの期限（同意してから） */
export const POINT_CLAIM_HOURS = 24;
/** 有効期限（最後に貯めた日から・か月） */
export const POINT_EXPIRE_MONTHS = 12;

/** 受け取り待ちの券をブラウザに覚えておく鍵（★ 中身は券と期限だけ。権限には使わない） */
export const POINT_PENDING_KEY = 'fukues.pointClaim';

/** 最後に貯めた日時 → 期限（その日時の12か月後） */
export function pointExpiresAt(lastEarnIso: string | null): Date | null {
  if (!lastEarnIso) return null;
  const d = new Date(lastEarnIso);
  if (Number.isNaN(d.getTime())) return null;
  const e = new Date(d.getTime());
  e.setUTCMonth(e.getUTCMonth() + POINT_EXPIRE_MONTHS);
  return e;
}

/** 期限が過ぎているか（残高があるときだけ意味がある） */
export function pointsExpired(lastEarnIso: string | null, now: number = Date.now()): boolean {
  const e = pointExpiresAt(lastEarnIso);
  return !!e && e.getTime() < now;
}

/** 次の 1,000円引きまで、あと何 pt か（0 なら使える） */
export function pointsToNextUse(balance: number): number {
  const b = Math.max(0, Math.floor(balance));
  return b >= POINT_USE_UNIT ? 0 : POINT_USE_UNIT - b;
}

/** 受け取りの結果（claim_visit_points の r_status）→ お客様に出す文 */
export type PointClaimStatus = 'ok' | 'mine' | 'taken' | 'expired' | 'daily' | 'invalid';
export function pointClaimMessage(status: PointClaimStatus, points: number = POINT_VISIT): string {
  switch (status) {
    case 'ok': return `${points}pt 貯まりました`;
    case 'mine': return 'この来店のポイントは受け取り済みです';
    case 'taken': return 'この来店のポイントは、ほかのアカウントで受け取り済みです';
    case 'expired': return `受け取りの期限（同意から${POINT_CLAIM_HOURS}時間）が過ぎました`;
    case 'daily': return '来店ポイントは1日1回までです（本日は受け取り済みです）';
    default: return 'このポイントは受け取れません';
  }
}

/** ブラウザに覚えた受け取り待ち（JSON）を読む。★ 形が違う・期限切れは null */
export function parsePendingClaim(raw: string | null, now: number = Date.now()): { token: string; exp: number } | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { token?: unknown; exp?: unknown };
    const token = typeof o.token === 'string' ? o.token : '';
    const exp = typeof o.exp === 'number' ? o.exp : 0;
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token) || exp <= now) return null;
    return { token, exp };
  } catch {
    return null;
  }
}

/** 受け取り券の形（英数字・-_ だけ・20〜80字）。★ URL から来た値はまずこれで確かめる */
export function isPointToken(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(v);
}
