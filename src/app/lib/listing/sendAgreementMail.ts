import { Resend } from 'resend';
import { AGREEMENT_TITLE } from '@/lib/listingAgreement';

// 広告掲載 申込書 兼 誓約書が提出されたときに、店舗様へ送る「受け付けました」のメール（第1177便・2026-10-04・カッキーさん）。
// ★ ねらい: マイページは代表者様のほかにスタッフの方も開く（同じログインを使う）ので、誰かが提出・出し直しをしたら
//   【ログインのメールアドレス】へ知らせる＝代表者様が心当たりのない提出にすぐ気づける。
// ★ 送り先は、記入欄のメールではなく【ログイン中のアカウントのメール】（記入欄は書き換えられるため）。
//   記入欄のメールが別のアドレスなら、そちらにも同じものを送る。
// ★ サインの画像・文面は載せない（控えはマイページで見る）。★ この関数は例外を投げない（提出そのものは取り消さない）。
// ★ 流儀は sendInvoiceMail と同じ（RESEND_API_KEY・send.fukues.com から）。

export type AgreementMailInput = {
  to: string[];             // 送り先（重複・空は中で落とす）
  salonName: string;
  representative: string;
  receiptNo: number;        // 受付番号（listing_agreements.id）
  signedAtLabel: string;    // '2026年10月4日 19:09' の形
  resubmit: boolean;        // 出し直し（前にも提出がある）
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendAgreementMail(input: AgreementMailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY が設定されていません' };
  const to = [...new Set(input.to.map((v) => v.trim()).filter((v) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v)))];
  if (to.length === 0) return { ok: false, error: '送り先のメールアドレスがありません' };
  const url = 'https://fukues.com/mypage/agreement';
  const what = input.resubmit ? '出し直し（再提出）を受け付けました' : '受け付けました';
  const subject = `【フクエス】「${AGREEMENT_TITLE}」を${input.resubmit ? '再提出として' : ''}受け付けました`;
  const warn = '代表者様ご本人が提出されたものでない場合や、お心当たりがない場合は、お手数ですがマイページの「運営事務局」から運営までお知らせください。';
  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.8;max-width:560px">
      <p>${esc(input.salonName)} 様</p>
      <p>いつもフクエスをご利用いただき、ありがとうございます。<br><strong>「${esc(AGREEMENT_TITLE)}」の${esc(what)}。</strong></p>
      <div style="border:1px solid #e2e8f0;padding:16px;margin:16px 0">
        <p style="margin:2px 0">受付番号：${input.receiptNo}</p>
        <p style="margin:2px 0">ご記入日：${esc(input.signedAtLabel)}</p>
        <p style="margin:2px 0">代表者名：${esc(input.representative)}</p>
      </div>
      <p>控えはマイページからご覧いただけます（印刷・PDFで保存もできます）。<br>
        <a href="${url}" style="color:#db2777">${url}</a></p>
      <p style="border:1px solid #fcd34d;background:#fffbeb;padding:10px 12px;color:#92400e">${esc(warn)}</p>
      <p style="font-size:12px;color:#94a3b8">※このメールは送信専用です。</p>
    </div>`;
  const text = [
    `${input.salonName} 様`, '',
    'いつもフクエスをご利用いただき、ありがとうございます。',
    `「${AGREEMENT_TITLE}」の${what}。`, '',
    `受付番号：${input.receiptNo}`,
    `ご記入日：${input.signedAtLabel}`,
    `代表者名：${input.representative}`, '',
    '控えはマイページからご覧いただけます（印刷・PDFで保存もできます）。', url, '',
    warn,
  ].join('\n');
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: 'フクエス運営事務局 <unei@send.fukues.com>', to, subject, html, text });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
