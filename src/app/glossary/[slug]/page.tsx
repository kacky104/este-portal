import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { extractArticleHeadings, TOC_MIN_HEADINGS, type ArticleHeading } from '@/app/lib/articleToc';
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { getAllGlossaryMeta, getGlossaryEntry } from '@/app/lib/glossary';
import { GLOSSARY_CATEGORIES, KANA_ROW_IDS, kanaRow } from '@/lib/glossaryParse';
import { ArticleBody } from '@/app/column/ArticleBody';
import { ArticleToc } from '@/app/column/ArticleToc';
import { GlossaryCardGrid, toCardData } from '../GlossaryCard';
import { GlossaryNotice } from '../GlossaryNotice';
import { GlossaryCta } from '../GlossaryCta';
import styles from '../glossary.module.css';

// ★★★ メンズエステ用語集の1語ページ（/glossary/[slug]・第349便で新設・第354便でリデザイン）
//
// ★ 文章は DB ではなく src/content/glossary/<slug>.md（ビルド時に読む・静的生成）。
// ★ 第354便のリデザイン（2026-09-13・カッキーさんの指示書）:
//     パンくず → 定義カード（GLOSSARY／カテゴリ／h1／読み／定義文／か行へ戻る）→ 目次
//     → 本文カード → よくある質問 → 関連する用語 → 著者 → 注意文 → 用語集へ戻る → 店舗検索CTA
//   ・見た目はハブ（/glossary）と同じ glossary.module.css のトークンを使い回す（色・直角・カード）。
//   ・注意文と店舗検索CTAは GlossaryNotice / GlossaryCta に切り出してハブと共用にした。
//   ・関連する用語はハブと同じ GlossaryCard。
//   ・本文（ArticleBody）は /column と共用の部品なので触らず、.termArticle の中だけ字を大きくしている。
// ★★ 第358便: 【公開日をページに出すのをやめた】（カッキーさんの指示）。
//   ★ 理由: 用語集は辞典なので日付が古びる。「健全店とは」の意味は来年も変わらないのに、
//     公開日が出ていると時間が経つほど「古い記事」に見える。
//   ★ 構造化データは失われない（DefinedTerm に公開日の項目がそもそも無い。Article とは違う）。
//   ★★ frontmatter の publishedAt は【残す】。sitemap.xml の lastmod がこれを使っている。
//     ★ 消すとファイルの更新時刻から取るしかなくなり、git は更新時刻を保存しないので
//       デプロイのたびに全ページが「たった今更新された」ことになる（第24便で直した嘘の lastmod）。
//   ★ 将来 書き直したときに出すなら updatedAt を足して「最終更新」として出す。
// ★ 変えていないもの: title / description / canonical / OGP / パンくず / JSON-LD 3本 /
//   URL / 本文の文章 / #row-ka への戻りリンク / h1 の文言（第350便）。
//
// ★ ページの順番の考え方: 本文は「書き手が書く部分」、その後ろ（FAQ・関連語・戻る導線）は
//   「テンプレートが frontmatter から作る部分」。切れ目を1つにしておくと、語が増えても迷わない。

const SITE_URL = 'https://fukues.com';
const AUTHOR_NAME = 'フクエス編集部';

export function generateStaticParams() {
  return getAllGlossaryMeta().map((m) => ({ slug: m.slug }));
}

// 未知の slug は 404（ファイルが無い語のURLを動的に生成しない）。
export const dynamicParams = false;

function pageTitle(term: string): string {
  // ★ ルートの layout は title が固定文字列で template を持たない。/glossary 配下の layout にも
  //   metadata を置いていない（置くと「｜フクエス」が二重になる）ので、フルタイトルをここで書く。
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

  // 「か行の用語一覧へ戻る」。★ 健全店に決め打ちせず、読みから行を出す（どの語でも効く）。
  const row = kanaRow(meta.reading);
  const rowId = KANA_ROW_IDS[row] ?? 'other';
  const rowLabel = row === 'その他' ? 'その他' : `${row}行`;

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

      <main className={styles.page}>
        {/* パンくず：フクエス › 用語集 › 用語 */}
        <nav aria-label="パンくず" className={styles.crumbs}>
          <Link href="/" className={styles.crumbLink}>フクエス</Link>
          <span aria-hidden="true" className={styles.crumbSep}>›</span>
          <Link href="/glossary" className={styles.crumbLink}>用語集</Link>
          <span aria-hidden="true" className={styles.crumbSep}>›</span>
          <span aria-current="page" className={styles.crumbCurrent}>{meta.term}</span>
        </nav>

        {/* ── 定義カード ── */}
        <section className={styles.termHero} aria-labelledby="glossary-term-title">
          {/* 右上の線画（本と虫眼鏡）。装飾なので読み上げない。 */}
          <span className={styles.termHeroMark} aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 14h16a6 6 0 0 1 6 6v28a6 6 0 0 0-6-6H10V14Z" />
              <path d="M54 14H38a6 6 0 0 0-6 6v28a6 6 0 0 1 6-6h16V14Z" />
              <circle cx="44" cy="40" r="9" />
              <path d="m51 47 7 7" />
            </svg>
          </span>

          <div className={styles.termHeroInner}>
            <p className={styles.eyebrow}>GLOSSARY</p>
            <Link href="/glossary" className={styles.termBadge}>
              {GLOSSARY_CATEGORIES[meta.category]}
            </Link>

            {/* h1 に「メンズエステの」を前置き（第350便）。title には「メンズエステ」が入っているが h1 に
                無かった。一般的な検索（メンズエステ ○○ とは）への一致を h1 側でも揃える。 */}
            <h1 id="glossary-term-title" className={styles.termTitle}>
              メンズエステの「{meta.term}」とは？
            </h1>
            <p className={styles.termReading}>読み: {meta.reading}</p>

            {/* 定義文（frontmatter の summary）。★ 一覧のカードに出しているものと同じ1文。 */}
            <p className={styles.termLead}>{meta.summary}</p>

            <div className={styles.termMetaRow}>
              <Link href={`/glossary#row-${rowId}`} className={styles.termRowLink}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                {rowLabel}の用語一覧へ戻る
              </Link>
            </div>
          </div>
        </section>

        {/* ── 読み物の列（本文・FAQ・関連語） ── */}
        <div className={styles.termColumn}>
          {/* ヒーロー画像（public に有るときだけ。無ければ何も出ない） */}
          {meta.heroImage && (
            <div className={`${styles.section}`}>
              <Image
                src={meta.heroImage}
                alt={`${meta.term}のイメージ`}
                width={1200}
                height={630}
                priority
                sizes="(max-width: 800px) 100vw, 800px"
                className="w-full h-auto border border-pink-100"
              />
            </div>
          )}

          {showToc && <ArticleToc headings={headings} />}

          {/* 本文（Markdown・本文中の画像あり） */}
          <article className={`${styles.termArticle} ${styles.section}`}>
            <ArticleBody body={body} allowImages />
          </article>

          {/* よくある質問（frontmatter の faq。★ 閉じない＝FAQPage の内容と同じものを常に表示） */}
          {meta.faq.length > 0 && (
            <section className={styles.section} aria-labelledby="faq">
              <h2 id="faq" className={styles.h2}>
                <span className={styles.h2Bar} aria-hidden="true" />
                よくある質問
              </h2>
              <div className={styles.faqList}>
                {meta.faq.map((f) => (
                  <div key={f.q} className={styles.faqItem}>
                    <p className={styles.faqQ}><span>{f.q}</span></p>
                    <p className={styles.faqA}><span>{f.a}</span></p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 関連する用語（存在する語だけ・一覧と同じカード） */}
          {related.length > 0 && (
            <section className={styles.section} aria-labelledby="related">
              <h2 id="related" className={styles.h2}>
                <span className={styles.h2Bar} aria-hidden="true" />
                関連する用語
              </h2>
              <GlossaryCardGrid items={related.map(toCardData)} dense />
            </section>
          )}

          {/* 著者表記 */}
          <div className={`${styles.author} ${styles.section}`}>
            <div className={styles.authorIcon}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/column/author-fukues.webp" width={256} height={256} alt="" loading="lazy" decoding="async" />
            </div>
            <div className="min-w-0">
              <p className={styles.authorName}>{AUTHOR_NAME}</p>
              <p className={styles.authorText}>
                福岡メンズエステポータルサイト「フクエス」の編集部です。メンズエステをもっと楽しむための情報をお届けします。
              </p>
            </div>
          </div>

          {/* 掲載店舗についての方針文（1回だけ・ハブと共通の部品） */}
          <GlossaryNotice className={styles.section} />

          {/* 用語集へ戻る導線（ブラウザの「戻る」に頼らせない） */}
          <nav className={`${styles.backLinks} ${styles.section}`} aria-label="用語集へ戻る">
            <Link href="/glossary" className={styles.backPrimary}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              メンズエステ用語集に戻る
            </Link>
            <Link href={`/glossary#row-${rowId}`} className={styles.backSecondary}>
              {rowLabel}の用語を見る
            </Link>
          </nav>
        </div>

        {/* 店舗検索CTA（ハブと共通の部品・ページ幅いっぱい） */}
        <GlossaryCta areas={meta.areas} className={styles.section} />
      </main>
    </>
  );
}
