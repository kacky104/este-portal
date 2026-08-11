// SEO構造化データ（JSON-LD）の共通ヘルパー。複数の公開ページでパンくずを使うため共通化する。
// ※jobs/[id] の既存 JobPosting/BreadcrumbList 実装は独立して残す（移行しない）。
//
// ★ origin（オリジン）について（2026-08-11 追加）
//   JSON-LD の item / url は絶対URLで書く決まりなので、ここでオリジンを前置きしている。
//   フクエス本体は当然 fukues.com だが、掲載店舗の公式HP（/hp 配下）は店舗の独自ドメインで
//   配信される。そこで fukues.com を前置きすると「このページは fukues.com のあのページです」と
//   誤って宣言することになり、canonical（店舗ドメイン）と食い違う。
//   店舗HPから呼ぶときは必ず opts.origin に店舗のオリジンを渡すこと。
//   省略時は従来どおり fukues.com なので、本体側の既存の呼び出しは変更不要。
const SITE_URL = 'https://fukues.com';

/** JSON-LDを安全にscript埋め込み用文字列へ（</script>早期終了防止のため < をエスケープ）。 */
export function toJsonLdString(ld: Record<string, unknown>): string {
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

/**
 * BreadcrumbList。items は [{ name, path }] の順序どおり。path は '/' からの相対。
 * opts.origin を渡すとそのオリジンを前置きする（既定は fukues.com）。
 */
export function buildBreadcrumbJsonLd(
  items: { name: string; path: string }[],
  opts?: { origin?: string },
): Record<string, unknown> {
  const origin = opts?.origin ?? SITE_URL;
  return {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${origin}${it.path}`,
    })),
  };
}

/**
 * ItemList（一覧ページの掲載内容と順序を明示する・2026-08-06 追加）。
 * items は画面に実際に表示している順序・件数と一致させること（非表示コンテンツはNG）。
 * url は '/' からの相対パス。name を省くと ListItem は url だけになる。
 * opts.origin を渡すとそのオリジンを前置きする（既定は fukues.com）。
 */
export function buildItemListJsonLd(
  items: { name?: string; path: string }[],
  opts?: { name?: string; origin?: string },
): Record<string, unknown> {
  const origin = opts?.origin ?? SITE_URL;
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
      url: `${origin}${it.path}`,
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
