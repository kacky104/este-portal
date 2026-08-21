'use server';

import crypto from 'node:crypto';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// 写メ日記のメール投稿アドレス（2026-08-21 第27便）。
//
// ベンリー等の更新代行システムに登録する、セラピストごとの投稿用メールアドレスを返す。
// アドレス: d-{token}@diary.fukues.com（token は16桁hexの秘密値）
//
// ⚠ セキュリティ:
//  - トークンを知っていれば誰でもそのセラピストとして日記投稿できる。
//    therapist_diary_mail は anon/authenticated に GRANT していないため、
//    取得経路はこの server action ただ1つ。呼び出しごとにオーナー検証を行う。
//  - therapists テーブルに列を足さないこと（anon SELECT で世界に漏れる）。

export const DIARY_MAIL_DOMAIN = 'diary.fukues.com';

type AddressResult = { ok: true; address: string } | { ok: false; error: string };

/**
 * セラピストの投稿用アドレスを返す（未発行なら発行して返す）。
 * ログイン中のユーザーがそのセラピストの所属サロンのオーナー（または管理者）である場合のみ。
 */
export async function getOrCreateDiaryMailAddress(input: {
  therapistId: string | number;
}): Promise<AddressResult> {
  const therapistId = Number(input.therapistId);
  if (!Number.isFinite(therapistId)) return { ok: false, error: '対象セラピストが不正です' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();

  // セラピスト → 所属サロン → オーナー検証（therapistAdmin.ts の assertOwner と同型）。
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr || !t) return { ok: false, error: 'セラピストが見つかりません' };

  const { data: salon, error: sErr } = await svc
    .from('salons')
    .select('owner_id')
    .eq('id', Number(t.salon_id))
    .maybeSingle();
  if (sErr || !salon) return { ok: false, error: '店舗が見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この店舗の操作権限がありません' };
  }

  // 既存トークンを返す。無ければ発行。
  const { data: existing } = await svc
    .from('therapist_diary_mail')
    .select('token')
    .eq('therapist_id', therapistId)
    .maybeSingle();
  if (existing?.token) {
    return { ok: true, address: `d-${existing.token}@${DIARY_MAIL_DOMAIN}` };
  }

  const token = crypto.randomBytes(8).toString('hex'); // 16桁hex
  const { error: insErr } = await svc
    .from('therapist_diary_mail')
    .insert({ therapist_id: therapistId, token });
  if (insErr) {
    // 同時発行の競合（unique違反）は取り直す。
    const { data: retry } = await svc
      .from('therapist_diary_mail')
      .select('token')
      .eq('therapist_id', therapistId)
      .maybeSingle();
    if (retry?.token) return { ok: true, address: `d-${retry.token}@${DIARY_MAIL_DOMAIN}` };
    return { ok: false, error: `アドレスの発行に失敗しました: ${insErr.message}` };
  }
  return { ok: true, address: `d-${token}@${DIARY_MAIL_DOMAIN}` };
}
