import { Resend } from 'resend';

// ネット予約成立時に店の通知先メール（salons.booking_email）へ送る予約通知メール。
// サーバー専用ヘルパー。**この関数は例外を投げない**（内部で握る）。
// 予約 INSERT はすでに成功しているため、メール送信の失敗が予約成立を巻き戻してはならない。

type BookingMailInput = {
  to: string;                // salons.booking_email
  salonName: string;
  slotLabel: string;         // "7/4(土) 10:00〜11:00"
  therapistName: string;
  courseName: string;
  courseMin: number;
  customerName: string;
  customerTel: string;
  callbackLabel: string;     // "18時〜21時" or "希望なし"
  note: string | null;
};

// メールHTMLに差し込むユーザー入力の簡易エスケープ（XSS/表示崩れ対策）。
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendBookingMail(input: BookingMailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendBookingMail] RESEND_API_KEY 未設定のため送信スキップ');
    return;
  }
  if (!input.to) {
    console.error('[sendBookingMail] 宛先(booking_email)未設定のため送信スキップ');
    return;
  }
  const resend = new Resend(apiKey);

  const subject = `【フクエス】新しいネット予約（${input.salonName}）`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.7;max-width:560px">
      <p>${esc(input.salonName)} 御中</p>
      <p>ネット予約が入りました。お客様へ折り返しお電話にて<strong>ご予約の可否</strong>をお伝えください。</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#db2777">■ 予約内容</p>
        <p style="margin:2px 0">日時：${esc(input.slotLabel)}</p>
        <p style="margin:2px 0">指名：${esc(input.therapistName)}</p>
        <p style="margin:2px 0">コース：${esc(input.courseName)}（${input.courseMin}分）</p>
        <p style="margin:12px 0 8px;font-weight:bold;color:#db2777">■ お客様</p>
        <p style="margin:2px 0">お名前：${esc(input.customerName)}</p>
        <p style="margin:2px 0">電話番号：${esc(input.customerTel)}</p>
        <p style="margin:2px 0">折り返し希望：${esc(input.callbackLabel)}</p>
        ${input.note ? `<p style="margin:2px 0">備考：${esc(input.note)}</p>` : ''}
      </div>
      <p style="font-size:12px;color:#94a3b8">
        ※このメールはネット予約の自動通知です。<br>
        ※予約はまだ確定ではありません。お客様へお電話のうえ確定してください。
      </p>
    </div>
  `;

  const text = [
    `${input.salonName} 御中`,
    ``,
    `ネット予約が入りました。お客様へ折り返しお電話にてご予約の可否をお伝えください。`,
    ``,
    `■ 予約内容`,
    `日時：${input.slotLabel}`,
    `指名：${input.therapistName}`,
    `コース：${input.courseName}（${input.courseMin}分）`,
    ``,
    `■ お客様`,
    `お名前：${input.customerName}`,
    `電話番号：${input.customerTel}`,
    `折り返し希望：${input.callbackLabel}`,
    ...(input.note ? [`備考：${input.note}`] : []),
    ``,
    `※このメールはネット予約の自動通知です。`,
    `※予約はまだ確定ではありません。お客様へお電話のうえ確定してください。`,
  ].join('\n');

  try {
    const { error } = await resend.emails.send({
      from: 'フクエス予約 <yoyaku@send.fukues.com>',
      to: input.to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('[sendBookingMail] Resend送信エラー:', error);
    }
  } catch (e) {
    console.error('[sendBookingMail] 送信例外:', e);
  }
}
