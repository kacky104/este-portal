// ★ 第1780便（カッキーさん・2026-11-08）: メールアドレスの @ のあと（ドメイン）の打ち間違いに気づいてもらう。
// ★ 起きたこと: オイルクエスト様のセラピストさんが「icloud.com」を「cloud.com」と入れ、招待メールが届かず連携できなかった。
// ★ 使い方: 招待のメールを入れる画面で、送る前に suggestEmailFix() → 候補があれば「◯◯ではありませんか？」と確かめる。
//   ★ 止めはしない（「このまま送る」で送れる）。★ 純粋関数だけ（番人: なし・小さいので画面で確かめる）。

/** よく使われるドメイン（ここに完全一致すれば何も言わない） */
const KNOWN: readonly string[] = [
  'gmail.com', 'icloud.com', 'me.com', 'mac.com',
  'yahoo.co.jp', 'ymail.ne.jp', 'yahoo.com',
  'docomo.ne.jp', 'ezweb.ne.jp', 'au.com', 'softbank.ne.jp', 'i.softbank.jp', 'ymobile.ne.jp', 'rakuten.jp',
  'outlook.com', 'outlook.jp', 'hotmail.com', 'hotmail.co.jp', 'live.jp', 'live.com', 'msn.com',
];

/** はっきりした打ち間違い（距離では拾いにくいもの） */
const FIX: Readonly<Record<string, string>> = {
  'cloud.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'icloud.jp': 'icloud.com',
  'icloud.co.jp': 'icloud.com',
  'icloud.ne.jp': 'icloud.com',
  'gmail.co': 'gmail.com',
  'gmail.jp': 'gmail.com',
  'gmail.co.jp': 'gmail.com',
  'gmail.ne.jp': 'gmail.com',
  'yahoo.co': 'yahoo.co.jp',
  'yahoo.jp': 'yahoo.co.jp',
  'yahoo.ne.jp': 'yahoo.co.jp',
  'yahoo.com.jp': 'yahoo.co.jp',
  'docomo.co.jp': 'docomo.ne.jp',
  'docomo.jp': 'docomo.ne.jp',
  'docomo.com': 'docomo.ne.jp',
  'ezweb.co.jp': 'ezweb.ne.jp',
  'softbank.jp': 'i.softbank.jp',
  'softbank.co.jp': 'softbank.ne.jp',
};

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** 打ち間違いらしいときは、直した全体のアドレスを返す。★ 問題なさそう・判断できないときは null */
export function suggestEmailFix(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const at = v.lastIndexOf('@');
  if (at <= 0 || at === v.length - 1) return null;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (KNOWN.includes(domain)) return null;
  if (FIX[domain]) return `${local}@${FIX[domain]}`;
  // ★ 近いもの（短いドメインは1文字違いまで・長いものは2文字違いまで）。★ いちばん近い1つだけ
  let best: string | null = null;
  let bestD = Infinity;
  for (const k of KNOWN) {
    const d = distance(domain, k);
    const limit = k.length < 9 ? 1 : 2;
    if (d > 0 && d <= limit && d < bestD) { best = k; bestD = d; }
  }
  return best ? `${local}@${best}` : null;
}
