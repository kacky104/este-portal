import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { fetchJobById, fetchPublishedWorkNews, WORK_NEWS_PAGE_SIZE } from '@/app/lib/jobs';
import { JobNewsList } from '../../JobNewsList';
import { WorkNewsPager } from '../../WorkNewsPager';

// 新着情報（work_news）の過去ページ専用ルート（2ページ目以降）。
// /jobs/[id] 本体から searchParams を排除するための独立ルート（ルートセグメント [page] でページ番号を受ける）。
// searchParams を使わないため、generateStaticParams（空配列）＋ revalidate による ISR（●）を維持できる。
// 1ページ目は本体 /jobs/[id] の新着情報タブに集約するため /news/1 は redirect（重複コンテンツ回避）。

export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
export async function generateStaticParams() {
  return [];
}

// 数値文字列のみ許可（それ以外は呼び出し側で notFound）。
function parseNumeric(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; page: string }>;
}): Promise<Metadata> {
  const { id, page } = await params;
  const jobId = parseNumeric(id);
  const pageNum = parseNumeric(page);
  if (jobId === null || pageNum === null) return {};
  const job = await fetchJobById(jobId);
  if (!job) return {};
  // layout の template「%s｜フクエスワーク」が末尾を付与する。
  // canonical を明示しないと root の canonical '/' を継承して「トップの重複」扱いになるため自己参照を付与。
  return {
    title: `${job.salon.name}の新着情報 ${pageNum}ページ目`,
    alternates: { canonical: `/jobs/${jobId}/news/${pageNum}` },
  };
}

export default async function JobNewsArchivePage({
  params,
}: {
  params: Promise<{ id: string; page: string }>;
}) {
  const { id, page } = await params;
  const jobId = parseNumeric(id);
  const pageNum = parseNumeric(page);
  // id・page が数値でなければ 404。
  if (jobId === null || pageNum === null) notFound();
  // 1ページ目は本体の新着情報タブへ集約（重複コンテンツ回避）。
  if (pageNum === 1) redirect(`/jobs/${jobId}`);
  // 0 ページ等は 404（2ページ目以降の専用ルート）。
  if (pageNum < 2) notFound();

  const job = await fetchJobById(jobId);
  if (!job) notFound();

  const { rows, total } = await fetchPublishedWorkNews(job.salon.id, pageNum);
  const totalPages = Math.max(1, Math.ceil(total / WORK_NEWS_PAGE_SIZE));
  // 範囲外ページ（総ページ数超過）は 404。
  if (pageNum > totalPages) notFound();

  return (
    <main className="max-w-3xl mx-auto px-4 pt-8 pb-8">
      {/* パンくず：フクエスワーク › {サロン名}の求人 › 新着情報 */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <Link href={`/jobs/${jobId}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#059669' }}>
          {job.salon.name}の求人
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="flex-shrink-0 whitespace-nowrap font-semibold" style={{ color: '#4D7C0F' }}>
          新着情報
        </span>
      </nav>

      {/* 見出し */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
          <h1 className="text-lg font-extrabold text-slate-900 break-words min-w-0">
            {job.salon.name}の新着情報
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-1.5 pl-3.5">{pageNum}ページ目 / 全{totalPages}ページ</p>
      </div>

      <JobNewsList rows={rows} />

      <WorkNewsPager jobId={jobId} page={pageNum} totalPages={totalPages} />

      {/* 求人詳細へ戻る導線 */}
      <div className="mt-8 text-center">
        <Link
          href={`/jobs/${jobId}`}
          className="inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-xl border transition-colors hover:bg-emerald-50"
          style={{ borderColor: '#6EE7B7', color: '#059669' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          求人詳細に戻る
        </Link>
      </div>
    </main>
  );
}
