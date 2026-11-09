'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';

// コネックエフ「運営お問い合わせ」（第1868便・2026-11-10・カッキーさん）。
// ★ ベンリーの「お問合せ」と同じ形: 担当者名・連絡先メール・電話・種別・内容。
// ★ 保存先はフクエスの owner_inquiries（運営の「オーナー連絡」にそのまま並ぶ）＋運営へメール（notifyAdmin）。
// ★ 店の解決はコネックエフのほかの画面と同じ（運営が店を選んでいるときはその店）。

export type ConecfInquiryInput = {
  kind: string;
  contactName: string;
  email: string;
  phone: string;
  body: string;
};

const KINDS = ['不具合', '使い方のご質問', 'ご要望', 'その他'];

export async function getConecfInquiryDefaults(): Promise<{ email: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { email: user?.email ?? '' };
}

export async function submitConecfInquiry(input: ConecfInquiryInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const kind = KINDS.includes(input.kind) ? input.kind : 'その他';
  const contactName = String(input.contactName ?? '').trim().slice(0, 50);
  const email = String(input.email ?? '').trim();
  const phone = String(input.phone ?? '').trim().slice(0, 30);
  const body = String(input.body ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: 'ご連絡先メールアドレスを正しく入力してください' };
  if (body.length < 1) return { ok: false, error: 'お問い合わせ内容を入力してください' };
  if (body.length > 4000) return { ok: false, error: 'お問い合わせ内容は4000文字までです' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です。再度ログインしてからお試しください' };
  const svc = createServiceClient();
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, name'), user.id, actingId).limit(1).maybeSingle();
  if (!salon) return { ok: false, error: '店舗情報が見つかりません' };

  const subject = `【コネックエフ】${kind}`;
  const fullBody = [
    `種別: ${kind}`,
    `ご担当者様: ${contactName || '（未入力）'}`,
    `ご連絡先メール: ${email}`,
    `ご連絡先電話: ${phone || '（未入力）'}`,
    '',
    body,
  ].join('\n');

  const { error } = await svc.from('owner_inquiries').insert({ salon_id: salon.id, subject, body: fullBody });
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  await notifyAdmin(`【コネックエフ】運営お問い合わせ・${kind}（${salon.name}）`, [
    `店舗: ${salon.name}（ID: ${salon.id}）`,
    `種別: ${kind}`,
    `ご担当者様: ${contactName || '（未入力）'}`,
    `ご連絡先メール: ${email}`,
    `ご連絡先電話: ${phone || '（未入力）'}`,
    `ログイン: ${user.email ?? '(不明)'}${actingId ? '（運営が操作中）' : ''}`,
    '',
    '─── 内容 ───',
    body,
    '',
    '確認・対応: https://fukues.com/admin →「オーナー連絡」',
  ], { replyTo: email });
  return { ok: true };
}
