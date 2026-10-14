'use server';

// フクエスポイント: 会員の操作（第1444便・2026-10-14）。決まりは src/lib/points.ts。
// ★ 受け取りは DB の claim_visit_points()（予約1件1回・1日1回・24時間・同時押しでも二重にならない）。
// ★ 呼べるのはログインした会員本人だけ。券の文字列を知っているだけでは、ほかの人の分は受け取れない（1回きり）。
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { POINT_USE_UNIT, isPointToken, pointClaimMessage, pointUseMessage, type PointClaimStatus, type PointUseStatus } from '@/lib/points';
import { expireIfNeeded, readClaim, readMyPoints, type ClaimView, type MyPoints } from '@/app/lib/points/server';

type Err = { ok: false; error: string; needLogin?: boolean };

/** 来店ポイントを受け取る */
export async function claimVisitPoints(token: string): Promise<{ ok: true; status: PointClaimStatus; message: string; points: number; balance: number } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインしてください', needLogin: true };
  if (!isPointToken(token)) return { ok: false, error: pointClaimMessage('invalid') };
  const svc = createServiceClient();
  try { await expireIfNeeded(svc, user.id); } catch { /* 期限の処理に失敗しても受け取りは進める */ }
  const { data, error } = await svc.rpc('claim_visit_points', { p_token: token, p_user: user.id });
  if (error) return { ok: false, error: 'いまは受け取れません。少し時間をおいてお試しください' };
  const row = (Array.isArray(data) ? data[0] : data) as { r_status?: string; r_points?: number; r_balance?: number } | null;
  const status = (row?.r_status ?? 'invalid') as PointClaimStatus;
  const points = Number(row?.r_points) || 0;
  return { ok: true, status, message: pointClaimMessage(status, points), points, balance: Number(row?.r_balance) || 0 };
}

/**
 * ★ 第1454便: 1,000pt 使って 1,000円引きにする（同意書の完了画面から）。
 * ★ DB の use_visit_points()（予約1件1回・予約の終わりまで・残高が足りないと使えない・同時押しでも二重にならない）。
 */
export async function spendVisitPoints(token: string): Promise<{ ok: true; status: PointUseStatus; message: string; balance: number } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインしてください', needLogin: true };
  if (!isPointToken(token)) return { ok: false, error: pointUseMessage('invalid') };
  const svc = createServiceClient();
  try { await expireIfNeeded(svc, user.id); } catch { /* 期限の処理に失敗しても進める（DB 側で残高を確かめる） */ }
  const { data, error } = await svc.rpc('use_visit_points', { p_token: token, p_user: user.id, p_points: POINT_USE_UNIT });
  if (error) return { ok: false, error: 'いまは使えません。少し時間をおいてお試しください' };
  const row = (Array.isArray(data) ? data[0] : data) as { r_status?: string; r_balance?: number } | null;
  const status = (row?.r_status ?? 'invalid') as PointUseStatus;
  return { ok: true, status, message: pointUseMessage(status), balance: Number(row?.r_balance) || 0 };
}

/** 受け取り待ちの券の状態（会員ページの帯から使う） */
export async function getPointClaimState(token: string): Promise<{ ok: true; view: ClaimView; loggedIn: boolean } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const svc = createServiceClient();
  return { ok: true, view: await readClaim(svc, String(token ?? ''), user?.id ?? null), loggedIn: !!user };
}

/** 自分のポイント（残高・期限・履歴） */
export async function getMyPoints(): Promise<{ ok: true; points: MyPoints } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインしてください', needLogin: true };
  const p = await readMyPoints(createServiceClient(), user.id);
  if (!p) return { ok: false, error: 'ポイントを読み込めませんでした' };
  return { ok: true, points: p };
}
