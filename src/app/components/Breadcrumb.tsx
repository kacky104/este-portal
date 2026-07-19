import Link from 'next/link';

// 全ページ共通のパンくず「トップ › ページ名」。サロン詳細ページの様式に合わせた見た目。
// root を渡すと起点を差し替え可能（既定はトップ /）。current は現在ページ名（省略不可）。
export function Breadcrumb({
  current,
  root = { label: 'トップ', href: '/' },
}: {
  current: string;
  root?: { label: string; href: string };
}) {
  return (
    <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
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
        style={{ color: '#475569', fontWeight: 600 }}
      >
        {current}
      </span>
    </nav>
  );
}
