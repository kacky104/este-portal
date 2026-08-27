// 他媒体連携の監査ログ・純粋関数（第39便）。
//
// ★★★ このファイルは通信もDBも触らない。文言の組み立てと、秘密を落とす検査だけ。
//   DBへ書くのは src/app/lib/media/mediaAudit.ts。
//   ★ 分けている理由: ここはテストできる。第38便 §8-2 の
//     「パーサは【テストが通ったこと】を根拠にしてはいけない」の裏返しで、
//     **テストできる形にしておかないと、そもそも根拠が1つも無くなる。**
//
// ★★ 監査ログの値は「後から直せないこと」と「秘密が入っていないこと」の2つで決まる。
//   前者はDB側のトリガー（追記専用）。後者がここ。

/** 何が起きたか。★ 増やすときは migration のコメントと揃える。 */
export const MEDIA_AUDIT_EVENTS = [
  'consent_agreed',      // 同意文言に同意した（★ 認証情報を預かる前に必ずこれが来る）
  'credential_saved',    // 認証情報を登録・更新した
  'credential_disabled', // 失効させた（画面OFF）
  'credential_enabled',  // 停止していた連携を再開した
  'credential_deleted',  // 登録そのものを消した
  'login',               // 媒体にログインした
  'read_work',           // 出勤を読んだ
  'write_work',          // 出勤を書き換えた
  'verify_work',         // 書き換えた結果を照合した
  'relay_gave_up',       // 3回失敗したので諦めた
  'relay_expired',       // 中継役が掴んだまま戻らなかったので打ち切った
  'relay_rejected',      // 宛先の検査で弾いた
  'selftest',            // 認証情報を使わない疎通確認
] as const;

export type MediaAuditEvent = (typeof MEDIA_AUDIT_EVENTS)[number];

/** どうなったか。★ 'ok' 以外は理由が summary に出ていること。 */
export type MediaAuditOutcome = 'ok' | 'failed' | 'stopped';

export type AuditDetailValue = string | number | boolean | null;
export type AuditDetail = Record<string, AuditDetailValue>;

/**
 * ★★★ detail に入れてはいけないキー（部分一致・大文字小文字を区別しない）。
 *   通してよいものを並べるのではなく【通してはいけないもの】を厚く書く。
 *   relayJob.ts の allowlist と逆向きなのは、detail が「件数を入れる自由な入れ物」で、
 *   何が入りうるかを列挙しきれないから。★ 列挙できる側を列挙する。
 *
 * ★ shop_id は入れてよい（公開ページの画像パスから機械的に取れる・第38便 §5-2）。
 *   'shop' を禁止語にすると shop_id まで落ちるので入れていない。
 */
export const FORBIDDEN_DETAIL_KEYS: readonly string[] = [
  'password', 'passwd', 'pw',
  'secret', 'token', 'credential',
  'cookie', 'session', 'authorization', 'auth',
  'key', 'enc', 'cipher',
  'url', 'href', 'endpoint',
  'email', 'mail', 'login_id', 'loginid',
];

/** 1つの値の長さの上限。件数を入れる場所なので、長いものは何かを間違えている。 */
export const MAX_DETAIL_VALUE_LENGTH = 120;

/** summary の長さの上限。1行で読めること。 */
export const MAX_SUMMARY_LENGTH = 300;

function keyLooksSecret(key: string): boolean {
  const k = key.toLowerCase();
  return FORBIDDEN_DETAIL_KEYS.some((bad) => k.includes(bad));
}

/**
 * 値そのものが秘密に見えるか。★ キー名が無害でも中身が秘密のことがある。
 *   （例: {"note": "v1.xxxx.yyyy.zzzz"} や {"note":"https://ranking-deli.jp/admin/..."}）
 */
export function valueLooksSecret(value: AuditDetailValue): boolean {
  if (typeof value !== 'string') return false;
  if (value.startsWith('v1.')) return true;          // mediaCredentials の暗号文の形
  if (/^https?:\/\//i.test(value)) return true;      // 宛先URL
  if (/PHPSESSID|fuel_csrf_token/i.test(value)) return true;
  if (value.length > MAX_DETAIL_VALUE_LENGTH) return true;
  return false;
}

/**
 * detail から秘密になりうるものを落とす。
 * ★ 落としたことを黙らない。何を落としたかをキー名で返す
 *   （第35便の反省6「0を報告するときは0の理由が読み取れる形に」と同じ）。
 *   ★ 値は返さない。落とした理由を知りたくて値まで返すと、落とした意味が無くなる。
 */
export function scrubAuditDetail(detail: AuditDetail | null | undefined): {
  detail: AuditDetail | null;
  dropped: string[];
} {
  if (!detail) return { detail: null, dropped: [] };

  const kept: AuditDetail = {};
  const dropped: string[] = [];

  for (const [key, value] of Object.entries(detail)) {
    if (keyLooksSecret(key) || valueLooksSecret(value)) {
      dropped.push(key);
      continue;
    }
    kept[key] = value;
  }

  return { detail: Object.keys(kept).length > 0 ? kept : null, dropped };
}

/** 媒体の呼び名。★ 店舗が読む文言なので 'ekichika' とは書かない。 */
export const PROVIDER_LABELS: Record<string, string> = {
  ekichika: '駅ちか',
  esulove: 'エステラブ',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** 「駅ちか（枠1）」。★ 枠が1つしか無い店舗にも枠番号を見せる（増えたときに読み方が変わらない）。 */
export function targetLabel(provider: string, slot: number): string {
  return `${providerLabel(provider)}（枠${slot}）`;
}

function count(detail: AuditDetail | null | undefined, key: string): number | null {
  const v = detail?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * ★★★ 店舗が読んで分かる日本語1行を組み立てる。
 *   ここに英語のエラー文字列や技術用語をそのまま入れない。
 *   ★ 分からない組み合わせでも「何も書かない」にしないこと。
 *     空欄の監査ログは、記録が無いのと同じ。
 */
export function defaultAuditSummary(input: {
  event: MediaAuditEvent;
  outcome: MediaAuditOutcome;
  provider: string;
  slot: number;
  detail?: AuditDetail | null;
}): string {
  const t = targetLabel(input.provider, input.slot);
  const d = input.detail ?? null;
  const people = count(d, 'people');
  const changed = count(d, 'changed');

  let s: string;
  switch (input.event) {
    case 'consent_agreed': {
      // ★ どの版の文言に同意したかを記録に出す。文言は直るので、版が分からないと後で追えない
      const v = d?.['consentVersion'];
      s = `${t}の連携について、説明を確認して同意しました` + (typeof v === 'string' ? `（文言 ${v}）` : '');
      break;
    }
    case 'credential_saved':
      s = `${t}のログイン情報を登録しました`;
      break;
    case 'credential_disabled':
      s = `${t}の連携を停止しました。次回の更新から書き込みません`;
      break;
    case 'credential_enabled':
      s = `${t}の連携を再開しました`;
      break;
    case 'credential_deleted':
      s = `${t}のログイン情報を削除しました。以後この枠へは書き込みません`;
      break;
    case 'login':
      s = input.outcome === 'ok'
        ? `${t}にログインしました`
        : `${t}にログインできませんでした`;
      break;
    case 'read_work':
      s = input.outcome === 'ok'
        ? `${t}の出勤を読み取りました` + (people !== null ? `（在籍${people}人）` : '')
        : `${t}の出勤を読み取れませんでした`;
      break;
    case 'write_work':
      s = input.outcome === 'ok'
        ? `${t}の出勤を更新しました` + (changed !== null ? `（${changed}人ぶんを変更）` : '')
        : `${t}の出勤を更新できませんでした`;
      break;
    case 'verify_work':
      s = input.outcome === 'ok'
        ? `${t}の出勤を更新後に読み直し、内容が一致することを確認しました`
        : `★ ${t}の出勤を更新後に読み直したところ、内容が一致しませんでした。確認が必要です`;
      break;
    case 'relay_gave_up':
      s = `${t}への接続に続けて失敗したため、いったん止めました`;
      break;
    case 'relay_expired':
      // ★ 「送っていない」と言い切らない。掴まれたまま戻らなかったので、
      //   届いたかどうかは【こちらには分からない】。分からないことを分からないと書く
      s = `${t}への通信が最後まで確認できなかったため打ち切りました。更新されたかどうかは確認が必要です`;
      break;
    case 'relay_rejected':
      s = `${t}への送信を、宛先の検査で止めました`;
      break;
    case 'selftest':
      s = `${t}への接続確認を行いました（ログイン情報は使っていません）`;
      break;
    default:
      // ★ 網羅していない組み合わせでも空にしない
      s = `${t}で処理を行いました`;
  }

  return s.length > MAX_SUMMARY_LENGTH ? s.slice(0, MAX_SUMMARY_LENGTH) : s;
}
