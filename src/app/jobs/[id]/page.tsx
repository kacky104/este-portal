import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { areaLabel } from '@/app/lib/areaLabel';
import { fetchJobById, employmentTypeLabel, type JobDetail } from '@/app/lib/jobs';
import { ApplyForm } from './ApplyForm';

const SITE_URL = 'https://fukues.com';

// ISR：10分ごとに再生成。Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

// id が数値でなければ null（呼び出し側で notFound）。
function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

// 相対表現やHTMLを除いたプレーンテキストを N 字前後に切り詰める（metadata description 用）。
function truncatePlain(text: string | null, max: number): string {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const jobId = parseId(id);
  if (jobId === null) return {};
  const job = await fetchJobById(jobId);
  if (!job) return {};

  // title は layout の template「%s｜フクエスワーク」に合成される。
  const title = `${job.title}｜${job.salon.name}のセラピスト求人`;
  const description =
    truncatePlain(job.description, 90) ||
    `${job.salon.name}（${areaLabel(job.salon.area)}）のセラピスト求人。${employmentTypeLabel(job.employmentType)}／${job.salaryText}`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  };
}

// JobPosting 構造化データ（このページの本丸）。データ取得・出力内容はブランド分離では変更しない。
// validThrough は常時掲載方針のため出力しない（期限切れ放置はGoogleの品質違反）。
function buildJobPostingJsonLd(job: JobDetail): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    // description は改行を <br> に変換（schema.org は description に HTML を許容）。
    description: (job.description ?? '').replace(/\n/g, '<br>'),
    employmentType: job.employmentType,
    hiringOrganization: {
      '@type': 'Organization',
      name: job.salon.name,
      sameAs: `${SITE_URL}/salon/${job.salon.id}`,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressRegion: '福岡県',
        addressLocality: job.salon.area || undefined,
        streetAddress: job.salon.address || undefined,
        addressCountry: 'JP',
      },
    },
    // サイト内でWEB応募が完結するため true（フェーズ3で応募フォーム実装済み）。
    directApply: true,
  };

  // datePosted：published_at の日付部分（ISO 8601）。
  if (job.publishedAt) {
    ld.datePosted = job.publishedAt.slice(0, 10);
  }

  // baseSalary：salary_min / salary_max が両方入っている場合のみ出力。
  // 単位は日給想定で DAY 固定（フェーズ2で単位カラム追加を検討）。
  if (job.salaryMin !== null && job.salaryMax !== null) {
    ld.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'JPY',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        unitText: 'DAY',
      },
    };
  }

  return ld;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = parseId(id);
  if (jobId === null) notFound();

  const job = await fetchJobById(jobId);
  if (!job) notFound();

  const jsonLd = buildJobPostingJsonLd(job);
  // </script> によるスクリプト早期終了を防ぐため < をエスケープしてから埋め込む。
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <>
      {/* JobPosting 構造化データ */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* パンくず：フクエスワーク › {求人タイトル} */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
            フクエスワーク
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="inline-block max-w-[60%] truncate align-middle font-semibold" style={{ color: '#4D7C0F' }}>
            {job.title}
          </span>
        </nav>

        {/* ヘッダーカード：雇用形態・タイトル・店名 */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}>
              {employmentTypeLabel(job.employmentType)}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug break-words">{job.title}</h1>

          {/* 店名（本体フクエスのサロン詳細へリンク）＋エリア */}
          <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
            <Link href={`/salon/${job.salon.id}`} className="font-bold hover:opacity-80 transition-opacity break-words" style={{ color: '#059669' }}>
              {job.salon.name}
            </Link>
            {job.salon.area && (
              <span className="inline-flex items-center gap-0.5 text-slate-400 text-xs">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {areaLabel(job.salon.area)}
              </span>
            )}
          </div>
        </div>

        {/* 募集要項（項目ごと・null/空は非表示） */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm mt-4">
          <dl className="divide-y divide-slate-100">
            <JobField label="給与" value={job.salaryText} highlight />
            <JobField label="勤務時間" value={job.workHours} />
            <JobField label="応募資格" value={job.requirements} />
            <JobField label="待遇" value={job.benefits} />
            <JobField label="アクセス" value={job.access} />
            <JobField label="住所" value={job.salon.address} />
          </dl>
        </div>

        {/* 仕事内容（改行保持） */}
        {job.description && (
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm mt-4">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
              <h2 className="font-bold text-slate-900">仕事内容</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{job.description}</p>
          </div>
        )}

        {/* 応募導線：WEB応募（サイト内完結）を主導線に、電話応募も残す。 */}
        <div className="mt-6 space-y-3">
          {/* WEBで応募する（グリーン基調・主導線） */}
          <ApplyForm jobId={job.id} />

          {job.salon.phone && (
            <a
              href={`tel:${job.salon.phone}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold border transition-colors hover:bg-emerald-50"
              style={{ borderColor: '#6EE7B7', color: '#059669' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
              お店に電話で応募する
            </a>
          )}
          {/* 本体フクエスへ渡る導線（サイトを跨ぐことが分かる文言に） */}
          <Link
            href={`/salon/${job.salon.id}`}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border text-sm font-bold hover:bg-emerald-50 transition-colors"
            style={{ borderColor: '#6EE7B7', color: '#059669' }}
          >
            フクエスで店舗情報を見る
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <Link href="/jobs" className="text-sm text-slate-500 hover:text-emerald-600 transition-colors">
            ← 求人一覧へ戻る
          </Link>
        </div>
      </main>
    </>
  );
}

/* ── Helper ─────────────────────────────────────────── */
function JobField({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-3">
      <dt className="flex-shrink-0 w-20 text-xs font-bold text-slate-400 pt-0.5">{label}</dt>
      <dd className="text-sm min-w-0 break-words whitespace-pre-wrap" style={highlight ? { color: '#059669', fontWeight: 700 } : { color: '#334155' }}>{value}</dd>
    </div>
  );
}
