import Link from 'next/link';
import { toJsonLdString } from '@/app/lib/jsonLd';

// 全ページ共通のパンくず「トップ › ページ名」。サロン詳細ページの様式に合わせた見た目。
// root を渡すと起点を差し替え可能（既定はトップ /）。current は現在ページ名（省略不可）。
//
// BreadcrumbList 構造化データ（2026-08-05）:
// 可視パンくずと同一内容の JSON-LD を既定で一緒に出力する（このコンポーネントを使う全ページに
// 一括適用される）。最終要素の item（URL）は Google 推奨に従い省略（自ページURLを持たないため）。
// ページ側で独自の BreadcrumbList を出している場合（例: /area/[slug]）は jsonLd={false} で抑止する。
export function Breadcrumb({
  current,
  root = { label: 'トップ', href: '/' },
  currentColor = '#475569',
  jsonLd = true,
}: {
  current: string;
  root?: { label: string; href: string };
  /** 現在ページ名の文字色。テーマ連動したい場合に指定（既定は slate-600）。 */
  currentColor?: string;
  /** BreadcrumbList JSON-LD を出力するか（ページ側に独自実装がある場合は false）。 */
  jsonLd?: boolean;
}) {
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: root.label, item: `https://fukues.com${root.href}` },
      { '@type': 'ListItem', position: 2, name: current },
    ],
  };
  return (
    <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(ld) }} />
      )}
      <Link
        href={root.href}
        className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap"
        style={{ color: '#ec4899' }}
      >
        {root.label}
      </Link>
      <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
      <span
        aria-current="page"
        className="inline-block max-w-[70%] truncate align-middle"
        style={{ color: currentColor, fontWeight: 600 }}
      >
        {current}
      </span>
    </nav>
  );
}
