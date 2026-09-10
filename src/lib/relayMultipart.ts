// 中継に「ファイル付き POST（multipart/form-data）」を通すときの検査（第106便・純粋関数）。
//
// ★★★ なぜ要るか —— 駅ちかへ写真を送る（設計メモ_駅ちかの画像アップロード 追記 D・案B）
//   いまの中継（relayJob.ts ／ scripts/relay.sh）は【文字の body】しか運べない（上限 1MB・text=True）。
//   写真は最大 10MB のバイナリで、multipart/form-data で送る。
//   → ★ ジョブには【画像の場所】だけ載せ、VPS が取りに行って multipart で投げる（案B）。
//     ★ 画像を base64 で DB に通さない（案A は 10MB が 13MB の文字列になる）。
//
// ★★★ 取りに行く先は fukues.com だけ（★ VPS が話す相手を増やさない）
//   ★ 駅ちかへの宛先 allowlist（RELAY_ALLOWED_HOSTS）とは【別の表】。★ 混ぜない。
//     宛先の表  … 投げる先（ranking-deli.jp / eslove.jp）
//     取り先の表 … 画像を取りに行く先（fukues.com）★ 逆向きに使えない
//   ★ VPS 側（scripts/relay.sh の FILE_HOSTS）にも同じ表を置く。★ relayhosts の点検で突き合わせる。
//
// ★★ 「中身を理解しない」は崩れない: VPS は「フクエスから取って、駅ちかへ投げる」だけ。
//
// ★ このファイルは通信も DB も crypto も触らない（★ relayJob.ts と分けたのは点検で読めるようにするため）。

/** 画像を取りに行ってよいホスト。★ VPS 側（scripts/relay.sh FILE_HOSTS）と同じ組にすること。 */
export const RELAY_FILE_HOSTS: readonly string[] = ['fukues.com'];
/** 取りに行く口。★ ここ以外のパスは fukues.com でも断る（任意のURLを取りに行く道具にしない）。 */
export const RELAY_FILE_PATH_PREFIX = '/api/relay/file';
/** 1回に送るファイルの数の上限。★ 駅ちかの画像登録は1枠1枚。 */
export const RELAY_FILE_MAX_COUNT = 1;
/** 文字の項目の数の上限。★ 駅ちかの form は多くても十数個。 */
export const RELAY_FIELD_MAX_COUNT = 30;
/** 送ってよい種類。★ 駅ちかの画面の注記どおり jpg / png だけ。 */
export const RELAY_FILE_ALLOWED_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

export type RelayFile = {
  /** multipart の項目名（駅ちかの画像登録は 'upfile'） */
  field: string;
  /** VPS が取りに行く場所。★ https://fukues.com/api/relay/file?... だけ */
  url: string;
  /** 相手に見せるファイル名。★ 英数字と _ - . だけ */
  filename: string;
  /** 'image/jpeg' | 'image/png' */
  contentType: string;
};

export type RelayMultipart = {
  /** 文字の項目（image_set_id / id / shopid / fuel_csrf_token …）。★ VPS は --form-string で1つずつ渡す */
  fields: Record<string, string>;
  files: RelayFile[];
};

const FIELD_NAME = /^[A-Za-z0-9_\-\[\]]{1,64}$/;
const FILE_NAME = /^[A-Za-z0-9_\-]{1,64}\.(jpg|jpeg|png)$/;

function fail(msg: string): never {
  throw new Error('ファイル付き POST の形が不正: ' + msg);
}

/**
 * ★★★ ジョブに載せる前・VPS に渡す前の両方で通す検査。
 *   ★ 通らなければ例外。★ 「だいたい合っている」を通さない（VPS が任意のものを取りに行く道具にしない）。
 */
export function assertRelayMultipart(input: unknown): RelayMultipart {
  if (!input || typeof input !== 'object') fail('オブジェクトではない');
  const m = input as { fields?: unknown; files?: unknown };

  // ── 文字の項目 ──
  if (!m.fields || typeof m.fields !== 'object' || Array.isArray(m.fields)) fail('fields が無い');
  const fields: Record<string, string> = {};
  const entries = Object.entries(m.fields as Record<string, unknown>);
  if (entries.length > RELAY_FIELD_MAX_COUNT) fail('fields が多すぎる: ' + entries.length);
  for (const [k, v] of entries) {
    if (!FIELD_NAME.test(k)) fail('項目名が不正: ' + k.slice(0, 40));
    if (typeof v !== 'string') fail('項目の値が文字ではない: ' + k);
    if (v.length > 4000) fail('項目の値が長すぎる: ' + k);
    if (v.includes('\0')) fail('項目の値に NUL が入っている: ' + k);
    fields[k] = v;
  }

  // ── ファイル ──
  if (!Array.isArray(m.files)) fail('files が無い');
  if (m.files.length < 1) fail('files が空（ファイル無しなら multipart にしない）');
  if (m.files.length > RELAY_FILE_MAX_COUNT) fail('files が多すぎる: ' + m.files.length);
  const files: RelayFile[] = [];
  for (const f of m.files as unknown[]) {
    if (!f || typeof f !== 'object') fail('files の要素がオブジェクトではない');
    const { field, url, filename, contentType } = f as Record<string, unknown>;
    if (typeof field !== 'string' || !FIELD_NAME.test(field)) fail('ファイルの項目名が不正');
    if (field in fields) fail('ファイルの項目名が fields と重なっている: ' + field);
    if (typeof filename !== 'string' || !FILE_NAME.test(filename)) fail('ファイル名が不正');
    if (typeof contentType !== 'string' || !RELAY_FILE_ALLOWED_TYPES.includes(contentType)) {
      fail('送れない種類: ' + String(contentType).slice(0, 40));
    }
    if (typeof url !== 'string') fail('url が文字ではない');
    assertRelayFileUrl(url);
    files.push({ field, url, filename, contentType });
  }
  return { fields, files };
}

/**
 * ★★★ 画像を取りに行く先の検査。★ 宛先の allowlist（assertAllowedUrl）と同じ厳しさで、表だけ別。
 *   弾くもの: https 以外 / fukues.com 以外 / ポート / ユーザー情報 / /api/relay/file 以外のパス
 */
export function assertRelayFileUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    fail('url として読めない: ' + String(url).slice(0, 80));
  }
  if (u.protocol !== 'https:') fail('https 以外から取らない: ' + u.protocol);
  if (u.username || u.password) fail('ユーザー情報つき url から取らない');
  if (u.port) fail('ポート指定つき url から取らない');
  // ★ 前方一致・後方一致で判定しない（fukues.com.evil.com が通る）
  if (!RELAY_FILE_HOSTS.includes(u.hostname)) fail('取りに行ってよい先ではない: ' + u.hostname);
  if (u.pathname !== RELAY_FILE_PATH_PREFIX) fail('取りに行く口ではない: ' + u.pathname.slice(0, 60));
  return u;
}

/**
 * ★★★ 取りに来た口に頼めること（第241便・2026-09-10 に寸法を足した）。
 *   ★★★★★ **ここに並べたものしか頼めない。** ★ 「任意の変換を頼める口」にしない。
 */
export type RelayFileOptions = {
  /** JPEG に直して返す（第165便） */
  as?: 'jpeg';
  /**
   * ★★★★ 寸法を合わせて返す（第241便）。★ いまは `cover` だけ。
   *   cover … 指定の大きさを**覆うように**縮小（拡大）して、はみ出したぶんを切り落とす。
   *   ★ 「引き伸ばして歪める」ではない。★ 縦横の比は保たれる。
   */
  fit?: 'cover';
  /** 仕上がりの幅（1〜4000） */
  w?: number;
  /** 仕上がりの高さ（1〜4000） */
  h?: number;
  /**
   * ★★★★★ どこを基準に切り取るか。★ **fit を頼むときは必ず指定する。**
   *   'lefttop' … 左上基準（★ エステ魂の写真がこれ。`canvasDraw` が原点から描いている）
   *   'center'  … 中央基準
   *   ★★ 既定値を作らない。★ 基準を間違えると**顔が切れる**。★ 黙って決めない。
   */
  pos?: 'lefttop' | 'center';
};

/**
 * ★ フクエスの口の URL を組む（★ 取り先はここで組んだものしか通らない）。
 *
 * ★ 第3引数は `'jpeg'`（第165便からの書き方）でも、指定の入れ物でも受ける。
 */
export function relayFileUrl(bucket: string, path: string, opt?: 'jpeg' | RelayFileOptions): string {
  if (!/^[a-z][a-z0-9\-]{1,40}$/.test(bucket)) throw new Error('bucket の形が不正');
  if (!/^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/.test(path) || path.includes('..') || path.includes('//')) {
    throw new Error('path の形が不正');
  }
  const o: RelayFileOptions = opt === undefined ? {} : (typeof opt === 'string' ? { as: opt as 'jpeg' } : opt);

  // ★★★ as=jpeg（第165便）: 取りに来た口で JPEG へ直してから返す。
  //   ★ 駅ちかの記事の画像は **JPEG のみ**（2026-09-05 実測。PNG は「画像ファイル形式が…」で断られた）。
  //   ★★ 店舗様に「JPEGにしてから登録し直してください」と言わせないための仕掛け。
  //   ★ 中継役（relay.sh）は pathname だけを見ているので、クエリが増えても規則は変わらない。
  if (o.as !== undefined && o.as !== 'jpeg') throw new Error('as は jpeg だけ');

  const q: string[] = [
    'bucket=' + encodeURIComponent(bucket),
    'path=' + encodeURIComponent(path),
  ];

  // ★★★★ fit=cover（第241便）: エステ魂の写真は 357×556 に**覆うように**縮めて左上で切る（設計メモ §25-7）。
  //   ★ 相手のブラウザ（canvas_fileupload.js）がやっていることと同じ形にそろえる。
  //   ★★ ここで直す理由は as=jpeg と同じ: 元の写真は触らず、その1回ぶんだけ直す。
  if (o.fit !== undefined) {
    if (o.fit !== 'cover') throw new Error('fit は cover だけ');
    const w = Number(o.w);
    const h = Number(o.h);
    if (!Number.isInteger(w) || w < 1 || w > 4000) throw new Error('w の形が不正（1〜4000の整数）');
    if (!Number.isInteger(h) || h < 1 || h > 4000) throw new Error('h の形が不正（1〜4000の整数）');
    // ★★★★★ 基準を黙って決めない。★ 間違えると顔が切れる
    if (o.pos !== 'lefttop' && o.pos !== 'center') {
      throw new Error('fit を頼むときは pos（lefttop / center）も指定する');
    }
    q.push('fit=cover', 'w=' + String(w), 'h=' + String(h), 'pos=' + o.pos);
  } else if (o.w !== undefined || o.h !== undefined || o.pos !== undefined) {
    // ★ 効かない指定を黙って受け取らない（★ 「指定したのに効いていない」がいちばん分かりにくい）
    throw new Error('fit を指定せずに w / h / pos は指定しない');
  }

  if (o.as) q.push('as=jpeg');
  return 'https://' + RELAY_FILE_HOSTS[0] + RELAY_FILE_PATH_PREFIX + '?' + q.join('&');
}
