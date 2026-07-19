// バナー/ポップアップ等、店舗オーナーが保存するリンク先を「自サイト内の相対パス」に限定する。
// 目的：外部URL（https://…）・プロトコル相対（//evil.com）・javascript: などを弾き、
//       公開ページでのフィッシング誘導や XSS を防ぐ。
// /mypage の <select> は内部パスしか出さないが、API を直接叩かれても描画側で無害化できるよう、
// 保存側・描画側の両方でこのヘルパーを通す（多重防御）。

// 先頭が単一の "/"、以降は URL で安全に使える文字のみ許可。
const INTERNAL_PATH_RE = /^\/[A-Za-z0-9/_\-.~%?=&#]*$/;

/** 値が「自サイト内の相対パス」として安全かを判定する。 */
export function isInternalPath(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v === '') return false;
  if (!v.startsWith('/')) return false;                 // 相対の内部パスのみ許可
  if (v.startsWith('//') || v.startsWith('/\\')) return false; // プロトコル相対（//host）を排除
  return INTERNAL_PATH_RE.test(v);
}

/** 内部パスなら trim 済みの値、そうでなければ ''（＝リンクなし扱い）を返す。 */
export function sanitizeInternalPath(value: string | null | undefined): string {
  return isInternalPath(value) ? (value as string).trim() : '';
}
