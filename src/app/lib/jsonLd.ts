// SEO構造化データ（JSON-LD）の共通ヘルパー。複数の公開ページでパンくずを使うため共通化する。
// ※jobs/[id] の既存 JobPosting/BreadcrumbList 実装は独立して残す（移行しない）。
const SITE_URL = 'https://fukues.com';

/** JSON-LDを安全にscript埋め込み用文字列へ（</script>早期終了防止のため < をエスケープ）。 */
export function toJsonLdString(ld: Record<string, unknown>): string {
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

/** BreadcrumbList。items は [{ name, path }] の順序どおり。path は '/' からの相対。 */
export function buildBreadcrumbJsonLd(
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

/**
 * ItemList（一覧ページの掲載内容と順序を明示する・2026-08-06 追加）。
 * items は画面に実際に表示している順序・件数と一致させること（非表示コンテンツはNG）。
 * url は '/' からの相対パス。name を省くと ListItem は url だけになる。
 */
export function buildItemListJsonLd(
  items: { name?: string; path: string }[],
  opts?: { name?: string },
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org/',
    '@type': 'ItemList',
    ...(opts?.name ? { name: opts.name } : {}),
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      ...(it.name ? { name: it.name } : {}),
      url: `${SITE_URL}${it.path}`,
    })),
  };
}

/** FAQPage。faqs はページに実際に表示している Q&A と同一内容にすること（非表示コンテンツはNG）。 */
export function buildFaqPageJsonLd(
  faqs: { q: string; a: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org/',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
