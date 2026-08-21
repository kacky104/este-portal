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

/**
 * 送信結果。2026-08-16 に void から変更した。
 *
 * ★ 予約通知の呼び出し側（createBooking）は、この戻り値を【使わない】こと。
 *   予約はすでに INSERT 済みで、メールの失敗で巻き戻してはいけない（従来どおりの方針）。
 * ★ 戻り値を足したのは、ネット予約設定タブの【テスト送信】ボタンへ成否を返すため。
 *
 * ※ ok:true でも「届いた」ことまでは保証しない。Resend が受け付けた、までしか分からない。
 *   宛先の打ち間違いによるバウンスは後から非同期で起きる（2026-08-16 に実機で確認済み。
 *   Resend のログには Bounced が残るが、アプリ側には何も返ってこない）。
 */
export type SendMailResult = { ok: true } | { ok: false; error: string };

export async function sendBookingMail(input: BookingMailInput): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendBookingMail] RESEND_API_KEY 未設定のため送信スキップ');
    return { ok: false, error: 'RESEND_API_KEY が設定されていません（運営にお問い合わせください）' };
  }
  if (!input.to) {
    console.error('[sendBookingMail] 宛先(booking_email)未設定のため送信スキップ');
    return { ok: false, error: '通知先メールアドレスが未設定です' };
  }
  const resend = new Resend(apiKey);

  const subject = `【フクエス】新しいネット予約（${input.salonName}）`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.7;max-width:560px">
      <p>${esc(input.salonName)} 御中</p>
      <p>ネット予約が入りました。お客様へお電話またはSMSにて<strong>ご予約の可否</strong>をお伝えください。</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#db2777">■ 予約内容</p>
        <p style="margin:2px 0">日時：${esc(input.slotLabel)}</p>
        <p style="margin:2px 0">指名：${esc(input.therapistName)}</p>
        <p style="margin:2px 0">コース：${esc(input.courseName)}（${input.courseMin}分）</p>
        <p style="margin:12px 0 8px;font-weight:bold;color:#db2777">■ お客様</p>
        <p style="margin:2px 0">お名前：${esc(input.customerName)}</p>
        <p style="margin:2px 0">電話番号：${esc(input.customerTel)}</p>
        <p style="margin:2px 0">ご連絡希望：${esc(input.callbackLabel)}</p>
        ${input.note ? `<p style="margin:2px 0">備考：${esc(input.note)}</p>` : ''}
      </div>
      <p style="font-size:12px;color:#94a3b8">
        ※このメールはネット予約の自動通知です。<br>
        ※予約はまだ確定ではありません。お客様へご連絡のうえ確定してください。
      </p>
    </div>
  `;

  const text = [
    `${input.salonName} 御中`,
    ``,
    `ネット予約が入りました。お客様へお電話またはSMSにてご予約の可否をお伝えください。`,
    ``,
    `■ 予約内容`,
    `日時：${input.slotLabel}`,
    `指名：${input.therapistName}`,
    `コース：${input.courseName}（${input.courseMin}分）`,
    ``,
    `■ お客様`,
    `お名前：${input.customerName}`,
    `電話番号：${input.customerTel}`,
    `ご連絡希望：${input.callbackLabel}`,
    ...(input.note ? [`備考：${input.note}`] : []),
    ``,
    `※このメールはネット予約の自動通知です。`,
    `※予約はまだ確定ではありません。お客様へご連絡のうえ確定してください。`,
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
      return { ok: false, error: error.message ?? '送信に失敗しました' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[sendBookingMail] 送信例外:', e);
    return { ok: false, error: e instanceof Error ? e.message : '送信に失敗しました' };
  }
}

/**
 * 通知先メールの疎通確認用テストメール（2026-08-16 追加）。
 *
 * ★ 本物の予約通知と【絶対に見分けがつく】文面にすること。
 *   お店が本物の予約と勘違いして、存在しないお客様へ折り返し電話をかけてしまう。
 *   件名の先頭に「テスト送信」を入れ、お客様の氏名・電話は一切載せない。
 * ★ 予約通知のテンプレート（上の sendBookingMail）とは別物にしてある。
 *   条件分岐で共用すると、本番の文面を触ったときにテスト側が壊れる（またはその逆）。
 */
export async function sendBookingTestMail(input: { to: string; salonName: string }): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendBookingTestMail] RESEND_API_KEY 未設定のため送信スキップ');
    return { ok: false, error: 'RESEND_API_KEY が設定されていません（運営にお問い合わせください）' };
  }
  if (!input.to) return { ok: false, error: '通知先メールアドレスが未設定です' };

  const resend = new Resend(apiKey);
  const subject = `【フクエス】テスト送信（${input.salonName}）`;
  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.7;max-width:560px">
      <p style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin:0 0 16px">
        <strong>これはテスト送信です。実際の予約ではありません。</strong>
      </p>
      <p>${esc(input.salonName)} 御中</p>
      <p>
        ネット予約の通知先メールアドレスの確認のため、フクエスの管理画面から送信されたテストメールです。<br>
        このメールが届いていれば、予約通知は正しくこのアドレスへ届きます。
      </p>
      <p style="font-size:12px;color:#94a3b8">
        ※お客様の情報は含まれていません。折り返しのお電話は不要です。<br>
        ※心当たりがない場合は、このメールを破棄してください。
      </p>
    </div>
  `;
  const text = [
    '【これはテスト送信です。実際の予約ではありません】',
    '',
    `${input.salonName} 御中`,
    '',
    'ネット予約の通知先メールアドレスの確認のため、フクエスの管理画面から送信されたテストメールです。',
    'このメールが届いていれば、予約通知は正しくこのアドレスへ届きます。',
    '',
    '※お客様の情報は含まれていません。折り返しのお電話は不要です。',
    '※心当たりがない場合は、このメールを破棄してください。',
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
      console.error('[sendBookingTestMail] Resend送信エラー:', error);
      return { ok: false, error: error.message ?? '送信に失敗しました' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[sendBookingTestMail] 送信例外:', e);
    return { ok: false, error: e instanceof Error ? e.message : '送信に失敗しました' };
  }
}
