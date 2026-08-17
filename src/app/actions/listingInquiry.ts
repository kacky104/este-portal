'use server';

import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { sendListingAutoReply } from '@/app/lib/listing/sendListingAutoReply';

// 掲載お問い合わせ（/listing の公開フォーム）。未ログインで送信できるため、
// INSERT は service_role で行い、テーブルに公開INSERTポリシーは持たせない（直叩きスパム遮断）。
// honeypot（画面に見えない company 欄）が埋まっていたらボットとみなし、成功を装って静かに捨てる。
//
// 送信成立後に【2通】メールを出す（どちらも失敗しても送信自体は成功扱い）:
//   1. 運営宛の通知（notifyAdmin）
//   2. 店舗様宛の自動返信（sendListingAutoReply・2026-08-17 / 第20便 追加）
//
// ★ メール送信は必ず INSERT のあと。順番を入れ替えないこと。
//   先に送ると、DBに残っていないのに「承りました」というメールだけが届く事故が起きる。
//
// ★ 2通は並行して送る（Promise.all）。直列にすると、運営宛が詰まったぶんだけ
//   店舗様の完了画面が出るのが遅れる。どちらのヘルパーも例外を投げないので
//   Promise.all が reject することはない。

export type ListingInquiryInput = {
  shopName: string;
  area: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  message: string;
  company: string; // honeypot（人間は空のまま送る）
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function submitListingInquiry(
  input: ListingInquiryInput,
): Promise<{ ok: boolean; error?: string }> {
  // honeypot：ボットは隠し欄も埋めがち。成功を装って何もしない（再試行の学習をさせない）。
  if ((input.company ?? '').trim() !== '') return { ok: true };

  const shopName = (input.shopName ?? '').trim();
  const area = (input.area ?? '').trim();
  const contactName = (input.contactName ?? '').trim();
  const email = (input.email ?? '').trim();
  const phone = (input.phone ?? '').trim();
  const website = (input.website ?? '').trim();
  const message = (input.message ?? '').trim();

  if (shopName.length < 1 || shopName.length > 100) return { ok: false, error: '店舗名は1〜100文字で入力してください' };
  if (area.length < 1 || area.length > 100) return { ok: false, error: '所在エリアは1〜100文字で入力してください' };
  if (contactName.length < 1 || contactName.length > 50) return { ok: false, error: 'ご担当者名は1〜50文字で入力してください' };
  if (!isValidEmail(email) || email.length > 200) return { ok: false, error: 'メールアドレスの形式が正しくありません' };
  if (phone.length > 30) return { ok: false, error: '電話番号は30文字以内で入力してください' };
  if (website.length > 300) return { ok: false, error: 'ホームページURLは300文字以内で入力してください' };
  if (message.length > 2000) return { ok: false, error: 'メッセージは2000文字以内で入力してください' };

  const svc = createServiceClient();
  const { error } = await svc.from('listing_inquiries').insert({
    shop_name: shopName,
    area,
    contact_name: contactName,
    email,
    phone: phone || null,
    website: website || null,
    message: message || null,
  });
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  await Promise.all([
    // 1) 運営宛の通知。
    //    ★ replyTo に店舗様のアドレスを渡している（2026-08-17 / 第20便）。
    //      この通知で「返信」を押すだけで、そのまま店舗様への返事になる。
    //      「2営業日以内にご連絡」と約束したので、この一手間を省くのが効く。
    notifyAdmin('【フクエス】掲載のお問い合わせ', [
      `店舗名: ${shopName}`,
      `所在エリア: ${area}`,
      `ご担当者名: ${contactName}`,
      `メール: ${email}`,
      `電話: ${phone || '(未記入)'}`,
      `ホームページ: ${website || '(未記入)'}`,
      '',
      '─── メッセージ ───',
      message || '(なし)',
    ], { replyTo: email }),
    // 2) 店舗様宛の自動返信（送信内容の控え＋返信の目安）。
    //    ★ 宛先の打ち間違いはここでバウンスし、/admin の「配信トラブル」に出る
    //      （Resend Webhook は店舗と紐づかない宛先も email_events に記録するため）。
    sendListingAutoReply({
      to: email,
      shopName,
      area,
      contactName,
      phone,
      website,
      message,
    }),
  ]);
  return { ok: true };
}
