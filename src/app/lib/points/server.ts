// フクエスポイント: サーバーの下請け（第1444便）。★ 'use server' は付けない（action・サーバーの画面からだけ呼ぶ）。
// ★ 読み書きは service_role（member_points・point_claims）。会員の判定は呼ぶ側で getUser 済みの id を渡す。
// ★ 表がまだ無い（SQL 前）・読めないときは、同意書や会員ページを壊さない（null・空を返す）。
import { randomBytes } from 'crypto';
import { createServiceClient } from '@/app/lib/supabase/service';
import { POINT_CAMPAIGN_START, POINT_CLAIM_HOURS, POINT_EARN_KINDS, POINT_FIRST_REVIEW, POINT_SIGNUP, POINT_VISIT, isPointToken, pointExpiresAt, pointsExpired, pointsYenOf, signupPointEligible } from '@/lib/points';

type Svc = ReturnType<typeof createServiceClient>;

/**
 * 同意書を送ったときに、その予約の受け取り券を作る（加盟店だけ）。★ 予約1件に1枚（サインし直しても同じ券を返す）。
 * ★ 何があっても同意書の送信は止めない（失敗したら null＝完了画面にポイントの欄を出さない）。
 */
export async function createVisitClaim(svc: Svc, salonId: number, bookingId: string, businessDate: string): Promise<string | null> {
  try {
    const { data: salon, error: sErr } = await svc.from('salons').select('points_member').eq('id', salonId).maybeSingle();
    if (sErr || !salon || salon.points_member !== true) return null;
    const { data: had } = await svc.from('point_claims').select('token').eq('booking_id', bookingId).maybeSingle();
    if (had?.token) return String(had.token);
    const token = randomBytes(24).toString('base64url'); // 32字
    const { error } = await svc.from('point_claims').insert({
      token,
      salon_id: salonId,
      booking_id: bookingId,
      business_date: businessDate,
      points: POINT_VISIT,
      expires_at: new Date(Date.now() + POINT_CLAIM_HOURS * 3600_000).toISOString(),
    });
    if (error) {
      // ★ 同時に2回送られて先に入っていた → その券を返す
      const { data: again } = await svc.from('point_claims').select('token').eq('booking_id', bookingId).maybeSingle();
      return again?.token ? String(again.token) : null;
    }
    return token;
  } catch {
    return null;
  }
}

export type ClaimView =
  | { kind: 'none' }
  | { kind: 'open'; points: number; expiresAt: string }
  | { kind: 'claimed'; points: number; mine: boolean }
  | { kind: 'expired'; points: number };

/** 完了画面に出す、券の状態（★ お店の名前・予約の中身は返さない） */
export async function readClaim(svc: Svc, token: string, userId: string | null): Promise<ClaimView> {
  if (!isPointToken(token)) return { kind: 'none' };
  try {
    const { data, error } = await svc.from('point_claims').select('points, expires_at, claimed_by').eq('token', token).maybeSingle();
    if (error || !data) return { kind: 'none' };
    const points = Number(data.points) || POINT_VISIT;
    if (data.claimed_by) return { kind: 'claimed', points, mine: !!userId && data.claimed_by === userId };
    if (new Date(String(data.expires_at)).getTime() < Date.now()) return { kind: 'expired', points };
    return { kind: 'open', points, expiresAt: String(data.expires_at) };
  } catch {
    return { kind: 'none' };
  }
}

export type MyPointRow = { id: number; delta: number; kind: string; salonName: string; createdAt: string };
export type MyPoints = { balance: number; lastEarnAt: string | null; expiresAt: string | null; rows: MyPointRow[] };

/**
 * 会員のポイント（残高・期限・履歴）。★ 期限（最後に貯めた日から1年）が過ぎていたら、ここで expire の行を足して 0 にする。
 * ★ 表が無い・読めないときは null。
 */
export async function readMyPoints(svc: Svc, userId: string, historyLimit = 100): Promise<MyPoints | null> {
  try {
    await expireIfNeeded(svc, userId);
    const { data, error } = await svc
      .from('member_points').select('id, delta, kind, salon_id, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(5000);
    if (error) return null;
    const all = data ?? [];
    const balance = all.reduce((s, r) => s + (Number(r.delta) || 0), 0);
    const lastEarn = all.find((r) => POINT_EARN_KINDS.includes(String(r.kind)))?.created_at as string | undefined; // ★ 第1450便: 登録・口コミも「貯めた日」
    const top = all.slice(0, historyLimit);
    const ids = [...new Set(top.map((r) => Number(r.salon_id)).filter((n) => Number.isInteger(n) && n > 0))];
    const names = new Map<number, string>();
    if (ids.length > 0) {
      const { data: s } = await svc.from('salons').select('id, name').in('id', ids);
      for (const r of s ?? []) names.set(Number(r.id), String(r.name ?? ''));
    }
    return {
      balance,
      lastEarnAt: lastEarn ?? null,
      expiresAt: balance > 0 ? (pointExpiresAt(lastEarn ?? null)?.toISOString() ?? null) : null,
      rows: top.map((r) => ({
        id: Number(r.id),
        delta: Number(r.delta),
        kind: String(r.kind),
        salonName: names.get(Number(r.salon_id)) ?? '',
        createdAt: String(r.created_at),
      })),
    };
  } catch {
    return null;
  }
}

/** 最後に貯めた日から1年たった残高を 0 にする（expire の行を足す）。★ 何度呼んでも同じ */
export async function expireIfNeeded(svc: Svc, userId: string): Promise<void> {
  const { data, error } = await svc.from('member_points').select('delta, kind, created_at').eq('user_id', userId).limit(5000);
  if (error || !data || data.length === 0) return;
  const balance = data.reduce((s, r) => s + (Number(r.delta) || 0), 0);
  if (balance <= 0) return;
  const lastEarn = data.filter((r) => POINT_EARN_KINDS.includes(String(r.kind))).map((r) => String(r.created_at)).sort().pop() ?? null;
  if (!pointsExpired(lastEarn)) return;
  await svc.from('member_points').insert({ user_id: userId, delta: -balance, kind: 'expire', note: '有効期限（最後に貯めた日から1年）' });
}

/**
 * ★ 第1450便: 会員登録のポイント（50pt・キャンペーン）。確認メールのリンクで登録が終わったとき（/auth/callback）と、
 *   会員ページを開いたとき（確認のリンクを別のブラウザで開いてログインし直した人の取りこぼし）に呼ぶ。
 * ★ 付けるのは「キャンペーン開始より後に登録した・メール確認済み」の会員だけ。1人1回（DB の一意の決まり）。何度呼んでも同じ。
 */
export async function ensureSignupPoints(
  svc: Svc,
  user: { id: string; created_at?: string | null; email_confirmed_at?: string | null },
): Promise<boolean> {
  try {
    if (!signupPointEligible(user.created_at ?? null, user.email_confirmed_at ?? null)) return false;
    const { data: had } = await svc.from('member_points').select('id').eq('user_id', user.id).eq('kind', 'signup').maybeSingle();
    if (had) return false;
    const { error } = await svc.from('member_points').insert({ user_id: user.id, delta: POINT_SIGNUP, kind: 'signup', note: '会員登録（キャンペーン）' });
    return !error;
  } catch {
    return false;
  }
}

/**
 * ★ 第1450便: はじめての口コミのポイント（50pt・キャンペーン）。運営が口コミを承認したときに呼ぶ。
 * ★ キャンペーン開始より前に承認された口コミがある人は対象外。1人1回（DB の一意の決まり）。失敗しても承認は止めない。
 */
export async function grantFirstReviewPoints(svc: Svc, userId: string | null, reviewId: string): Promise<boolean> {
  try {
    if (!userId) return false;
    const { count, error: cErr } = await svc.from('therapist_reviews').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'approved').lt('reviewed_at', new Date(POINT_CAMPAIGN_START).toISOString());
    if (cErr || (count ?? 0) > 0) return false;
    const { data: had } = await svc.from('member_points').select('id').eq('user_id', userId).eq('kind', 'review').maybeSingle();
    if (had) return false;
    const { error } = await svc.from('member_points').insert({ user_id: userId, delta: POINT_FIRST_REVIEW, kind: 'review', ref_id: String(reviewId), note: 'はじめての口コミ（キャンペーン）' });
    return !error;
  } catch {
    return false;
  }
}

/** ★ 第1450便: まだ「はじめての口コミのポイント」の対象か（投稿フォームの案内を出すかどうか） */
export async function firstReviewPointOpen(svc: Svc, userId: string): Promise<boolean> {
  try {
    const { data: had, error } = await svc.from('member_points').select('id').eq('user_id', userId).eq('kind', 'review').maybeSingle();
    if (error || had) return false;
    const { count } = await svc.from('therapist_reviews').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'approved').lt('reviewed_at', new Date(POINT_CAMPAIGN_START).toISOString());
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

// ── ★ 第1454便: 第2弾「使う」（1,000pt で税込 1,000円引き）──────────────────
//   ・使うのは同意書の完了画面（受け取り券 c の画面）で、ログインした会員本人。予約1件に1回・予約の終わりの時刻まで。
//   ・記録は member_points の kind='use'（−1,000・booking_id 付き）。運営が取り消すと kind='refund'（＋1,000）。
//   ・お店（CRM）には「この予約でフクエスポイントが何円使われたか」だけ渡す（会員・残高は渡さない）。

export type UseView =
  | { kind: 'none' }                                   // 券が無い・加盟店でない
  | { kind: 'closed' }                                 // 予約が終わった・取り消された・券の期限切れ（まだ使っていない）
  | { kind: 'used'; mine: boolean; yen: number }      // この予約で使用済み
  | { kind: 'open'; balance: number | null };         // 使える（balance＝ログインしていなければ null）

/** 完了画面に出す「使う」の状態（★ お店の名前・予約の中身は返さない） */
export async function readUse(svc: Svc, token: string, userId: string | null): Promise<UseView> {
  if (!isPointToken(token)) return { kind: 'none' };
  try {
    const { data: c, error } = await svc.from('point_claims').select('salon_id, booking_id, expires_at').eq('token', token).maybeSingle();
    if (error || !c) return { kind: 'none' };
    const bookingId = String(c.booking_id);
    const [{ data: rows, error: uErr }, { data: salon }, { data: bk }] = await Promise.all([
      svc.from('member_points').select('user_id, delta, kind').eq('booking_id', bookingId).in('kind', ['use', 'refund']),
      svc.from('salons').select('points_member').eq('id', Number(c.salon_id)).maybeSingle(),
      svc.from('salon_bookings').select('status, slot_end').eq('id', bookingId).maybeSingle(),
    ]);
    if (uErr || salon?.points_member !== true) return { kind: 'none' };
    const yen = pointsYenOf((rows ?? []).map((r) => Number(r.delta)));
    if (yen > 0) {
      const use = (rows ?? []).find((r) => r.kind === 'use');
      return { kind: 'used', mine: !!userId && use?.user_id === userId, yen };
    }
    if ((rows ?? []).some((r) => r.kind === 'use')) return { kind: 'closed' }; // ★ 使ったあと運営が取り消した＝この予約ではもう使えない
    const now = Date.now();
    if (!bk || bk.status === 'cancelled' || new Date(String(bk.slot_end)).getTime() < now || new Date(String(c.expires_at)).getTime() < now) return { kind: 'closed' };
    if (!userId) return { kind: 'open', balance: null };
    await expireIfNeeded(svc, userId);
    const { data: pts, error: pErr } = await svc.from('member_points').select('delta').eq('user_id', userId).limit(5000);
    if (pErr) return { kind: 'none' };
    return { kind: 'open', balance: (pts ?? []).reduce((a, r) => a + (Number(r.delta) || 0), 0) };
  } catch {
    return { kind: 'none' };
  }
}

/**
 * 予約ごとのフクエスポイントの利用額（円）。★ CRM の予約カード・日報・金銭授受に使う。会員・残高は返さない。
 * ★ 読めないときは空（CRM の画面は止めない）。
 */
export async function pointsYenByBooking(svc: Svc, bookingIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(bookingIds.map(String))];
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await svc.from('member_points').select('booking_id, delta').in('booking_id', ids.slice(i, i + 200)).in('kind', ['use', 'refund']);
      if (error) return new Map();
      const by = new Map<string, number[]>();
      for (const r of data ?? []) {
        const k = String(r.booking_id);
        const arr = by.get(k) ?? []; arr.push(Number(r.delta)); by.set(k, arr);
      }
      for (const [k, ds] of by) { const y = pointsYenOf(ds); if (y > 0) out.set(k, y); }
    }
  } catch {
    return new Map();
  }
  return out;
}

/** お店の、予約ごとのフクエスポイントの利用額（円）。★ 金銭授受の読み方の予備（DB の関数が無いとき）用 */
export async function pointsYenBySalon(svc: Svc, salonId: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { data, error } = await svc.from('member_points').select('booking_id, delta').eq('salon_id', salonId).in('kind', ['use', 'refund']).not('booking_id', 'is', null).limit(50000);
    if (error) return out;
    const by = new Map<string, number[]>();
    for (const r of data ?? []) {
      const k = String(r.booking_id);
      const arr = by.get(k) ?? []; arr.push(Number(r.delta)); by.set(k, arr);
    }
    for (const [k, ds] of by) { const y = pointsYenOf(ds); if (y > 0) out.set(k, y); }
  } catch { /* 空のまま */ }
  return out;
}

/**
 * 月の請求書で差し引く、お店ごとのフクエスポイントの利用（円・件）。★ usageMonth＝'YYYY-MM-01'（日本時間のその月に使われた分）。
 * ★ 運営が取り消した（refund のある）予約は数えない。読めなければ error（請求書を差し引き無しで作らない）。
 */
export async function pointUsesForMonth(svc: Svc, usageMonth: string): Promise<{ ok: true; bySalon: Map<number, { count: number; yen: number }> } | { ok: false; error: string }> {
  const y = Number(usageMonth.slice(0, 4));
  const m = Number(usageMonth.slice(5, 7));
  const from = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600_000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) - 9 * 3600_000).toISOString();
  const { data: uses, error } = await svc.from('member_points').select('salon_id, booking_id, delta')
    .eq('kind', 'use').gte('created_at', from).lt('created_at', to).not('salon_id', 'is', null).limit(50000);
  if (error) return { ok: false, error: `フクエスポイントの利用を読めませんでした：${error.message}` };
  const list = uses ?? [];
  const refunded = new Set<string>();
  const bids = [...new Set(list.map((u) => String(u.booking_id)).filter((b) => b && b !== 'null'))];
  for (let i = 0; i < bids.length; i += 200) {
    const { data: rf, error: rErr } = await svc.from('member_points').select('booking_id').eq('kind', 'refund').in('booking_id', bids.slice(i, i + 200));
    if (rErr) return { ok: false, error: `フクエスポイントの取り消しを読めませんでした：${rErr.message}` };
    for (const r of rf ?? []) refunded.add(String(r.booking_id));
  }
  const bySalon = new Map<number, { count: number; yen: number }>();
  for (const u of list) {
    if (refunded.has(String(u.booking_id))) continue;
    const sid = Number(u.salon_id);
    const a = bySalon.get(sid) ?? { count: 0, yen: 0 };
    a.count += 1;
    a.yen += Math.max(0, -Number(u.delta) || 0);
    bySalon.set(sid, a);
  }
  return { ok: true, bySalon };
}
