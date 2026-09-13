import Link from 'next/link';
import type { Metadata } from 'next';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, areaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { buildBreadcrumbJsonLd, buildItemListJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { getAllGlossaryMeta, GLOSSARY_POLICY_NOTE } from '@/app/lib/glossary';
import {
  GLOSSARY_CATEGORY_ORDER,
  GLOSSARY_CATEGORIES,
  KANA_ROWS,
  KANA_ROW_OTHER,
  kanaRow,
  sortByReading,
  type GlossaryMeta,
} from '@/lib/glossaryParse';
import { ColumnHeading } from '@/app/column/ColumnHeading';

// ★★★ メンズエステ用語集のハブ（/glossary・第349便・2026-09-13）
//
// ★ カテゴリ別の一覧 ＋ 五十音順の一覧。語は src/content/glossary/*.md（DB 不使用・静的生成）。
// ★ 見出しブロックはコラム一覧と同じ ColumnHeading（eyebrow だけ GLOSSARY）。
// ★ 語が0のカテゴリ・行は節ごと出さない（1日1語で増やす途中でも空の見出しが並ばない）。

const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'メンズエステ用語集';
// ★ 画面の説明文と <meta description> は同じ1本（コラム一覧と同じ作り）。
const PAGE_DESC =
  'メンズエステで見かける言葉を、1語ずつやさしく解説する用語集です。お店の種類、施術やコース、料金と予約、セラピストの出勤情報、マナーまで。意味が分かると、福岡でのお店選びがぐっと楽になります。';

export const metadata: Metadata = {
  // ★ ルートの layout は title の template を持たないのでフルタイトルを書く。
  title: `${PAGE_TITLE}｜フクエス`,
  description: PAGE_DESC,
  alternates: { canonical: '/glossary' },
  openGraph: {
    title: `${PAGE_TITLE}｜フクエス`,
    description: PAGE_DESC,
    url: `${SITE_URL}/glossary`,
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: `${SITE_URL}/ogp.png` }],
  },
};

const ROW_IDS: Record<string, string> = {
  あ: 'a', か: 'ka', さ: 'sa', た: 'ta', な: 'na', は: 'ha', ま: 'ma', や: 'ya', ら: 'ra', わ: 'wa', [KANA_ROW_OTHER]: 'other',
};

function TermCard({ m }: { m: GlossaryMeta }) {
  return (
    <Link
      href={`/glossary/${m.slug}`}
      className="block rounded-2xl border border-pink-100 bg-white px-4 py-3.5 shadow-sm hover:bg-pink-50 transition-colors"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-bold text-pink-700 text-[15px]">{m.term}</span>
        <span className="text-xs text-slate-400">（{m.reading}）</span>
        {m.major && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">主要</span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600 leading-relaxed">{m.summary}</p>
    </Link>
  );
}

export default function GlossaryHubPage() {
  const all = getAllGlossaryMeta();

  // カテゴリ別（語のあるカテゴリだけ）
  const byCategory = GLOSSARY_CATEGORY_ORDER
    .map((key) => ({ key, label: GLOSSARY_CATEGORIES[key], items: all.filter((m) => m.category === key) }))
    .filter((c) => c.items.length > 0);

  // 五十音別（語のある行だけ・行内は読みの順）
  const sorted = sortByReading(all);
  const rows = [...KANA_ROWS, KANA_ROW_OTHER]
    .map((row) => ({ row, id: ROW_IDS[row], items: sorted.filter((m) => kanaRow(m.reading) === row) }));
  const rowsWithItems = rows.filter((r) => r.items.length > 0);
  const rowHasItems = new Set(rowsWithItems.map((r) => r.row));

  const areaLinks = AREA_ORDER.filter((a) => a !== ALL_AREA);

  const setJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'DefinedTermSet',
    '@id': `${SITE_URL}/glossary#set`,
    name: PAGE_TITLE,
    description: PAGE_DESC,
    url: `${SITE_URL}/glossary`,
  };
  // ItemList は画面の並び（カテゴリ別の順）と同じ順・同じ件数。
  const itemListJsonLd = buildItemListJsonLd(
    byCategory.flatMap((c) => c.items.map((m) => ({ name: m.term, path: `/glossary/${m.slug}` }))),
    { name: PAGE_TITLE },
  );

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエス', path: '/' },
        { name: '用語集', path: '/glossary' },
      ])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(setJsonLd) }} />
      {all.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(itemListJsonLd) }} />
      )}

      {/* パンくず：フクエス › 用語集 */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
          フクエス
        </Link>
        <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
        <span aria-current="page" className="font-semibold text-pink-700">
          用語集
        </span>
      </nav>

      <ColumnHeading title={PAGE_TITLE} description={PAGE_DESC} eyebrow="GLOSSARY" />

      {/* 五十音のナビ（語のある行だけリンク） */}
      <nav aria-label="五十音で探す" className="flex flex-wrap justify-center gap-2 mb-8">
        {[...KANA_ROWS].map((row) =>
          rowHasItems.has(row) ? (
            <a
              key={row}
              href={`#row-${ROW_IDS[row]}`}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-pink-200 text-pink-600 text-sm font-bold hover:bg-pink-50 transition-colors"
            >
              {row}
            </a>
          ) : (
            <span
              key={row}
              aria-disabled
              className="w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 text-slate-300 text-sm font-bold"
            >
              {row}
            </span>
          ),
        )}
      </nav>

      {all.length === 0 ? (
        <div className="rounded-2xl border border-pink-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
          用語集は準備中です。
        </div>
      ) : (
        <>
          {/* カテゴリ別 */}
          {byCategory.map((c) => (
            <section key={c.key} className="mb-10">
              <h2
                id={`cat-${c.key}`}
                className="scroll-mt-20 text-xl sm:text-2xl font-extrabold text-slate-900 mb-4 pb-2 border-b border-pink-100 flex items-center gap-2.5"
              >
                <span className="w-1.5 h-6 rounded-full flex-shrink-0 bg-gradient-to-b from-pink-400 to-rose-500" />
                {c.label}
              </h2>
              <ul className="space-y-3">
                {c.items.map((m) => (
                  <li key={m.slug}>
                    <TermCard m={m} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* 五十音順 */}
          <section className="mb-10">
            <h2 className="scroll-mt-20 text-xl sm:text-2xl font-extrabold text-slate-900 mb-4 pb-2 border-b border-pink-100 flex items-center gap-2.5">
              <span className="w-1.5 h-6 rounded-full flex-shrink-0 bg-gradient-to-b from-pink-400 to-rose-500" />
              五十音順
            </h2>
            {rowsWithItems.map((r) => (
              <div key={r.row} className="mb-6">
                <h3 id={`row-${r.id}`} className="scroll-mt-20 text-base font-bold text-slate-800 mb-2">
                  {r.row === KANA_ROW_OTHER ? KANA_ROW_OTHER : `${r.row}行`}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {r.items.map((m) => (
                    <li key={m.slug}>
                      <Link
                        href={`/glossary/${m.slug}`}
                        className="inline-block text-sm font-bold px-3 py-1.5 rounded-full border border-pink-200 text-pink-600 hover:bg-pink-50 transition-colors"
                      >
                        {m.term}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      {/* 方針文（1回） */}
      <p className="rounded-2xl border border-pink-100 bg-pink-50/40 p-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
        {GLOSSARY_POLICY_NOTE}
      </p>

      {/* 導線：用語解説のコラム＋サロン探し */}
      <div className="mt-8 text-center">
        <Link href="/column/category/glossary" className="text-sm font-semibold underline underline-offset-2 text-pink-600 hover:opacity-80">
          用語解説のコラムも読む →
        </Link>
      </div>

      <section className="mt-8 rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
          <h2 className="font-bold text-slate-900">福岡のメンズエステを探す</h2>
        </div>
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(to right,#ec4899,#f97316)' }}
        >
          店舗一覧を見る
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
        <div className="mt-4 flex flex-wrap gap-2">
          {areaLinks.map((area) => (
            <Link
              key={area}
              href={areaHref(area)}
              className="text-xs font-bold px-3 py-1.5 rounded-full border border-pink-200 text-pink-600 transition-colors hover:bg-pink-50"
            >
              {area === DISPATCH_AREA ? '出張対応' : areaLabel(area)}の店舗
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
