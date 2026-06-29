// fukuX のリンク（link_url）共通ユーティリティ。
// http/https のみ許可（DBの CHECK 制約と二重防御）。危険スキーム（javascript: / data: 等）は弾く。
// スキーム無しは安全側で https:// を補完（http には補完しない）。空入力は「リンク無し」= null。

export function normalizeLinkUrl(raw: string): { url: string | null; error: string | null } {
  const s = raw.trim();
  if (!s) return { url: null, error: null }; // 未入力＝リンク無し（OK）

  // 既にスキームがあるならそのまま検査。無ければ https:// を補完（安全側・http は補完しない）。
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s);
  const candidate = hasScheme ? s : `https://${s}`;

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { url: null, error: 'URLの形式が正しくありません' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { url: null, error: 'http:// または https:// のリンクのみ使えます' };
  }
  return { url: u.toString(), error: null };
}

// 表示用：ドメイン名（先頭 www. は除去）。失敗時は元文字列。
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// 表示の安全弁：href に入れてよい http/https のみ通す（万一不正値が混じっても危険スキームを描画しない）。
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
