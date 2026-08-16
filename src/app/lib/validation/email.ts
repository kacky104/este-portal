// メールアドレスの正規化・検証（2026-08-16 追加）。
//
// ★ 作った理由
//   ネット予約の通知先（salons.booking_email）の検証が「@ を含むか」だけで、
//   joltcoffee@gamil.com（gmail の打ち間違い）のような宛先がそのまま保存できていた。
//   Resend の API 呼び出しは成功し、バウンスは後から非同期で起きるため、
//   アプリ側には「送れなかった」情報が一切戻ってこない
//   （2026-08-16 に実際に検証済み：Resend のログに Bounced だけが残り、画面には何も出ない）。
//   → 入口で止めるのがいちばん確実、という判断でこのモジュールを追加した。
//
// ★ ここで捕まえられないもの
//   「形式は正しいが宛先が別人」は原理的に検出できない。そちらは
//   ネット予約設定タブの【テスト送信】ボタン（sendBookingTestMail）で、
//   お店に実際の受信箱を見てもらうことで確認する。
//
// DBスキーマには関与しない（保存値の整形と入力検証のみ）。phone.ts と同じ方針。

// 前後の空白類（半角スペース・タブ等の \s と全角スペース U+3000）。
const TRIM_WS = /^[\s　]+|[\s　]+$/g;
// 全角英数字・全角アットマーク・全角ドット（コピペで混入しやすい）。
const FULLWIDTH = /[Ａ-Ｚａ-ｚ０-９＠．＿－]/g;

/**
 * 前後の空白を落とし、全角の英数字・＠・．などを半角へ寄せて小文字化する。
 *
 * ★ 途中の空白は【消さずに残す】こと。
 *   消すと "a b@gmail.com" が "ab@gmail.com" として保存され、
 *   別人のアドレスへ黙って送ることになる。残しておけば isValidEmail が弾く。
 *   前後の空白だけはコピペ由来なので落としてよい。
 *
 * ローカル部も小文字にしている点に注意。RFC 上はローカル部の大文字小文字は区別されうるが、
 * 実運用のメールサービスはまず区別しない。表記ゆれで「同じ宛先が別物として保存される」ほうが
 * 害が大きいため、揃える方を選んでいる。
 */
export function normalizeEmail(input: string): string {
  return String(input ?? '')
    .replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(TRIM_WS, '')
    .toLowerCase();
}

// 実用的な範囲の形式チェック。RFC 5322 の完全な実装はしない（正規表現が巨大になるだけで
// 実害のある入力はほとんど捕まえられないため）。ここでは以下だけを見る:
//   ・@ がちょうど1つ
//   ・ローカル部が1文字以上、空白・@ を含まない
//   ・ドメイン部にドットがあり、TLD が2文字以上の英字
//   ・連続ドット、先頭/末尾のドットやハイフンが無い
const EMAIL_RE = /^[^@\s.](?:[^@\s]*[^@\s.])?@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function isValidEmail(input: string): boolean {
  const v = normalizeEmail(input);
  if (v.length === 0 || v.length > 254) return false;
  if (v.includes('..')) return false;
  return EMAIL_RE.test(v);
}

/**
 * よくある打ち間違いドメインの対応表。
 * ★ ここは「明らかな誤記」だけを載せること。実在するドメインを載せると正当な宛先を弾いてしまう。
 *   判定は警告どまり（保存はブロックしない）にしてあるが、それでも誤検知は混乱のもと。
 */
const TYPO_DOMAINS: Record<string, string> = {
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmai.co': 'gmail.com',
  'gmail.jp': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'yahoo.co.p': 'yahoo.co.jp',
  'yaho.co.jp': 'yahoo.co.jp',
  'yahoo.com.jp': 'yahoo.co.jp',
  'ezweb.ne.p': 'ezweb.ne.jp',
  'docomo.ne.p': 'docomo.ne.jp',
  'icloud.co': 'icloud.com',
  'outlok.com': 'outlook.com',
  'hotmai.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
};

// 近似判定に使う主要ドメイン（編集距離1で拾う）。表に無い打ち間違いもここで拾える。
const COMMON_DOMAINS = [
  'gmail.com', 'yahoo.co.jp', 'icloud.com', 'outlook.com', 'hotmail.com',
  'docomo.ne.jp', 'ezweb.ne.jp', 'softbank.ne.jp', 'au.com', 'me.com',
];

// 編集距離（挿入・削除・置換）が limit 以下かどうかだけを見る簡易版。
function withinDistance(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length] <= limit;
}

/**
 * ドメインの打ち間違いが疑われる場合に「もしかして」の候補を返す。疑いが無ければ null。
 * ★ これは警告用。保存はブロックしないこと（社内ドメインなど、似ているだけの正当な宛先がある）。
 */
export function suggestEmailDomain(input: string): string | null {
  const v = normalizeEmail(input);
  const at = v.lastIndexOf('@');
  if (at < 0) return null;
  const domain = v.slice(at + 1);
  if (!domain) return null;
  if (COMMON_DOMAINS.includes(domain)) return null; // 正しいものはそのまま
  const mapped = TYPO_DOMAINS[domain];
  if (mapped) return mapped;
  for (const d of COMMON_DOMAINS) {
    if (withinDistance(domain, d, 1)) return d;
  }
  return null;
}
