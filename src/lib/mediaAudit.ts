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
  // ── エステ魂の写メ日記（第130便・2026-09-04）★ 本人のアカウントから出る ──
  'read_diary_targets',  // ★ 魂セラピスト一覧を読んだ（誰に送れるか）。読むだけ
  'diary_proxy_token',   // ★★ 代理ログイン用トークンを発行させた（★ 値は残さない）
  'diary_proxy_login',   // ★★★ 本人のアカウントに入った。★ 名前を突き合わせた結果も残す
  'diary_post_page',     // ★ 投稿ページを読んだ（ctk を拾う）。読むだけ
  'diary_post_clamped',  // ★ 上限を超えたので切った（黙って切らない）
  'push_diary',          // ★★★ 写メ日記を送った。★ 相手を書き換える
  'diary_proxy_end',     // ★★★ 代理ログインを終えた。★ 本人のセッションを残さない
  // ── 送った印（第133便・2026-09-04）★ 送る【前】に立て、送れなかったら倒す ──
  'plan_diary',          // ★ 誰のどの日記を送るかを組み立てた（★ dryrun はここで終わり）
  // ── 即セラ（第143便・2026-09-04）★ 本人のアカウントの状態を変える ──
  'read_sokusera',       // ★ 即セラの設定ページを読んだ（状態と呼びかけ）。読むだけ
  'push_sokusera',       // ★★★ 即セラをONにした。★ 相手を書き換える
  'verify_sokusera',     // ★★★ 読み返して、本当にONになったかを確かめた
  'diary_mark_set',      // ★★★ 送る前に印を立てた（★ 主キーで二度送りを弾く）
  'diary_mark_cleared',  // ★★ 送れなかったので印を消した（★ 消し忘れると二度と送れない）
  'selftest',            // 認証情報を使わない疎通確認
] as const;

export type MediaAuditEvent = (typeof MEDIA_AUDIT_EVENTS)[number];

/**
 * ★★★ 自動の周が「見ただけ」で終わったとき、記録を残さない（第140便・2026-09-04）。
 *
 * ★★ なぜ黙らせるのか（★ この案件では普段【黙らせない】が原則）
 *   周は5分ごとに回る。★ 送るものが無い日は、1日288回「何もしなかった」を積む。
 *   ★ 2行ずつなら 576行/日。★ 画面の「直近50件」が2時間で埋まる。
 *   ★★★ **大事な記録（駅ちかの取り込み・出勤の反映）が押し流されて見えなくなる。**
 *     → 黙らせないことが、かえって【見えなくする】。★ ここだけ例外にする。
 *
 * ★★ 落とすのは、次の3つが【すべて】そろったときだけ:
 *   ① 自動の周（diary_auto）である     … 人が押したものは必ず残す
 *   ② 次の段を積んでいない             … 相手を1文字も書き換えていない
 *   ③ 記録が「読んだ・数えた」の ok だけ … ★ 失敗・中止が1つでもあれば【残す】
 */
export function shouldDropAutoAudits(
  intent: string,
  hasNext: boolean,
  audits: ReadonlyArray<{ event: string; outcome: string }>,
): boolean {
  // ★ 自動の周だけ。★ 第143便で即セラの周も同じ扱いにした
  //   ★★ 即セラは「今すぐ」の人が居ない時間のほうが長い。★ 放っておくと日記より積む
  if (intent !== 'diary_auto' && intent !== 'sokusera_auto') return false;
  if (hasNext) return false;
  if (audits.length === 0) return false;
  const looked = ['read_diary_targets', 'plan_diary', 'read_sokusera'];
  return audits.every((a) => looked.includes(a.event) && a.outcome === 'ok');
}

/**
 * ★★★ 店舗様の画面に出す行かどうか（第149便・2026-09-04）。
 *
 * ★★ なぜ要るか（★ 2026-09-04 23:00 に実際に困った）
 *   「出勤を送る」の【確かめる】を1回押しただけで、連携の記録に
 *     エステ魂の出勤表を読みました（23人目） ／ 変更なし
 *   が23人ぶん（46行）並んだ。★ 押したご本人が「何か動き続けている」と不安になった。
 *   ★ 異常ではない。組み立てただけで、1文字も送っていない。
 *   ★★★ **「連携の記録」は店舗様のための画面であって、こちらの作業ログではない。**
 *
 * ★★ shouldDropAutoAudits（第140便）との違い
 *   あちらは【自動の周】が見ただけのとき、記録そのものを残さない。
 *   ★ こちらは【人が押した流れ】。★ 記録は残す（あとから追える）。**画面に出さないだけ。**
 *   ★ 第140便で入れた物差しは自動の周だけが対象で、人が押した流れは素通しだった。そこが抜けていた。
 *
 * ★★★ 決め方（★ 推測しない）
 *   ① 既定は【出す】。★ 印が付いていない行は必ず出る（黙らせないのが原則）
 *   ② 隠すのは、出した側が detail に shopVisible: false と【書いたときだけ】
 *      ★ 「castId が入っているから人ごとの行だろう」のような推し方をしない
 *        （第145便の反省: 書いてない ≠ 使っていない）
 *   ③ うまくいかなかったもの（failed）は、印が付いていても【必ず出す】
 *      ★ 静かに失敗させない
 */
export const AUDIT_SHOP_VISIBLE_KEY = 'shopVisible';

/** ★ 隠す行の detail に混ぜる印。★ 呼び出し側でキー名を書き写さない（書き間違いを1か所に閉じる） */
export const AUDIT_SHOP_HIDDEN: AuditDetail = { [AUDIT_SHOP_VISIBLE_KEY]: false };

export function isShopVisibleAudit(row: {
  event: string;
  outcome: string;
  detail?: AuditDetail | null;
}): boolean {
  // ★★★ ③ うまくいかなかったものは、印より優先して出す
  if (row.outcome === 'failed') return true;
  // ★★ ①② 明示的に false と書いてあるときだけ隠す。★ 未指定・null・他の値はすべて【出す】
  return row.detail?.[AUDIT_SHOP_VISIBLE_KEY] !== false;
}

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
      // ★★★ 2026-09-04（第141便）: ここも【駅ちか】と書き込んであった。
      //   ★ 実際にラビリンス様の画面へ
      //     「エステ魂（枠1）の連携を『フクエスから【駅ちか】へ反映する』に変更しました」
      //     と出た。★ エステ魂の話なのに送り先が駅ちか。
      //   ★★ 第139便で「止まっています」の文言は直したが、**ここは直っていなかった**。
      //     ★ 同じ間違いが別の場所に残る。★ 「1か所直した」で終わりにしない。
      const mode = d?.['mode'];
      const n = providerLabel(input.provider);   // ★ 決め打ちしない。★ 呼び名の正本は mediaSites
      s =
        mode === 'write'
          ? `${t}の連携を「フクエスから${n}へ反映する」に変更しました`
          : mode === 'read'
            ? `${t}の連携を「${n}から取り込む」に戻しました`
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
    // ── エステ魂の写メ日記（第130便・文言は第133便）★ 店舗様が読む場所 ──
    case 'read_diary_targets':
      s = input.outcome === 'ok'
        ? `${t}で、代理でお送りできる方を確認しました` + (people !== null ? `（${people}名）` : '')
        : `${t}で、代理でお送りできる方を確認できませんでした`;
      break;
    case 'diary_proxy_token':
      s = input.outcome === 'ok'
        ? `${t}で、ご本人としてお送りするための一時的な入場券を発行しました`
        : `${t}が、一時的な入場券の発行を断りました`;
      break;
    case 'diary_proxy_login': {
      const nm = typeof d?.['name'] === 'string' ? String(d['name']) : '';
      s = input.outcome === 'ok'
        ? `${t}で、${nm ? nm + 'さん' : 'ご本人'}のページに入りました`
        // ★ 人違いはここで止めている。★ 「入れなかった」で終わらせず、理由が読める言い方にする
        : `${t}で、${nm ? nm + 'さん' : 'ご本人'}のページに入れなかったため、何も書かずに戻りました`;
      break;
    }
    case 'diary_post_page':
      s = input.outcome === 'ok'
        ? `${t}の投稿ページを開きました`
        : `${t}の投稿ページを開けませんでした`;
      break;
    case 'diary_post_clamped':
      s = `${t}の字数制限を超えたため、末尾を切って送りました`;
      break;
    case 'push_diary': {
      const nm = typeof d?.['name'] === 'string' ? String(d['name']) : '';
      // ★★ 「送りました」と「載りました」を混ぜない。★ 載ったかはこちらでは決められない
      s = input.outcome === 'ok'
        ? `${t}へ${nm ? nm + 'さんの' : ''}写メ日記を送りました。掲載されたかは媒体側でご確認ください`
        : `${t}へ${nm ? nm + 'さんの' : ''}写メ日記を送れませんでした`;
      break;
    }
    case 'diary_proxy_end':
      s = input.outcome === 'ok'
        ? `${t}のご本人ページから出ました`
        : `${t}のご本人ページから出られませんでした。媒体の管理画面で「代理ログイン終了」をお願いします`;
      break;
    case 'read_sokusera':
      s = input.outcome === 'ok'
        ? `${t}の即セラの設定を確認しました`
        : `${t}の即セラの設定を確認できませんでした`;
      break;
    case 'push_sokusera': {
      const nm = typeof d?.['name'] === 'string' ? String(d['name']) : '';
      // ★★ 「送った」と「ONになった」を混ぜない。★ 確かめるのは verify_sokusera
      s = input.outcome === 'ok'
        ? `${t}へ${nm ? nm + 'さんの' : ''}即セラをONにする指示を送りました`
        : `${t}へ${nm ? nm + 'さんの' : ''}即セラをONにできませんでした`;
      break;
    }
    case 'verify_sokusera':
      s = input.outcome === 'ok'
        ? `${t}で即セラがONになったことを確認しました`
        : input.outcome === 'failed'
          ? `${t}で即セラがONになっていませんでした`
          : `${t}で即セラの状態を読み取れませんでした`;
      break;
    case 'plan_diary':
      // ★ 0名でも「なぜ0なのか」が summary に入っている（呼び出し側が入れる）
      s = input.outcome === 'ok'
        ? `${t}へお送りする写メ日記を確認しました`
        : `${t}へお送りする写メ日記を確認できませんでした`;
      break;
    case 'diary_mark_set':
      // ★ 店舗様には「二度送らないようにした」と読める言い方にする
      s = `${t}へ送る前に、二度送りを防ぐ印を付けました`;
      break;
    case 'diary_mark_cleared':
      s = input.outcome === 'ok'
        ? `${t}へ送れなかったため、印を外しました（あとでもう一度お送りできます）`
        : `${t}へ送れなかったのに印を外せませんでした。この日記は送信済みの扱いのままです`;
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
