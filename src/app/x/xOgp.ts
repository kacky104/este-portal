// fukuX リンクプレビュー用 OGP 取得（サーバー専用）。
// 対象は自サイト fukues.com のみ（SSRF回避＝ホスト固定）。外部URLは取得せず null を返す＝カード非表示。
// og:image / og:title / og:description を読み、相対画像URLはページURLで絶対化する。
// ここは 'use server' アクション（xLinkPreviewActions）からのみ import される＝サーバー実行。

const ALLOWED_HOSTS = new Set(['fukues.com', 'www.fukues.com']);
const FETCH_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 512 * 1024; // 念のための上限（自サイトなので十分）

export type XLinkPreview = {
  image: string | null;
  title: string | null;
  description: string | null;
};

// よく出るHTMLエンティティのみ最小デコード（og:content の &amp; 等）。
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// <meta property|name="key" ... content="..."> を属性順どちらでも拾う。
function metaContent(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const res = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i'),
  ];
  for (const re of res) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m && m[1] ? decodeEntities(m[1].trim()) : null;
}

// fukues.com のURLのみ OGP を取得。対象外・失敗時は null（＝カード無し）。
export async function fetchFukuesOgp(rawUrl: string): Promise<XLinkPreview | null> {
  let pageUrl: URL;
  try {
    pageUrl = new URL(rawUrl);
  } catch {
    return null;
  }
  if (pageUrl.protocol !== 'https:' && pageUrl.protocol !== 'http:') return null;
  if (!ALLOWED_HOSTS.has(pageUrl.hostname)) return null; // 自サイト以外は取得しない

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html = '';
  try {
    const res = await fetch(pageUrl.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'fukuXBot/1.0 (+https://fukues.com)', accept: 'text/html' },
      // 取得内容はキャッシュ列に保存するのでランタイムキャッシュは不要。
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') ?? '';
    if (!ctype.includes('text/html')) return null;
    // <head> までで十分＝上限バイトで打ち切り読み。
    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
    html = new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const rawImage = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image');
  let image: string | null = null;
  if (rawImage) {
    try {
      image = new URL(rawImage, pageUrl).toString(); // 相対URLを絶対化
    } catch {
      image = null;
    }
  }
  const title = metaContent(html, 'og:title') ?? titleTag(html);
  const description = metaContent(html, 'og:description') ?? metaContent(html, 'description');

  // 画像もタイトルも無ければカードにする価値が無い＝null（テキストリンクにフォールバック）。
  if (!image && !title) return null;
  return { image, title, description };
}
