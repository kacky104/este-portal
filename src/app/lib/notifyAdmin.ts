import { Resend } from 'resend';

// 運営宛のメール通知（フォーム送信等のお知らせ）。サーバー専用ヘルパー。
// 既存の sendBookingMail / sendApplicationMail と同じ流儀:
//   - RESEND_API_KEY（設定済み）・認証済みドメイン send.fukues.com から送信
//   - **この関数は例外を投げない**（内部で握る）＝通知失敗が本処理（フォーム送信成立）を巻き戻さない
// 宛先は ADMIN_NOTIFY_EMAIL（未設定なら運営の既定アドレスへフォールバック）。
const FALLBACK_TO = 'joltcoffee@gmail.com';

// メールアドレスとして形が正しいかの簡易判定（2026-08-17 / 第20便）。
// ★ replyTo に変な文字列を入れると Resend がメールごと拒否する（＝通知が届かなくなる）。
//   Reply-To は「あると便利」な飾りで、通知本体より優先度が低い。
//   だから怪しい値は黙って捨てて、通知は必ず出す方を選ぶ。
function looksLikeEmail(v: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
}

/**
 * 運営宛の通知メールを送る。
 *
 * @param subject 件名
 * @param lines   本文（改行で連結される）
 * @param options.replyTo 返信先。フォームを送った相手のメールアドレスを渡すと、
 *   届いた通知で「返信」を押すだけでその人への返事になる（2026-08-17 / 第20便 追加）。
 *   ★ 省略・空文字・形が不正な場合は Reply-To を付けずに送る（従来どおりの挙動）。
 *     渡した値が正しいかは呼び出し側で保証しなくてよい。
 *   ★ ここに設定するのは【相手のアドレス】。運営自身のアドレスを入れても意味がない。
 */
export async function notifyAdmin(
  subject: string,
  lines: string[],
  options?: { replyTo?: string | null },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[notifyAdmin] RESEND_API_KEY 未設定のため送信スキップ');
    return;
  }
  const to = process.env.ADMIN_NOTIFY_EMAIL || FALLBACK_TO;

  const candidate = (options?.replyTo ?? '').trim();
  const replyTo = candidate && looksLikeEmail(candidate) ? candidate : undefined;
  if (candidate && !replyTo) {
    // 通知そのものは送るが、あとで気づけるようにログに残す。
    console.error('[notifyAdmin] replyTo の形式が不正なため Reply-To なしで送信:', candidate);
  }

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: 'フクエス運営通知 <unei@send.fukues.com>',
      to,
      // ★ undefined のときはキー自体が無いのと同じ扱いになる（Resend は無視する）。
      ...(replyTo ? { replyTo } : {}),
      subject,
      text: lines.join('\n'),
    });
    if (error) console.error('[notifyAdmin] 送信失敗:', error);
  } catch (e) {
    console.error('[notifyAdmin] 送信エラー:', e);
  }
}
