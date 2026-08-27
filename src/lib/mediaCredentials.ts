// 他媒体の管理画面ログイン情報を暗号化して保管するためのヘルパー（第38便・論点②の決定 C-2）。
//
// ★★★ このファイルはサーバー専用。`node:crypto` を使うので、クライアントコンポーネントから
//   import すると【ビルドが落ちる】。落ちるのは正しい挙動なので、通るように直さないこと
//   （通してしまうと鍵がクライアントへ出る道ができる）。
//
// ★ 鍵は Vercel の環境変数 `MEDIA_CRED_KEY`（32バイトを base64）。
//   生成: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// ★★ 暗号文は【行に紐づけて】いる（AAD ＝ salonId|provider|slot）。
//   行を別の店舗・別の枠にコピーしても復号できない。DBを直接触られたときに
//   「A店の暗号文をB店の行に貼って使う」ができない、という意味。
//
// ★ 保管するのは3点（§17-9）:
//     shopId   … 駅ちかのログインフォームの shopid。公開ページから取れる（§17-11）
//     loginId  … 同フォームの email 欄に入れる値。★ メールアドレスとは限らない
//     password … ここだけ暗号化する
//   shopId と loginId を平文で持つのは、店舗が画面で「どのアカウントを登録したか」を
//   確かめられるようにするため。この2つだけではログインできず、
//   そもそも shopId は公開ページから機械的に取れる。表(table)自体が service_role 専用。

import crypto from 'node:crypto';

/** 暗号文の版。方式を変えるときはここを上げ、復号側は旧版も読めるようにする。 */
const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export type CredentialRef = {
  salonId: number | string;
  provider: string;
  slot: number;
};

/** 暗号文をその行に縛るための追加認証データ。 */
export function credentialAad(ref: CredentialRef): string {
  return String(ref.salonId) + '|' + ref.provider + '|' + String(ref.slot);
}

function getKey(): Buffer {
  const raw = process.env.MEDIA_CRED_KEY;
  if (!raw) {
    throw new Error(
      'MEDIA_CRED_KEY が設定されていない。32バイトを base64 で環境変数に入れること' +
        '（生成: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"）',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('MEDIA_CRED_KEY の長さが ' + key.length + ' バイト（' + KEY_BYTES + ' バイトのはず）');
  }
  return key;
}

/**
 * 任意の文字列を、指定した AAD に紐づけて暗号化する。戻り値は "v1.<iv>.<tag>.<暗号文>"。
 * ★ 同じ平文でも毎回ちがう文字列になる（IVが毎回ランダム）。
 *   「同じパスワードを使い回している店舗」がDBを見ただけで分かる、という漏れ方を防ぐ。
 * ★ 認証情報だけでなく、中継ジョブの中身（Cookie・パスワードを含むリクエスト）にも使う。
 */
export function encryptWithAad(plain: string, aad: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('空の値は暗号化しない（未入力と区別できなくなる）');
  }
  if (typeof aad !== 'string' || aad.length === 0) {
    throw new Error('AAD が空。暗号文を紐づける先が無い');
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

/** 認証情報用。AAD は salonId|provider|slot（＝その行）。 */
export function encryptSecret(plain: string, ref: CredentialRef): string {
  return encryptWithAad(plain, credentialAad(ref));
}

/**
 * 復号する。
 * ★ 改ざん・鍵ちがい・行の貼り替えは、すべてここで例外になる（GCMの認証タグ）。
 *   ★★ 例外メッセージに平文や鍵を混ぜないこと。ログに出る。
 */
export function decryptSecret(payload: string, ref: CredentialRef): string {
  return decryptWithAad(payload, credentialAad(ref));
}

/** 任意の AAD で復号する。失敗の理由は区別しない（区別すると攻撃者に情報を与える）。 */
export function decryptWithAad(payload: string, aad: string): string {
  const parts = typeof payload === 'string' ? payload.split('.') : [];
  if (parts.length !== 4) throw new Error('暗号文の形式が違う（4つの部分に分かれていない）');
  const [version, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  if (version !== VERSION) throw new Error('知らない暗号文の版: ' + version);

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_BYTES) throw new Error('IVの長さが違う');
  if (tag.length !== 16) throw new Error('認証タグの長さが違う');

  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // ★ 元の例外文（"Unsupported state or unable to authenticate data"）は原因が読めないので言い換える
    throw new Error(
      '復号できない。鍵が違うか、暗号文が改ざんされたか、別のもの向けの暗号文を使っている' +
        '（AAD が保存時と一致しているか確認すること）',
    );
  }
}

/** 画面へ返す用。★ 保存後は二度と平文を返さない（§18-4）。 */
export function maskSecret(): string {
  return '●●●●';
}

/** 暗号文らしき形をしているか。移行やデバッグで、平文が入っていないかを見るのに使う。 */
export function looksEncrypted(value: string): boolean {
  return typeof value === 'string' && /^v\d+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]*$/.test(value);
}
