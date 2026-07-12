'use server';

import { createClient } from '@/app/lib/supabase/server';
import { notifyAdmin } from '@/app/lib/notifyAdmin';

// オーナー→運営のお問い合わせ送信（/mypage「運営から」タブ）。
// ログインオーナー本人の Supabase セッション（cookie）で INSERT する＝RLS
// （owner_inquiries_insert_owner: 自店舗のみ）が二重防御として効く。
// 送信成立後に運営宛メール通知（notifyAdmin・失敗しても送信自体は成功扱い）。

export type OwnerInquiryInput = {
  subject: string;
  body: string;
};

export async function submitOwnerInquiry(
  input: OwnerInquiryInput,
): Promise<{ ok: boolean; error?: string }> {
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (subject.length < 1 || subject.length > 100) return { ok: false, error: '件名は1〜100文字で入力してください' };
  if (body.length < 1 || body.length > 4000) return { ok: false, error: 'お問い合わせ内容は1〜4000文字で入力してください' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です。再度ログインしてからお試しください' };

  // ログインオーナーの担当サロンを解決（mypage 本体と同じ owner_id 紐付け）。
  const { data: salon } = await supabase
    .from('salons')
    .select('id, name')
    .eq('owner_id', user.id)
    .single();
  if (!salon) return { ok: false, error: 'サロン情報が見つかりません' };

  const { error } = await supabase.from('owner_inquiries').insert({
    salon_id: salon.id,
    subject,
    body,
  });
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  // 運営へメール通知。返信用にオーナーのログインメールを本文へ含める。
  await notifyAdmin(`【フクエス】オーナーお問い合わせ（${salon.name}）`, [
    `店舗: ${salon.name}（ID: ${salon.id}）`,
    `件名: ${subject}`,
    `オーナーメール: ${user.email ?? '(不明)'}`,
    '',
    '─── 内容 ───',
    body,
    '',
    '確認・対応: https://fukues.com/admin →「オーナー連絡」',
  ]);
  return { ok: true };
}
