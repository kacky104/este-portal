// ★★ 第1209便（2026-10-06・カッキーさん）: フクエスCRM のスケジュールで、予約や待機部屋などを更新したことを
//   セラピストへ LINE で知らせるボタンの【文面とリンク】。
//
// ★ 仕組み: LINE の「送る画面」を、文面を入れた状態で開くだけ（https://line.me/R/share）。
//   送り先（その子・お店のグループ）は、開いた LINE の画面でスタッフが選ぶ。★ 自動では届かない。
//   「セラピストページ連携」の QR や誓約書の「LINEで送る」と同じやり方＝LINE との契約・新しい表は要らない。
// ★ 文面は「更新しました＋セラピストページへのリンク」だけ（カッキーさん決定）。
//   予約の中身・お客様の名前・部屋番号は書かない（セラピストページを開けば全部ある・LINE に個人情報を流さない）。
// ★ リンクは、セラピストページの「スケジュール」タブを、その日を開いた状態で開く（/cast?tab=schedule&date=…）。
//   ★ セラピストページは fukues.com にある。CRM は fukuescrm.com でも開くので、絶対 URL で書く。
// ★ ここは純粋関数だけ（ブラウザの部品からも読む）。

const CAST_URL = 'https://fukues.com/cast';

/** セラピストページの「スケジュール」タブを、その日で開くリンク */
export function castScheduleLink(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${CAST_URL}?tab=schedule&date=${date}` : `${CAST_URL}?tab=schedule`;
}

/** 「10/5（月）」。読めない日付は空文字 */
export function shortDateLabel(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return '';
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${'日月火水木金土'[d.getUTCDay()]}）`;
}

/** LINE に入れる文面 */
export function castNotifyText(name: string, date: string): string {
  const who = name.trim() ? `${name.trim()}さん、` : '';
  const day = shortDateLabel(date);
  return `${who}${day ? `${day}の` : ''}予定を更新しました。\nセラピストページで確認してください。\n${castScheduleLink(date)}`;
}

/** LINE の「送る画面」を、その文面で開くリンク */
export function lineShareHref(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}
