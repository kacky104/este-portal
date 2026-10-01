import Link from 'next/link';
import { type JobDetail } from '@/app/lib/jobs';
import { getWorkColumnFile } from '@/app/lib/workColumnFiles';
import { getWorkGlossaryEntry } from '@/app/lib/workGlossary';
import { ArticleCard } from '../column/ArticleCard';

// ★ 第1055便（2026-10-01・カッキーさん）: 求人詳細の下に「次に行く場所」を置く。
//   1) 同じエリアの他の求人 → ★ 第1063便で撤去（カッキーさん「自店のページに他店の広告は反感を買う」）。
//      求人詳細＝そのお店のページなので、他店の求人は出さない。
//   2) 応募前に読んでおきたいコラム（3本・求人の特徴タグから選ぶ）
//   3) この求人でよく出る用語（3語・特徴タグから選ぶ）
//   求人同士・コラム・用語集のつながり（内部リンク）を検索エンジンにも伝える。
//   コラム・用語は md（リポジトリ）から読むので DB は増えない。DB は読まない。

const MAX_COLUMNS = 3;
const MAX_TERMS = 3;

// 特徴タグ（salon_jobs.features の slug）→ 関連コラム slug。先に出たタグほど優先。
const FEATURE_TO_COLUMN: Record<string, string> = {
  mikeiken: 'beginner-interview-guide',
  taiken: 'taiken-guide',
  'shuccho-senmon': 'dispatch-vs-store-type',
  'w-work': 'side-job-guide',
  hibarai: 'payment-cycle-guide',
  'high-back': 'salary-back-rate',
  hosho: 'benefits-guide',
  'jiyu-shukkin': 'work-guide',
  keikensha: 'shimei-repeat-tips',
};
const DEFAULT_COLUMNS = ['pre-apply-checklist', 'interview-questions-guide', 'salary-back-rate'];

// 特徴タグ → 用語集 slug。
const FEATURE_TO_TERM: Record<string, string> = {
  hibarai: 'hibarai',
  hosho: 'hosho',
  'koshitsu-taiki': 'taiki',
  sogei: 'sogei',
  'jiyu-shukkin': 'jiyu-shukkin',
  taiken: 'taiken-nyuten',
  'shuccho-senmon': 'shuccho-gata',
  'high-back': 'back-ritsu',
  'w-work': 'kakemochi',
  'jitaku-haken-nashi': 'room-haken',
};
const DEFAULT_TERMS = ['back-ritsu', 'hosho', 'mensetsu'];

// タグ順に候補を集め、重複を除いて先頭 n 件。足りなければ既定で埋める。
function pickSlugs(features: string[], map: Record<string, string>, defaults: string[], n: number): string[] {
  const out: string[] = [];
  for (const f of [...features.map((s) => map[s]).filter(Boolean), ...defaults]) {
    if (!out.includes(f)) out.push(f);
    if (out.length >= n) break;
  }
  return out;
}

export function JobRelatedLinks({ job }: { job: JobDetail }) {
  const columns = pickSlugs(job.features, FEATURE_TO_COLUMN, DEFAULT_COLUMNS, MAX_COLUMNS)
    .map((slug) => getWorkColumnFile(slug))
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .map(({ body, ...rest }) => { void body; return rest; });

  const terms = pickSlugs(job.features, FEATURE_TO_TERM, DEFAULT_TERMS, MAX_TERMS)
    .map((slug) => getWorkGlossaryEntry(slug)?.meta ?? null)
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return (
    <>
      {columns.length > 0 && (
        <section className="mt-8" aria-labelledby="related-columns">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="related-columns" className="font-bold text-slate-900">応募前に読んでおきたいコラム</h2>
            <Link href="/jobs/column" className="flex-shrink-0 text-xs font-bold hover:opacity-80 transition-opacity" style={{ color: '#059669' }}>
              コラム一覧 →
            </Link>
          </div>
          <ul className="space-y-3">
            {columns.map((a) => (
              <li key={a.slug}>
                <ArticleCard article={a} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {terms.length > 0 && (
        <section className="mt-8 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm" aria-labelledby="related-terms">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="related-terms" className="font-bold text-slate-900">この求人でよく出る用語</h2>
            <Link href="/jobs/glossary" className="flex-shrink-0 text-xs font-bold hover:opacity-80 transition-opacity" style={{ color: '#059669' }}>
              用語集 →
            </Link>
          </div>
          <ul className="divide-y divide-emerald-50">
            {terms.map((m) => (
              <li key={m.slug}>
                <Link href={`/jobs/glossary/${m.slug}`} className="block py-2.5 hover:bg-emerald-50/60 -mx-2 px-2 rounded-lg transition-colors">
                  <span className="font-bold text-sm" style={{ color: '#059669' }}>{m.term}</span>
                  <span className="block text-xs text-slate-600 mt-0.5 leading-relaxed">{m.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
