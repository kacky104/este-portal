import { Resend } from 'resend';

// 求人応募が入ったとき、店の通知先メールへ送る応募通知メール（フクエスワーク）。
// sendBookingMail.ts をベースに改修。サーバー専用ヘルパー。
// **この関数は例外を投げない**（内部で握る）。応募 INSERT はすでに成功しているため、
// メール送信の失敗が応募成立を巻き戻してはならない。

type ApplicationMailInput = {
  to: string; // salon_jobs.notify_email → salons.booking_email のフォールバック済みの宛先
  salonName: string;
  jobTitle: string;
  name: string;
  tel: string;
  age: number | null; // 未入力なら省略
  note: string | null; // 応募者メッセージ（DBカラム名 note）
};

// メールHTMLに差し込むユーザー入力の簡易エスケープ（XSS/表示崩れ対策）。
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 応募日時を JST の "YYYY/MM/DD HH:MM" で整形。
function appliedAtLabelJST(d: Date): string {
  const date = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${date} ${time}`;
}

export async function sendApplicationMail(input: ApplicationMailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendApplicationMail] RESEND_API_KEY 未設定のため送信スキップ');
    return;
  }
  // 通知先が無い（notify_email も booking_email も空）ときは送信スキップ（応募はDBに残る）。
  if (!input.to) {
    console.error('[sendApplicationMail] 通知先メール未設定のため送信スキップ（応募はDBに保存済み）');
    return;
  }
  const resend = new Resend(apiKey);

  const appliedAt = appliedAtLabelJST(new Date());
  const subject = `【フクエスワーク】新しい求人応募（${input.salonName}）`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.7;max-width:560px">
      <p>${esc(input.salonName)} 御中</p>
      <p>フクエスワークの求人に新しい応募が入りました。応募者へ折り返しお電話にてご連絡ください。</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#059669">■ 応募求人</p>
        <p style="margin:2px 0">${esc(input.jobTitle)}</p>
        <p style="margin:12px 0 8px;font-weight:bold;color:#059669">■ 応募者</p>
        <p style="margin:2px 0">お名前：${esc(input.name)}</p>
        <p style="margin:2px 0">電話番号：${esc(input.tel)}</p>
        ${input.age != null ? `<p style="margin:2px 0">年齢：${input.age}</p>` : ''}
        ${input.note ? `<p style="margin:2px 0">メッセージ：${esc(input.note)}</p>` : ''}
        <p style="margin:2px 0">応募日時：${esc(appliedAt)}</p>
      </div>
      <p style="font-size:12px;color:#94a3b8">
        ※mypageの「求人」タブから応募一覧を確認できます。<br>
        ※本メールは通知専用です。応募者への連絡はお電話でお願いします。
      </p>
    </div>
  `;

  const text = [
    `${input.salonName} 御中`,
    ``,
    `フクエスワークの求人に新しい応募が入りました。応募者へ折り返しお電話にてご連絡ください。`,
    ``,
    `■ 応募求人`,
    `${input.jobTitle}`,
    ``,
    `■ 応募者`,
    `お名前：${input.name}`,
    `電話番号：${input.tel}`,
    ...(input.age != null ? [`年齢：${input.age}`] : []),
    ...(input.note ? [`メッセージ：${input.note}`] : []),
    `応募日時：${appliedAt}`,
    ``,
    `※mypageの「求人」タブから応募一覧を確認できます。`,
    `※本メールは通知専用です。応募者への連絡はお電話でお願いします。`,
  ].join('\n');

  try {
    const { error } = await resend.emails.send({
      from: 'フクエスワーク <kyujin@send.fukues.com>',
      to: input.to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('[sendApplicationMail] Resend送信エラー:', error);
    }
  } catch (e) {
    console.error('[sendApplicationMail] 送信例外:', e);
  }
}
