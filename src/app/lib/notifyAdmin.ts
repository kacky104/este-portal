import { Resend } from 'resend';

// 運営宛のメール通知（フォーム送信等のお知らせ）。サーバー専用ヘルパー。
// 既存の sendBookingMail / sendApplicationMail と同じ流儀:
//   - RESEND_API_KEY（設定済み）・認証済みドメイン send.fukues.com から送信
//   - **この関数は例外を投げない**（内部で握る）＝通知失敗が本処理（フォーム送信成立）を巻き戻さない
// 宛先は ADMIN_NOTIFY_EMAIL（未設定なら運営の既定アドレスへフォールバック）。
const FALLBACK_TO = 'joltcoffee@gmail.com';

export async function notifyAdmin(subject: string, lines: string[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[notifyAdmin] RESEND_API_KEY 未設定のため送信スキップ');
    return;
  }
  const to = process.env.ADMIN_NOTIFY_EMAIL || FALLBACK_TO;
  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: 'フクエス運営通知 <unei@send.fukues.com>',
      to,
      subject,
      text: lines.join('\n'),
    });
    if (error) console.error('[notifyAdmin] 送信失敗:', error);
  } catch (e) {
    console.error('[notifyAdmin] 送信エラー:', e);
  }
}
