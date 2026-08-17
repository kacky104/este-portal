import { Resend } from 'resend';

// /listing の掲載お問い合わせフォームを送信した店舗様へ返す【自動返信メール】
// （2026-08-17 / 第20便 追加）。
//
// ★ なぜ入れたか。それまでフォーム送信で飛ぶのは運営宛の通知だけで、
//   送った店舗様の手元には何も残らなかった。完了画面は「担当より折り返しご連絡いたします」と
//   出るだけなので、送信できたのかどうかを確かめる手段が無く、しかも
//   【メールアドレスを打ち間違えていても誰も気づけない】状態だった。
//
// ★ 第19便のバウンス検知と組み合わさる。Resend の Webhook は宛先が
//   salons.booking_email と一致しなくても email_events に記録する（salon_id が null になるだけ）。
//   つまりこの自動返信が不達なら /admin の「配信トラブル」に未対応で出る。
//   ＝ 自動返信は「相手のメールアドレスが生きているかの確認」も兼ねている。
//
// ★ 既存の sendBookingMail / notifyAdmin と同じ流儀:
//   - 認証済みドメイン send.fukues.com から送信（RESEND_API_KEY）
//   - **この関数は例外を投げない**（内部で握る）。
//     listing_inquiries への INSERT はすでに成功しているので、
//     メールの失敗でお問い合わせ自体を失敗にしてはいけない。
//
// ★ 差出人は送信実績のある unei@send.fukues.com。表示名だけ「フクエス運営事務局」にしている。
//   ★ replyTo は info@fukues.com（実際に受信できる箱）。
//     これが無いと、店舗様が「返信」を押したときに送信専用の
//     unei@send.fukues.com 宛になり、返事が誰にも届かない。
//
// ★ 本文には送信内容の控えを載せている。相手が自分で入力して自分の箱に届くだけなので
//   新たな情報漏れにはならず、「何を送ったか」の記録として役に立つ。

type ListingAutoReplyInput = {
  to: string;          // 店舗様が入力したメールアドレス
  shopName: string;
  area: string;
  contactName: string;
  phone: string;       // 未記入なら空文字
  website: string;     // 未記入なら空文字
  message: string;     // 未記入なら空文字
};

// メールHTMLに差し込むユーザー入力の簡易エスケープ（sendBookingMail と同じ）。
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 返信の目安。★ 変えるときは ListingInquiryForm の完了画面の文言も一緒に直すこと。 */
const REPLY_LEAD_TIME = '2営業日以内';

export async function sendListingAutoReply(input: ListingAutoReplyInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendListingAutoReply] RESEND_API_KEY 未設定のため送信スキップ');
    return;
  }
  if (!input.to) {
    console.error('[sendListingAutoReply] 宛先が空のため送信スキップ');
    return;
  }

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#94a3b8;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:6px 0;color:#334155">${esc(value) || '(未記入)'}</td>
    </tr>`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.7;max-width:560px">
      <p>${esc(input.shopName)}<br>${esc(input.contactName)} 様</p>

      <p>このたびはフクエスへの掲載についてお問い合わせいただき、誠にありがとうございます。<br>
      下記の内容でお問い合わせを承りました。</p>

      <p><strong>担当より${REPLY_LEAD_TIME}にご連絡いたします。</strong>今しばらくお待ちください。</p>

      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#db2777">■ お問い合わせ内容</p>
        <table style="border-collapse:collapse;font-size:14px">
          ${row('店舗名', input.shopName)}
          ${row('所在エリア', input.area)}
          ${row('ご担当者名', input.contactName)}
          ${row('メールアドレス', input.to)}
          ${row('電話番号', input.phone)}
          ${row('ホームページ', input.website)}
        </table>
        ${
          input.message
            ? `<p style="margin:12px 0 4px;color:#94a3b8;font-size:14px">ご質問・メッセージ</p>
               <p style="margin:0;white-space:pre-wrap;font-size:14px">${esc(input.message)}</p>`
            : ''
        }
      </div>

      <p style="font-size:14px">掲載内容・料金の詳細は、掲載店舗募集のご案内（PDF）でもご確認いただけます。<br>
      <a href="https://fukues.com/listing" style="color:#db2777">https://fukues.com/listing</a></p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
      <p style="font-size:12px;color:#94a3b8;line-height:1.8">
        このメールは送信内容の控えとして自動でお送りしています。<br>
        お心当たりのない場合はお手数ですが破棄してください。<br>
        ご返信いただく場合は、このメールにそのままご返信ください（info@fukues.com に届きます）。
      </p>
      <p style="font-size:12px;color:#94a3b8">
        福岡メンズエステポータル フクエス 運営事務局<br>
        <a href="https://fukues.com" style="color:#94a3b8">https://fukues.com</a>
      </p>
    </div>`;

  // HTMLを読めない環境向けのテキスト版。Resend は両方渡すと自動で multipart にする。
  const text = [
    `${input.shopName}`,
    `${input.contactName} 様`,
    '',
    'このたびはフクエスへの掲載についてお問い合わせいただき、誠にありがとうございます。',
    '下記の内容でお問い合わせを承りました。',
    '',
    `担当より${REPLY_LEAD_TIME}にご連絡いたします。今しばらくお待ちください。`,
    '',
    '─── お問い合わせ内容 ───',
    `店舗名: ${input.shopName}`,
    `所在エリア: ${input.area}`,
    `ご担当者名: ${input.contactName}`,
    `メールアドレス: ${input.to}`,
    `電話番号: ${input.phone || '(未記入)'}`,
    `ホームページ: ${input.website || '(未記入)'}`,
    '',
    'ご質問・メッセージ',
    input.message || '(なし)',
    '',
    '掲載内容・料金の詳細は下記ページからもご確認いただけます。',
    'https://fukues.com/listing',
    '',
    '───────────────',
    'このメールは送信内容の控えとして自動でお送りしています。',
    'お心当たりのない場合はお手数ですが破棄してください。',
    'ご返信いただく場合は、このメールにそのままご返信ください（info@fukues.com に届きます）。',
    '',
    '福岡メンズエステポータル フクエス 運営事務局',
    'https://fukues.com',
  ].join('\n');

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: 'フクエス運営事務局 <unei@send.fukues.com>',
      to: input.to,
      replyTo: 'info@fukues.com',
      subject: '【フクエス】掲載についてのお問い合わせを承りました',
      html,
      text,
    });
    if (error) console.error('[sendListingAutoReply] 送信失敗:', error);
  } catch (e) {
    console.error('[sendListingAutoReply] 送信エラー:', e);
  }
}
