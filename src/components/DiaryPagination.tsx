import Link from 'next/link';

// 写メ日記一覧用のページネーション（URLクエリ ?page=N 方式・ISR/キャッシュと相性が良い）。
// Link のみのプレゼンテーション（サーバーコンポーネントのまま）。1ページ目は ?page を付けず basePath そのまま。

// 表示するページ番号リスト（多い場合は現在ページ周辺＋先頭/末尾＋… で省略）。
function pageList(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function DiaryPagination({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => (p <= 1 ? basePath : `${basePath}?page=${p}`);
  const items = pageList(page, totalPages);
  const btn = 'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-sm font-bold transition-colors';
  const link = `${btn} bg-white text-slate-600 border border-slate-200 hover:border-pink-300 hover:text-pink-600`;
  const disabled = `${btn} bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed`;

  return (
    <nav aria-label="ページネーション" className="flex flex-wrap items-center justify-center gap-1.5 mt-8">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link} aria-label="前のページ">‹</Link>
      ) : (
        <span className={disabled} aria-disabled="true">‹</span>
      )}

      {items.map((it, i) =>
        it === '…' ? (
          <span key={`e${i}`} className="px-1 text-slate-400 select-none">…</span>
        ) : it === page ? (
          <span
            key={it}
            aria-current="page"
            className={`${btn} text-white border border-transparent`}
            style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
          >
            {it}
          </span>
        ) : (
          <Link key={it} href={href(it)} className={link}>{it}</Link>
        )
      )}

      {page < totalPages ? (
        <Link href={href(page + 1)} className={link} aria-label="次のページ">›</Link>
      ) : (
        <span className={disabled} aria-disabled="true">›</span>
      )}
    </nav>
  );
}
