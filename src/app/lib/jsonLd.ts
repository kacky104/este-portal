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
