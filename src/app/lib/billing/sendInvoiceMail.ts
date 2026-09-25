import { Resend } from 'resend';
import { dateLabel, monthLabel, yen } from '@/lib/billing';

// 請求書を発行したときに店舗様へ送るお知らせメール（第816便）。
// ★ PDF は添付しない。★ マイページの請求書の画面（ログインが要る）へのリンクを送る。
// ★ この関数は例外を投げない（発行そのものは取り消さない）。成否だけ返す。
// ★ 第832便（カッキーさん）: 件名と1行目に「◯月分のご請求を発行しました。◯月◯日までにお支払いをお願いします」。
//   ＋ sendOverdueMail（お支払い期限を過ぎています・事務員さんが管理画面で押して送る）

export type InvoiceMailInput = {
  to: string;
  recipientName: string;
  billingMonth: string;   // 'YYYY-MM-01'
  invoiceNo: string;
  total: number;
  dueDate: string;        // 'YYYY-MM-DD'
  invoiceId: number;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendInvoiceMail(input: InvoiceMailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY が設定されていません' };
  if (!input.to) return { ok: false, error: '送り先のメールアドレスがありません' };
  const url = `https://fukues.com/mypage/invoices/${input.invoiceId}`;
  const due = dateLabel(input.dueDate).replace(/^\d+年/, '');
  const subject = `【フクエス】${monthLabel(input.billingMonth)}のご請求を発行しました（お支払い期限 ${due}）`;
  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.8;max-width:560px">
      <p>${esc(input.recipientName)} 様</p>
      <p>いつもフクエスをご利用いただき、ありがとうございます。<br><strong>${esc(monthLabel(input.billingMonth))}のご請求を発行しました。${esc(due)}までにお支払いをお願いします。</strong></p>
      <div style="border:1px solid #e2e8f0;padding:16px;margin:16px 0">
        <p style="margin:2px 0">請求番号：${esc(input.invoiceNo)}</p>
        <p style="margin:2px 0">ご請求金額：<strong>${yen(input.total)}円</strong>（税込）</p>
        <p style="margin:2px 0">お支払い期限：${esc(dateLabel(input.dueDate))}</p>
      </div>
      <p>ご請求書はマイページからご覧いただけます（印刷・PDFで保存もできます）。<br>
        <a href="${url}" style="color:#db2777">${url}</a></p>
      <p style="font-size:12px;color:#94a3b8">※このメールは送信専用です。ご不明な点はマイページの運営事務局からお問い合わせください。</p>
    </div>`;
  const text = [
    `${input.recipientName} 様`, '',
    'いつもフクエスをご利用いただき、ありがとうございます。',
    `${monthLabel(input.billingMonth)}のご請求を発行しました。${due}までにお支払いをお願いします。`, '',
    `請求番号：${input.invoiceNo}`,
    `ご請求金額：${yen(input.total)}円（税込）`,
    `お支払い期限：${dateLabel(input.dueDate)}`, '',
    'ご請求書はマイページからご覧いただけます（印刷・PDFで保存もできます）。', url,
  ].join('\n');
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: 'フクエス運営事務局 <unei@send.fukues.com>', to: input.to, subject, html, text });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── お支払い期限を過ぎています（第832便）────────────────
//   ★ 自動では送らない。管理画面「② 入金待ち」で事務員さんが押したときだけ。★ 行き違いの一言を必ず入れる。
export async function sendOverdueMail(input: InvoiceMailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY が設定されていません' };
  if (!input.to) return { ok: false, error: '送り先のメールアドレスがありません' };
  const url = `https://fukues.com/mypage/invoices/${input.invoiceId}`;
  const due = dateLabel(input.dueDate).replace(/^\d+年/, '');
  const subject = `【フクエス】${monthLabel(input.billingMonth)}のご請求 お支払い期限（${due}）を過ぎております`;
  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.8;max-width:560px">
      <p>${esc(input.recipientName)} 様</p>
      <p>いつもフクエスをご利用いただき、ありがとうございます。</p>
      <p>${esc(monthLabel(input.billingMonth))}のご請求について、お支払い期限（${esc(due)}）を過ぎておりますが、まだご入金の確認ができておりません。<br>
        お手数ですが、ご確認のうえお振込みをお願いいたします。</p>
      <div style="border:1px solid #e2e8f0;padding:16px;margin:16px 0">
        <p style="margin:2px 0">請求番号：${esc(input.invoiceNo)}</p>
        <p style="margin:2px 0">ご請求金額：<strong>${yen(input.total)}円</strong>（税込）</p>
        <p style="margin:2px 0">お支払い期限：${esc(dateLabel(input.dueDate))}</p>
      </div>
      <p>ご請求書と振込先はマイページからご覧いただけます。<br>
        <a href="${url}" style="color:#db2777">${url}</a></p>
      <p>※すでにお振込み済みの場合は、行き違いですのでご容赦ください。</p>
      <p style="font-size:12px;color:#94a3b8">※このメールは送信専用です。ご不明な点はマイページの運営事務局からお問い合わせください。</p>
    </div>`;
  const text = [
    `${input.recipientName} 様`, '',
    'いつもフクエスをご利用いただき、ありがとうございます。', '',
    `${monthLabel(input.billingMonth)}のご請求について、お支払い期限（${due}）を過ぎておりますが、まだご入金の確認ができておりません。`,
    'お手数ですが、ご確認のうえお振込みをお願いいたします。', '',
    `請求番号：${input.invoiceNo}`,
    `ご請求金額：${yen(input.total)}円（税込）`,
    `お支払い期限：${dateLabel(input.dueDate)}`, '',
    'ご請求書と振込先はマイページからご覧いただけます。', url, '',
    '※すでにお振込み済みの場合は、行き違いですのでご容赦ください。',
  ].join('\n');
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: 'フクエス運営事務局 <unei@send.fukues.com>', to: input.to, subject, html, text });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
