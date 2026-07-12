'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID, MODERATOR_UUIDS } from '@/app/lib/admin';
import { syncSalonRating } from '@/app/lib/reviews';

// 口コミ（therapist_reviews）の Server Actions。
//
// ★ 認可・クライアント使い分け（厳守）
// - 投稿（submitReview）は service_role を絶対に使わない。server/cookie 版 createClient で
//   セッション付き insert（RLS が効く）。status は送らず DB default 'pending'。
// - 承認/却下/削除のみ assertModerator（モデレーター許可リスト）通過後に createServiceClient を使う。

// /therapist/[id] の ISR キャッシュを即時更新。
function revalidateTherapist(therapistId: number | string): void {
  revalidatePath(`/therapist/${therapistId}`);
}

// /salon/[id] の ISR キャッシュを即時更新（店舗集計の反映用）。
function revalidateSalon(salonId: number | string): void {
  revalidatePath(`/salon/${salonId}`);
}

// ログインユーザーが管理者本人かをサーバー側で検証。通過しなければ throw し、
// 以降の service_role 操作には絶対に到達させない。
// ※現状は審査アクションが assertModerator を使うため未参照だが、将来の管理者専用操作のために残置。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function assertAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインが必要です');
  if (user.id !== ADMIN_UUID) throw new Error('管理者権限がありません');
  return user.id;
}

// ログインユーザーがモデレーター許可リストに含まれるかをサーバー側で検証。
// 通過しなければ throw し、以降の service_role 操作には絶対に到達させない。
async function assertModerator(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインが必要です');
  if (!MODERATOR_UUIDS.includes(user.id)) throw new Error('審査権限がありません');
  return user.id;
}

// rating が 0.5刻みで 0.5〜5.0 か。
function isValidRating(r: number): boolean {
  return Number.isFinite(r) && r >= 0.5 && r <= 5.0 && Math.round(r * 2) === r * 2;
}

// 'YYYY-MM-DD' として妥当か（実在日かつ書式一致）。
function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00+09:00');
  if (Number.isNaN(d.getTime())) return false;
  // 正規化して入力と一致するか（例: 2026-02-31 を弾く）。JSTで判定。
  const norm = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
  return norm === s;
}

// JST の今日（'YYYY-MM-DD'）。
function todayJST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

type SubmitInput = {
  salonId: number;
  therapistId: number;
  ratingService: number;
  ratingTechnique: number;
  ratingReception: number;
  visitedOn: string; // 'YYYY-MM-DD'
  body: string;
};

// 口コミを投稿（会員本人・authenticated クライアントで insert）。
// 未ログイン/バリデーションNG/改ざんは throw（クライアント側で誘導・検証済みだが二重防御）。
export async function submitReview(input: SubmitInput): Promise<void> {
  const { salonId, therapistId, ratingService, ratingTechnique, ratingReception, visitedOn, body } =
    input;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('口コミの投稿にはログインが必要です');

  // 入力バリデーション。
  if (!Number.isFinite(therapistId) || !Number.isFinite(salonId)) {
    throw new Error('対象が不正です');
  }
  if (!isValidRating(ratingService) || !isValidRating(ratingTechnique) || !isValidRating(ratingReception)) {
    throw new Error('評価は各項目とも0.5〜5.0の0.5刻みで選んでください');
  }
  const text = (body ?? '').trim();
  if (text.length < 1 || text.length > 2000) {
    throw new Error('本文は1〜2000文字で入力してください');
  }
  if (!isValidDateString(visitedOn)) {
    throw new Error('来店日が正しくありません');
  }
  if (visitedOn > todayJST()) {
    throw new Error('来店日は今日以前の日付を選んでください');
  }

  // therapistId が salonId に属し、かつ is_active=true かをサーバー側で検証（フォーム改ざん対策）。
  // service_role ではなく通常クライアントの読みでよい（公開情報）。
  const { data: th, error: thErr } = await supabase
    .from('therapists')
    .select('salon_id, is_active')
    .eq('id', therapistId)
    .maybeSingle();
  if (thErr || !th) throw new Error('対象のセラピストが見つかりません');
  if ((th.salon_id as number) !== salonId || !(th.is_active as boolean)) {
    throw new Error('対象のセラピストが正しくありません');
  }

  // 連投ガード（2026-07-12）：従来は同一セラピストへ pending を無制限に連投でき、
  // 審査キューを洪水させられた。job_applications・createBooking の tel ガードと同方針。
  // RLS の SELECT ポリシーに依存せず確実に数えるため、ガードの読みだけ service_role で行う
  // （user.id は auth.getUser() 由来のサーバー検証済みの値のみ使用）。
  const guardSvc = createServiceClient();

  // (a) 同一 user × 同一セラピストの pending が既にあれば重複として拒否。
  const { data: dupRows, error: dupErr } = await guardSvc
    .from('therapist_reviews')
    .select('id')
    .eq('therapist_id', therapistId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .limit(1);
  if (dupErr) console.error('submitReview: duplicate check failed:', dupErr.message);
  if (dupRows && dupRows.length > 0) {
    throw new Error('このセラピストへの口コミは審査中です。承認をお待ちください');
  }

  // (b) 同一 user の全投稿は24時間で3件まで（承認済み・却下も投稿実績として数える）。
  const reviewCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRows, error: recentErr } = await guardSvc
    .from('therapist_reviews')
    .select('id')
    .eq('user_id', user.id)
    .gte('created_at', reviewCutoff)
    .limit(3);
  if (recentErr) console.error('submitReview: rate limit check failed:', recentErr.message);
  if (recentRows && recentRows.length >= 3) {
    throw new Error('口コミの投稿は24時間に3件までです。時間をおいて再度お試しください');
  }

  // 同じ authenticated クライアントで insert（service_role 不使用）。
  // user_id はログインユーザーの id、status は送らず DB default 'pending' に任せる。
  const { error } = await supabase.from('therapist_reviews').insert({
    therapist_id: therapistId,
    user_id: user.id,
    rating_service: ratingService,
    rating_technique: ratingTechnique,
    rating_reception: ratingReception,
    visited_on: visitedOn,
    body: text,
  });
  if (error) throw new Error(error.message);

  // 承認前は公開ページに出ないが、整合のため両ページを revalidate。
  revalidateTherapist(therapistId);
  revalidateSalon(salonId);
}

// therapist_id から salon_id を引く（service_role）。見つからなければ null。
async function getSalonIdOfTherapist(
  svc: ReturnType<typeof createServiceClient>,
  therapistId: number,
): Promise<number | null> {
  const { data } = await svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  return data ? ((data.salon_id as number | null) ?? null) : null;
}

// 承認：assertAdmin 通過後に service_role で status='approved' / reviewed_at=now()。
// 承認で公開ページ・店舗集計が変わるため、therapist と salon の両方を revalidate。
export async function approveReview(reviewId: string): Promise<void> {
  await assertModerator();
  const svc = createServiceClient();

  const { data: row, error: selErr } = await svc
    .from('therapist_reviews')
    .select('therapist_id')
    .eq('id', reviewId)
    .single();
  if (selErr || !row) throw new Error('対象の口コミが見つかりません');
  const therapistId = row.therapist_id as number;

  const { error } = await svc
    .from('therapist_reviews')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) throw new Error(error.message);

  // salons のキャッシュ列を最新化してから revalidate（同期後の値を反映させるため）。
  const salonId = await getSalonIdOfTherapist(svc, therapistId);
  if (salonId != null) await syncSalonRating(salonId);
  revalidateTherapist(therapistId);
  if (salonId != null) revalidateSalon(salonId);
}

// 却下：assertAdmin 通過後に service_role で status='rejected' / reviewed_at=now()。
export async function rejectReview(reviewId: string): Promise<void> {
  await assertModerator();
  const svc = createServiceClient();

  const { data: row } = await svc
    .from('therapist_reviews')
    .select('therapist_id')
    .eq('id', reviewId)
    .single();

  const { error } = await svc
    .from('therapist_reviews')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) throw new Error(error.message);

  if (row) {
    const therapistId = row.therapist_id as number;
    const salonId = await getSalonIdOfTherapist(svc, therapistId);
    if (salonId != null) await syncSalonRating(salonId);
    revalidateTherapist(therapistId);
    if (salonId != null) revalidateSalon(salonId);
  }
}

// 削除：assertAdmin 通過後に service_role で該当行を取得（therapist_id を控える）→ delete → revalidate。
// 削除で店舗集計も変わるため salon も revalidate。
export async function deleteReview(reviewId: string): Promise<void> {
  await assertModerator();
  const svc = createServiceClient();

  const { data: row } = await svc
    .from('therapist_reviews')
    .select('therapist_id')
    .eq('id', reviewId)
    .single();

  const { error } = await svc.from('therapist_reviews').delete().eq('id', reviewId);
  if (error) throw new Error(error.message);

  if (row) {
    const therapistId = row.therapist_id as number;
    const salonId = await getSalonIdOfTherapist(svc, therapistId);
    if (salonId != null) await syncSalonRating(salonId);
    revalidateTherapist(therapistId);
    if (salonId != null) revalidateSalon(salonId);
  }
}
