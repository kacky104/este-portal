'use server';

import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { HP_TEMPLATES, HP_COLOR_VARIANTS, isHpTemplateKey } from '@/app/lib/hpSite';
import { isHpListingStatus, hpListingStatusLabel } from '@/app/lib/hp/inquiryStatus';

// 公式ホームページ制作の【お申し込み・お問い合わせ】（/hp/templates/contact の公開フォーム）。
//
// 作りは listing_inquiries（/listing の掲載お問い合わせ）とまったく同じ:
//   ・未ログインで送信できるため INSERT は service_role で行い、
//     テーブルに公開INSERTポリシーは持たせない（PostgREST直叩きのスパム遮断）
//   ・honeypot（画面に見えない company 欄）が埋まっていたらボットとみなし、
//     成功を装って静かに捨てる（再試行の学習をさせない）
//   ・送信成立後に運営宛メール通知（notifyAdmin は例外を投げない＝
//     通知が失敗しても送信自体は成功扱いのまま。保存は済んでいる）
//
// ★ 希望デザイン（ひな形＋カラー）は「申し込み時点の希望」の記録。
//   不正な組み合わせはここで弾いて null に落とす（DB側にCHECKは置いていない。
//   HP_COLOR_VARIANTS は今後も増減するので、DBで縛ると過去データが読めなくなるため）。

export type HpInquiryInput = {
  shopName: string;
  contactName: string;
  email: string;
  phone: string;
  listingStatus: string;
  templateKey: string;
  colorKey: string;
  note: string;
  company: string; // honeypot（人間は空のまま送る）
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function templateLabel(key: string): string {
  return HP_TEMPLATES.find((t) => t.key === key)?.label ?? key;
}

function colorLabel(templateKey: string, colorKey: string): string {
  if (!isHpTemplateKey(templateKey)) return colorKey;
  return HP_COLOR_VARIANTS[templateKey].find((v) => v.key === colorKey)?.label ?? colorKey;
}

export async function submitHpInquiry(
  input: HpInquiryInput,
): Promise<{ ok: boolean; error?: string }> {
  // honeypot：ボットは隠し欄も埋めがち。成功を装って何もしない。
  if ((input.company ?? '').trim() !== '') return { ok: true };

  const shopName = (input.shopName ?? '').trim();
  const contactName = (input.contactName ?? '').trim();
  const email = (input.email ?? '').trim();
  const phone = (input.phone ?? '').trim();
  const listingStatus = (input.listingStatus ?? '').trim();
  const note = (input.note ?? '').trim();

  if (shopName.length < 1 || shopName.length > 100) return { ok: false, error: '店舗名は1〜100文字で入力してください' };
  if (contactName.length < 1 || contactName.length > 50) return { ok: false, error: 'ご担当者名は1〜50文字で入力してください' };
  if (!isValidEmail(email) || email.length > 200) return { ok: false, error: 'メールアドレスの形式が正しくありません' };
  if (phone.length > 30) return { ok: false, error: '電話番号は30文字以内で入力してください' };
  if (!isHpListingStatus(listingStatus)) return { ok: false, error: 'フクエスの掲載状況を選んでください' };
  if (note.length > 2000) return { ok: false, error: '備考は2000文字以内で入力してください' };

  // 希望デザインは任意。ひな形と色がそろって正しいときだけ記録する。
  // 片方だけ・不正なキーは「未選択」と同じ扱いにして落とす（保存を止めない）。
  const rawTemplate = (input.templateKey ?? '').trim();
  const rawColor = (input.colorKey ?? '').trim();
  let templateKey: string | null = null;
  let colorKey: string | null = null;
  if (isHpTemplateKey(rawTemplate)) {
    templateKey = rawTemplate;
    if (HP_COLOR_VARIANTS[rawTemplate].some((v) => v.key === rawColor)) colorKey = rawColor;
  }

  const svc = createServiceClient();
  const { error } = await svc.from('hp_inquiries').insert({
    shop_name: shopName,
    contact_name: contactName,
    email,
    phone: phone || null,
    listing_status: listingStatus,
    template_key: templateKey,
    color_key: colorKey,
    note: note || null,
  });
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  const design = templateKey
    ? `${templateLabel(templateKey)}${colorKey ? `／${colorLabel(templateKey, colorKey)}` : '（カラー未選択）'}`
    : '(未選択)';

  await notifyAdmin('【フクエス】ホームページ制作のお申し込み', [
    `店舗名: ${shopName}`,
    `ご担当者名: ${contactName}`,
    `メール: ${email}`,
    `電話: ${phone || '(未記入)'}`,
    `フクエス掲載状況: ${hpListingStatusLabel(listingStatus)}`,
    `希望デザイン: ${design}`,
    '',
    '─── 備考 ───',
    note || '(なし)',
  ]);
  return { ok: true };
}
