import Link from 'next/link';

// 新着情報（work_news）過去ページ用のページャ。ルートセグメント型リンクを生成する
// （DiaryPagination は ?page= 型固定で流用不可のため最小新設）。
// 1ページ目 → /jobs/{jobId}（求人詳細の新着情報タブへ戻る）、2ページ目以降 → /jobs/{jobId}/news/{p}。
// 配色はフクエスワークのグリーン系。

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

export function WorkNewsPager({
  jobId,
  page,
  totalPages,
}: {
  jobId: number;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  // 1ページ目は求人詳細（新着情報タブ）へ、2ページ目以降は過去ページルートへ。
  const href = (p: number) => (p <= 1 ? `/jobs/${jobId}` : `/jobs/${jobId}/news/${p}`);
  const items = pageList(page, totalPages);

  const btn = 'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-sm font-bold transition-colors';
  const link = `${btn} bg-white border`;
  const linkStyle = { borderColor: '#A7F3D0', color: '#059669' } as const;
  const disabled = `${btn} bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed`;

  return (
    <nav aria-label="ページネーション" className="flex flex-wrap items-center justify-center gap-1.5 mt-8">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link} style={linkStyle} aria-label="前のページ">‹</Link>
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
            style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
          >
            {it}
          </span>
        ) : (
          <Link key={it} href={href(it)} className={link} style={linkStyle}>{it}</Link>
        )
      )}

      {page < totalPages ? (
        <Link href={href(page + 1)} className={link} style={linkStyle} aria-label="次のページ">›</Link>
      ) : (
        <span className={disabled} aria-disabled="true">›</span>
      )}
    </nav>
  );
}
