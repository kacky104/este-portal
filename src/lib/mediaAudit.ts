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
  'credential_disabled', // ★ ログインを一時停止した（鍵の旗を倒した・第89便）
  'credential_enabled',  // ★ ログインを再開した
  'credential_deleted',  // 登録そのものを消した
  'login',               // 媒体にログインした
  'read_work',           // 出勤を読んだ
  'read_girls',          // ★ 媒体側の名簿（女の子一覧）を読んだ（第50便）。読むだけ
  'read_maillist',       // ★ 投稿用メールアドレス一覧を読んだ（第53便）。読むだけ
  'read_diary_list',     // ★ 写メ日記の一覧を読んだ（第94便）。読むだけ
  'read_diary_detail',   // ★ 写メ日記を1件開いた（第94便）。読むだけ
  'read_photo_page',     // ★ 女の子の編集ページ（画像登録）を読んだ（第107便）。読むだけ
  'push_photo',          // ★★ 駅ちかへ写真を送った（第107便）。★ 書き換える
  'plan_work',           // ★ 試し打ち。送るとどうなるかを組み立てただけ（第43便）
  'link_mode_changed',   // ★ 連携の向きを変えた（読む↔書く・第46便）
  'cast_id_linked',      // ★ 名簿の結びを画面から作った（第115便）。★ 送り先が決まる
  'cast_id_unlinked',    // ★ 名簿の結びを画面から外した（第115便）
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
  esutama: 'エステ魂',
  zenkoku: '全国エステランキング',
};
// ★★ src/lib/mediaSites.ts の MEDIA_SITES と【名前が一致していること】を
//   check:mediasites で走査している（第64便）。★ 表に足してラベルを足し忘れると落ちる。

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
/**
 * ★★★ ここで作る文字列は【店舗が読む文】。
 *   ★ 「★」を書かないこと。★ は設計メモとコードの注記の記号で、店舗はその意味を知らない。
 *   ★★ 2026-08-29 に2回同じ失敗をした（importStall で直した直後に、ここで繰り返した）。
 *     → 直したのは1か所だけで、同じ失敗が起きない形にしていなかった。
 *     → ★ 点検 check:auditsummary で全イベントの文言を走査するようにした。
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
      // ★★ 倒したのは【鍵】の旗だけ（第87便）。★ 「連携を停止」と書くと取り込みまで止まったと読める
      s = `${t}へのログインを一時停止しました。再開するまで、この枠へは送りません`;
      break;
    case 'credential_enabled':
      s = `${t}へのログインを再開しました。次の反映から送ります`;
      break;
    case 'credential_deleted':
      s = `${t}のログイン情報を削除しました。以後この枠へは書き込みません`;
      break;
    case 'login':
      s = input.outcome === 'ok'
        ? `${t}にログインしました`
        : `${t}にログインできませんでした`;
      break;
    case 'read_girls':
      // ★ 名簿の読み取り（第50便）。★ 既定の「処理を行いました」に落とさない
      s = input.outcome === 'ok'
        ? `${t}の名簿を読み取りました` + (people !== null ? `（${people}名）` : '')
        : `${t}の名簿を読み取れませんでした`;
      break;
    case 'read_maillist': {
      // ★★ 投稿用アドレスの取り込み（第53便）。★ 件数を画面に出すのがこの記録の目的。
      //   ★ 読み取りの段（applied が無い）と、登録の段（applied あり）を書き分ける。
      //     ★ 同じ文言だと、記録に2行並んだときにどちらがどちらか分からない。
      if (input.outcome !== 'ok') { s = `${t}の投稿用アドレスを読み取れませんでした`; break; }
      const applied = input.detail?.['applied'];
      if (applied === undefined) {
        s = `${t}の投稿用アドレスを読み取りました` + (people !== null ? `（${people}名）` : '');
        break;
      }
      const created = count(d, 'created');
      const updated = count(d, 'updated');
      const unchanged = count(d, 'unchanged');
      const unmatched = count(d, 'unmatched');
      const nums =
        `新規${created ?? 0}名・更新${updated ?? 0}名・変更なし${unchanged ?? 0}名` +
        (unmatched ? `・結びつかず${unmatched}名` : '');
      s = applied === true
        ? `${t}の写メ日記の投稿先を登録しました（${nums}）`
        : `${t}の写メ日記の投稿先を確認しました（${nums}）。まだ登録していません`;
      break;
    }
    case 'read_diary_list': {
      // ★ 写メ日記の一覧（第94便）。★ 何ページ目かまで出す（初回は遡るので、記録に何行も並ぶ）
      const diaries = count(d, 'diaries');
      const pageNo = count(d, 'page');
      const where = pageNo !== null && pageNo > 1 ? `（${pageNo}ページ目` : '（';
      s = input.outcome === 'ok'
        ? `${t}の写メ日記の一覧を読み取りました` +
          (diaries !== null ? `${where}${diaries}件）` : (pageNo !== null && pageNo > 1 ? `${where}）` : ''))
        : `${t}の写メ日記の一覧を読み取れませんでした`;
      break;
    }
    case 'read_diary_detail':
      // ★ 1件ずつなので件数は出さない。★ 「読めた／読めなかった」だけ
      s = input.outcome === 'ok'
        ? `${t}の写メ日記を1件読み取りました`
        : `${t}の写メ日記を1件読み取れませんでした`;
      break;
    case 'read_work':
      s = input.outcome === 'ok'
        ? `${t}の出勤を読み取りました` + (people !== null ? `（在籍${people}人）` : '')
        : `${t}の出勤を読み取れませんでした`;
      break;
    case 'plan_work': {
      // ★★ 「送った」と読める文にしないこと。これは【送っていない】記録。
      const changes = count(d, 'changes');
      s = input.outcome === 'ok'
        ? `${t}へ反映する内容を確認しました（まだ送っていません` +
          (changes !== null ? `。変更 ${changes}件` : '') + `）`
        : `${t}へ反映する内容を確認し、送らずに止めました`;
      break;
    }
    case 'link_mode_changed': {
      const mode = d?.['mode'];
      s =
        mode === 'write'
          ? `${t}の連携を「フクエスから駅ちかへ反映する」に変更しました`
          : mode === 'read'
            ? `${t}の連携を「駅ちかから取り込む」に戻しました`
            : `${t}の連携を「連携しない」に変更しました`;
      break;
    }
    case 'cast_id_linked':
      // ★★ 誰と誰を結んだかは、呼び出し側が summary に名前を入れて記録する。
      //   ★ ここは既定の1行。★ 内部の番号は出さない（店舗が読む場所）
      s = input.outcome === 'ok'
        ? `${t}の登録と、フクエスのセラピストを結びつけました`
        : `${t}の登録と結びつけられませんでした`;
      break;
    case 'cast_id_unlinked':
      s = input.outcome === 'ok'
        ? `${t}の登録との結びつきを外しました`
        : `${t}の登録との結びつきを外せませんでした`;
      break;
    case 'write_work':
      s = input.outcome === 'ok'
        ? `${t}の出勤を更新しました` + (changed !== null ? `（${changed}人ぶんを変更）` : '')
        : `${t}の出勤を更新できませんでした`;
      break;
    case 'verify_work':
      s = input.outcome === 'ok'
        ? `${t}の出勤を更新後に読み直し、内容が一致することを確認しました`
        // ★ ここに「★」を書かない（内部記法）。失敗は画面側が赤で描くので、記号は要らない
        : `${t}の出勤を更新後に読み直したところ、内容が一致しませんでした。確認をお願いします`;
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
