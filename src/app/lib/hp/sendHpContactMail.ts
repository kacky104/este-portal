import { Resend } from 'resend';
import { hpContactSubjectLabel } from '@/app/lib/hp/contact';

// 公式ホームページ（フクエスサイト）のお問い合わせフォームから、店舗の通知先へ送るメール（第1717便・2026-11-02）。
// sendApplicationMail.ts（求人応募）と同じ作法のサーバー専用ヘルパー。
//
// ★ 例外を投げない。hp_contacts への INSERT はすでに成功しているので、メールの失敗で送信成立を巻き戻さない。
//   代わりにエラー文を返す（呼び出し側が hp_contacts.mail_error に書く）。
// ★ お客様への自動返信は送らない（カッキーさん 2026-11-02）。送った人には画面の完了表示だけ。
// ★ replyTo＝お客様のアドレス。店舗が届いたメールで「返信」を押せばそのまま返事になる。

type HpContactMailInput = {
  to: string;
  salonName: string;
  name: string;
  email: string;
  tel: string | null;
  subject: string; // HpContactSubject
  body: string;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sentAtLabelJST(d: Date): string {
  const date = d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

/** 送れたら null、送れなかったら理由の文字列（例外は握る） */
export async function sendHpContactMail(input: HpContactMailInput): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendHpContactMail] RESEND_API_KEY 未設定のため送信スキップ');
    return 'RESEND_API_KEY 未設定';
  }
  if (!input.to) return '通知先メール未設定';

  const resend = new Resend(apiKey);
  const subjectLabel = hpContactSubjectLabel(input.subject);
  const sentAt = sentAtLabelJST(new Date());
  const mailSubject = `【${input.salonName}】ホームページからお問い合わせ（${subjectLabel}）`;

  const rows: [string, string][] = [
    ['お名前', input.name],
    ['メールアドレス', input.email],
    ['電話番号', input.tel ?? '（未記入）'],
    ['用件', subjectLabel],
    ['受信日時', sentAt],
  ];

  const html = [
    `<div style="font-family:sans-serif;font-size:14px;line-height:1.8;color:#333;">`,
    `<p>${esc(input.salonName)} の公式ホームページのお問い合わせフォームから、新しいお問い合わせが届きました。</p>`,
    `<p>このメールに「返信」すると、お客様（${esc(input.email)}）への返事になります。</p>`,
    `<table style="border-collapse:collapse;margin:12px 0;">`,
    ...rows.map(([k, v]) =>
      `<tr><th style="text-align:left;padding:6px 12px 6px 0;white-space:nowrap;color:#666;font-weight:normal;">${esc(k)}</th><td style="padding:6px 0;">${esc(v)}</td></tr>`),
    `</table>`,
    `<p style="margin:0 0 4px;color:#666;">お問い合わせ内容</p>`,
    `<div style="white-space:pre-wrap;border:1px solid #ddd;padding:12px;background:#fafafa;">${esc(input.body)}</div>`,
    `<p style="margin-top:20px;font-size:12px;color:#888;">※ 本メールはフクエスサイト（公式ホームページ）のお問い合わせフォームから自動送信されています。通知先の変更は ホームページ管理 → お問い合わせ から行えます。</p>`,
    `</div>`,
  ].join('\n');

  const text = [
    `${input.salonName} の公式ホームページのお問い合わせフォームから、新しいお問い合わせが届きました。`,
    `このメールに「返信」すると、お客様（${input.email}）への返事になります。`,
    ``,
    ...rows.map(([k, v]) => `${k}：${v}`),
    ``,
    `─── お問い合わせ内容 ───`,
    input.body,
    ``,
    `※ 本メールはフクエスサイト（公式ホームページ）のお問い合わせフォームから自動送信されています。`,
  ].join('\n');

  try {
    const { error } = await resend.emails.send({
      from: `${input.salonName.replace(/[<>]/g, '')} <contact@send.fukues.com>`,
      to: input.to,
      replyTo: input.email,
      subject: mailSubject,
      html,
      text,
    });
    if (error) {
      console.error('[sendHpContactMail] Resend送信エラー:', error);
      return String((error as { message?: string }).message ?? error);
    }
    return null;
  } catch (e) {
    console.error('[sendHpContactMail] 送信例外:', e);
    return e instanceof Error ? e.message : String(e);
  }
}
