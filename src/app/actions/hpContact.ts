'use server';

import { createServiceClient } from '@/app/lib/supabase/service';
import { hpSiteKeyColumn, normalizeHpSiteKey, sanitizeHpBlocks } from '@/app/lib/hpSite';
import { isHpContactSubject, MAX_HP_CONTACT_BODY_LEN } from '@/app/lib/hp/contact';
import { sendHpContactMail } from '@/app/lib/hp/sendHpContactMail';

// 公式ホームページ（フクエスサイト）の【お問い合わせフォーム】の送信（第1717便・2026-11-02・カッキーさん）。
//
// 作りは hpInquiry.ts（HP制作のお申し込み）と同じ:
//   ・未ログインで送信できるため INSERT は service_role で行い、hp_contacts に公開ポリシーは持たせない
//   ・honeypot（画面に見えない company 欄）が埋まっていたらボットとみなし、成功を装って静かに捨てる
//   ・保存が成功してからメール（sendHpContactMail は例外を投げない。失敗は hp_contacts.mail_error に残す）
//
// ★ 通知先（salon_sites.contact_email）は anon に grant していない列。ここ（service_role）でだけ読む。
// ★ 公開中（status=live）で blocks.contact.on のサイトだけ受け付ける（URL 直叩きで OFF の店へ送れないように）。

export type HpContactInput = {
  siteKey: string;   // /hp/{slug} の slug か独自ドメイン
  name: string;
  email: string;
  emailConfirm: string;
  tel: string;
  subject: string;
  body: string;
  company: string;   // honeypot（人間は空のまま送る）
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function submitHpContact(input: HpContactInput): Promise<{ ok: boolean; error?: string }> {
  if ((input.company ?? '').trim() !== '') return { ok: true };

  const key = normalizeHpSiteKey(input.siteKey ?? '');
  if (!key) return { ok: false, error: '送信先のサイトが見つかりません' };

  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim();
  const emailConfirm = (input.emailConfirm ?? '').trim();
  const tel = (input.tel ?? '').trim();
  const subject = (input.subject ?? '').trim();
  const body = (input.body ?? '').trim();

  if (name.length < 1 || name.length > 50) return { ok: false, error: 'お名前は1〜50文字で入力してください' };
  if (!isValidEmail(email) || email.length > 200) return { ok: false, error: 'メールアドレスの形式が正しくありません' };
  if (email !== emailConfirm) return { ok: false, error: 'メールアドレス（確認用）が一致しません' };
  if (tel !== '' && !/^[0-9+\-() ]{8,20}$/.test(tel)) return { ok: false, error: '電話番号は数字で入力してください（ハイフンなしでも可）' };
  if (!isHpContactSubject(subject)) return { ok: false, error: 'お問い合わせ内容（用件）を選んでください' };
  if (body.length < 1 || body.length > MAX_HP_CONTACT_BODY_LEN) {
    return { ok: false, error: `お問い合わせ内容は1〜${MAX_HP_CONTACT_BODY_LEN}文字で入力してください` };
  }

  const svc = createServiceClient();
  const { data: site, error: siteErr } = await svc
    .from('salon_sites')
    .select('salon_id, status, blocks, contact_email')
    .eq(hpSiteKeyColumn(key), key)
    .maybeSingle();
  if (siteErr || !site) return { ok: false, error: '送信先のサイトが見つかりません' };

  const blocks = sanitizeHpBlocks(site.blocks);
  const to = ((site.contact_email as string | null) ?? '').trim();
  if (site.status !== 'live' || !blocks.contact.on || to === '') {
    return { ok: false, error: 'このサイトでは現在お問い合わせを受け付けていません' };
  }
  const salonId = Number(site.salon_id);

  const { data: salon } = await svc.from('salons').select('name').eq('id', salonId).maybeSingle();
  const salonName = ((salon?.name as string | null) ?? '').trim() || '公式ホームページ';

  const { data: inserted, error: insErr } = await svc
    .from('hp_contacts')
    .insert({
      salon_id: salonId,
      name,
      email,
      tel: tel || null,
      subject,
      body,
      sent_to: to,
    })
    .select('id')
    .maybeSingle();
  if (insErr) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  const mailError = await sendHpContactMail({
    to,
    salonName,
    name,
    email,
    tel: tel || null,
    subject,
    body,
  });
  if (mailError && inserted?.id != null) {
    await svc.from('hp_contacts').update({ mail_error: mailError.slice(0, 500) }).eq('id', inserted.id);
  }
  // ★ メールが失敗しても控えは残っているので、お客様には成功として返す（再送で二重になるのを防ぐ）。
  return { ok: true };
}
