// コネックエフの時刻の入力（「12:15」「翌1:00」）を、朝6時はじまりの分（360〜1799）に直す。
// ★ 第1954便: 4つの画面（ココア・駅ちかマガジン・駅ちか動画投稿・全国エステランキング設定）に同じ写しがあったのを1か所に。
//   ★ 分が 60 以上（「10:75」）は読めない扱いにする（前は 11:15 として通っていた）。
//   ★ 第1838便: 全角の数字・コロン（２１：４２）や「時」区切りでも通す。

/** 読めなければ NaN。0:00〜5:59 と「翌」付きは翌日（+1440）。「24:30」のような書き方も翌 0:30 として通す */
export function parseConecfClock(t: string): number {
  const m = /^(翌)?\s*(\d{1,2})\s*[:時]\s*(\d{2})\s*分?$/.exec(String(t ?? '').normalize('NFKC').trim());
  if (!m) return NaN;
  const mm = Number(m[3]);
  if (mm > 59) return NaN;
  const v = Number(m[2]) * 60 + mm;
  const out = m[1] || v < 360 ? v + 1440 : v;
  return out >= 360 && out < 1800 ? out : NaN;
}
