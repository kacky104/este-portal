'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// 口コミ（therapist_reviews）の Server Actions。
//
// ★ 認可・クライアント使い分けの厳守ルール（最重要）
// - 投稿（submitReview）は service_role を絶対に使わない。ユーザーのセッション付き authenticated
//   クライアント（server/cookie版 createClient）で insert する。これで RLS が効き、なりすまし・
//   status='approved' の直接挿入が DB 層で防がれる。
// - 承認・却下・削除だけ service_role（createServiceClient）を使う。その前に必ず assertAdmin で
//   管理者本人であることを検証してから実行する（assertAdmin を通過した場合のみ service_role を触る）。

// /therapist/[id] の ISR キャッシュを即時更新する小ヘルパー。
function revalidateTherapist(therapistId: number | string): void {
  revalidatePath(`/therapist/${therapistId}`);
}

// ログインユーザーが管理者本人かをサーバー側で検証（VIPレターの assertOwner の管理者版）。
// 通過しなければ throw し、以降の service_role 操作には絶対に到達させない。
async function assertAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインが必要です');
  if (user.id !== ADMIN_UUID) throw new Error('管理者権限がありません');
  return user.id;
}

// rating が 0.5刻みで 0.5〜5.0 か。
function isValidRating(r: number): boolean {
  return Number.isFinite(r) && r >= 0.5 && r <= 5.0 && Math.round(r * 2) === r * 2;
}

// 口コミを投稿（会員本人・authenticated クライアントで insert・status は DB default 'pending'）。
// 未ログイン/バリデーションNG は throw（クライアント側で誘導・検証済みだが二重防御）。
export async function submitReview({
  therapistId,
  rating,
  body,
}: {
  therapistId: number;
  rating: number;
  body: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('口コミの投稿にはログインが必要です');

  if (!Number.isFinite(therapistId)) throw new Error('対象のセラピストが不正です');
  if (!isValidRating(rating)) throw new Error('評価は0.5〜5.0の0.5刻みで選んでください');
  const text = (body ?? '').trim();
  if (text.length < 1 || text.length > 2000) {
    throw new Error('本文は1〜2000文字で入力してください');
  }

  // 同じ authenticated クライアントで insert（service_role は使わない）。
  // user_id はログインユーザーの id、status は送らず DB default 'pending' に任せる。
  const { error } = await supabase.from('therapist_reviews').insert({
    therapist_id: therapistId,
    user_id: user.id,
    rating,
    body: text,
  });
  if (error) throw new Error(error.message);

  // 承認前は公開ページに出ないため必須ではないが、整合のため呼ぶ。
  revalidateTherapist(therapistId);
}

// 承認：assertAdmin 通過後に service_role で status='approved' / reviewed_at=now() に更新し、
// 公開ページを revalidate（承認で反映させるため therapist_id を取得してから無効化）。
export async function approveReview(reviewId: string): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();

  const { data: row, error: selErr } = await svc
    .from('therapist_reviews')
    .select('therapist_id')
    .eq('id', reviewId)
    .single();
  if (selErr || !row) throw new Error('対象の口コミが見つかりません');

  const { error } = await svc
    .from('therapist_reviews')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) throw new Error(error.message);

  revalidateTherapist(row.therapist_id as number);
}

// 却下：assertAdmin 通過後に service_role で status='rejected' / reviewed_at=now() に更新。
// 出ていないものが消えるだけだが整合のため revalidate してよい。
export async function rejectReview(reviewId: string): Promise<void> {
  await assertAdmin();
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

  if (row) revalidateTherapist(row.therapist_id as number);
}

// 削除：assertAdmin 通過後に service_role で該当行を取得（therapist_id を控える）→ delete → revalidate。
export async function deleteReview(reviewId: string): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();

  const { data: row } = await svc
    .from('therapist_reviews')
    .select('therapist_id')
    .eq('id', reviewId)
    .single();

  const { error } = await svc.from('therapist_reviews').delete().eq('id', reviewId);
  if (error) throw new Error(error.message);

  if (row) revalidateTherapist(row.therapist_id as number);
}
