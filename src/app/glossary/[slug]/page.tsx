import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, areaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { extractArticleHeadings, TOC_MIN_HEADINGS, type ArticleHeading } from '@/app/lib/articleToc';
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { getAllGlossaryMeta, getGlossaryEntry, GLOSSARY_POLICY_NOTE } from '@/app/lib/glossary';
import { GLOSSARY_CATEGORIES } from '@/lib/glossaryParse';
import { ArticleBody } from '@/app/column/ArticleBody';
import { ArticleToc } from '@/app/column/ArticleToc';
import { formatColumnDate } from '@/app/column/format';

// ★★★ メンズエステ用語集の1語ページ（/glossary/[slug]・第349便・2026-09-13）
//
// ★ 見た目はコラム詳細（/column/[slug]）の作りをそのまま写している（ピンクテーマ・目次・本文・
//   著者・末尾の導線）。部品（ArticleBody・ArticleToc）も同じもの。★ 新しい見た目を作らない。
// ★ 文章は DB ではなく src/content/glossary/<slug>.md（ビルド時に読む・静的生成）。
// ★ ページの順番: リード → 本文（書き手が書く）→ よくある質問 → 関連する用語 → 著者 → 方針文 → 導線。
//   「よくある質問」「関連する用語」は本文に書かず frontmatter からここで作る:
//     - FAQ は画面と FAQPage の JSON-LD が同じ配列から出る（表示と構造化データがずれない）
//     - 関連する用語は【ファイルが存在する語だけ】出す（1日1語で増やすので、未公開の語へ 404 を出さない）

const SITE_URL = 'https://fukues.com';
const AUTHOR_NAME = 'フクエス編集部';
const H2_CLASS =
  'scroll-mt-20 text-xl sm:text-2xl font-extrabold text-slate-900 mt-10 mb-4 pb-2 border-b border-pink-100 flex items-center gap-2.5';

export function generateStaticParams() {
  return getAllGlossaryMeta().map((m) => ({ slug: m.slug }));
}

// 未知の slug は 404（ファイルが無い語のURLを動的に生成しない）。
export const dynamicParams = false;

function pageTitle(term: string): string {
  // ★ ルートの layout は title が固定文字列で template を持たない。/glossary 配下にも layout は
  //   無いので、フルタイトルをここで書く（/column は自分の layout に template を持つ・別の作り）。
  return `${term}とは？意味と福岡のメンズエステでの実際｜フクエス`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getGlossaryEntry(slug);
  if (!entry) return {};
  const { meta } = entry;
  const title = pageTitle(meta.term);
  const shareImage = meta.heroImage ? `${SITE_URL}${meta.heroImage}` : `${SITE_URL}/ogp.png`;
  return {
    title,
    description: meta.description,
    alternates: { canonical: `/glossary/${meta.slug}` },
    openGraph: {
      title,
      description: meta.description,
      url: `${SITE_URL}/glossary/${meta.slug}`,
      siteName: 'フクエス',
      type: 'article',
      images: [{ url: shareImage }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: meta.description,
      images: [shareImage],
    },
  };
}

export default async function GlossaryTermPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getGlossaryEntry(slug);
  if (!entry) notFound();
  const { meta, body, related } = entry;

  // 目次: 本文の h2 ＋ テンプレートが足す節（FAQ・関連語）。
  const headings: ArticleHeading[] = [...extractArticleHeadings(body)];
  if (meta.faq.length > 0) headings.push({ id: 'faq', text: 'よくある質問' });
  if (related.length > 0) headings.push({ id: 'related', text: '関連する用語' });
  const showToc = headings.length >= TOC_MIN_HEADINGS;

  // エリアチップ: frontmatter の areas（slug）で触れたエリアを先頭に、残りは AREA_ORDER 順。
  const allAreas = AREA_ORDER.filter((a) => a !== ALL_AREA);
  const mentioned = meta.areas.map((s) => allAreas.find((a) => areaHref(a) === `/area/${s}`)).filter((a): a is (typeof allAreas)[number] => !!a);
  const areaLinks = [...mentioned, ...allAreas.filter((a) => !mentioned.includes(a))];

  const publishedIso = `${meta.publishedAt}T00:00:00+09:00`;

  const termJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'DefinedTerm',
    '@id': `${SITE_URL}/glossary/${meta.slug}`,
    name: meta.term,
    description: meta.summary,
    url: `${SITE_URL}/glossary/${meta.slug}`,
    inDefinedTermSet: { '@type': 'DefinedTermSet', '@id': `${SITE_URL}/glossary#set`, name: 'メンズエステ用語集' },
  };
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'フクエス', path: '/' },
    { name: '用語集', path: '/glossary' },
    { name: meta.term, path: `/glossary/${meta.slug}` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(termJsonLd) }} />
      {meta.faq.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildFaqPageJsonLd(meta.faq)) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(breadcrumbJsonLd) }} />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* パンくず：フクエス › 用語集 › 用語 */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
            フクエス
          </Link>
          <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
          <Link href="/glossary" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
            用語集
          </Link>
          <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
          <span aria-current="page" className="flex-1 min-w-0 truncate font-semibold text-pink-700">
            {meta.term}
          </span>
        </nav>

        <article>
          {/* カテゴリバッジ → h1 → 読み・日付 */}
          <div className="mb-3">
            <Link
              href={`/glossary#cat-${meta.category}`}
              className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200"
            >
              {GLOSSARY_CATEGORIES[meta.category]}
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug break-words">
            「{meta.term}」とは？
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>読み: {meta.reading}</span>
            <time dateTime={meta.publishedAt}>公開: {formatColumnDate(publishedIso)}</time>
          </div>

          {/* ヒーロー画像（public に有るときだけ。無ければ何も出ない） */}
          {meta.heroImage && (
            <div className="mt-5 rounded-2xl overflow-hidden shadow-md border border-pink-100">
              <Image
                src={meta.heroImage}
                alt={`${meta.term}のイメージ`}
                width={1200}
                height={630}
                priority
                sizes="(max-width: 768px) 100vw, 768px"
                className="w-full h-auto aspect-video object-cover"
              />
            </div>
          )}

          {showToc && <ArticleToc headings={headings} />}

          {/* 本文（Markdown・本文中の画像あり） */}
          <div className="mt-6">
            <ArticleBody body={body} allowImages />
          </div>

          {/* よくある質問（frontmatter の faq。★ 閉じない＝FAQPage の内容と同じものを常に表示） */}
          {meta.faq.length > 0 && (
            <section>
              <h2 id="faq" className={H2_CLASS}>
                <span className="w-1.5 h-6 rounded-full flex-shrink-0 bg-gradient-to-b from-pink-400 to-rose-500" />
                よくある質問
              </h2>
              <dl className="space-y-5">
                {meta.faq.map((f) => (
                  <div key={f.q} className="rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
                    <dt className="font-bold text-slate-900 text-[15px] leading-7">Q. {f.q}</dt>
                    <dd className="mt-2 text-[15px] leading-8 text-slate-700">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* 関連する用語（存在する語だけ） */}
          {related.length > 0 && (
            <section>
              <h2 id="related" className={H2_CLASS}>
                <span className="w-1.5 h-6 rounded-full flex-shrink-0 bg-gradient-to-b from-pink-400 to-rose-500" />
                関連する用語
              </h2>
              <ul className="space-y-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/glossary/${r.slug}`}
                      className="block rounded-xl border border-pink-100 bg-white px-4 py-3 hover:bg-pink-50 transition-colors"
                    >
                      <span className="font-bold text-pink-700">{r.term}</span>
                      <span className="ml-1.5 text-xs text-slate-400">（{r.reading}）</span>
                      <span className="block mt-0.5 text-sm text-slate-600 leading-relaxed">{r.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 著者表記（コラム詳細と同じ） */}
          <div className="mt-10 rounded-2xl border border-pink-100 bg-pink-50/40 p-5 flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-white border border-pink-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/column/author-fukues.webp"
                width={256}
                height={256}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">{AUTHOR_NAME}</p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                福岡メンズエステポータルサイト「フクエス」の編集部です。メンズエステをもっと楽しむための情報をお届けします。
              </p>
            </div>
          </div>

          {/* 方針文（★ 1回だけ。本文には書かない） */}
          <p className="mt-4 rounded-2xl border border-pink-100 bg-pink-50/40 p-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
            {GLOSSARY_POLICY_NOTE}
          </p>
        </article>

        {/* サロン探しへの導線：トップCTA＋エリアページ（コラム詳細と同じ） */}
        <section className="mt-10 rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
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

        <div className="mt-8 text-center">
          <Link href="/glossary" className="text-sm text-slate-500 hover:text-pink-600 transition-colors">
            ← 用語集へ戻る
          </Link>
        </div>
      </main>
    </>
  );
}
