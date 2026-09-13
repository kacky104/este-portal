import Link from 'next/link';
import type { Metadata } from 'next';
import { buildBreadcrumbJsonLd, buildItemListJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { getAllGlossaryMeta } from '@/app/lib/glossary';
import {
  KANA_ROWS,
  KANA_ROW_OTHER,
  KANA_ROW_IDS,
  kanaRow,
  sortByReading,
} from '@/lib/glossaryParse';
import { GlossaryExplorer } from './GlossaryExplorer';
import { GlossaryCardGrid, toCardData } from './GlossaryCard';
import { KanaNav } from './KanaNav';
import { GlossaryNotice } from './GlossaryNotice';
import { GlossaryCta } from './GlossaryCta';
import styles from './glossary.module.css';

// ★★★ メンズエステ用語集のハブ（/glossary・第349便で新設・第352便でリデザイン）
//
// ★ 語は src/content/glossary/*.md（DB 不使用・静的生成）。読み取りは src/app/lib/glossary.ts。
// ★ 第352便のリデザイン（2026-09-13・カッキーさんの指示書）:
//     - ヒーロー（白→淡ピンクのカード・検索欄つき）→ 五十音ナビ（白い横長カード・PC は sticky）
//       → 五十音順（行ごとのカード）→ 注意文 → コラム導線 → 店舗検索 CTA
//     ★ 第353便（カッキーさんの指示）で「業態・お店の種類」の節と「重要」バッジを外した。
//       一覧は【五十音順の1本】だけ。カテゴリのキー（frontmatter の category）はデータとしては残る。
//     - 検索（用語名・読み・説明文）は GlossaryExplorer（Client）。検索中は「検索結果」1本に。
//     - 見た目は glossary.module.css に閉じ込める。globals.css・共通ヘッダー/フッターは触らない。
//     - title / description / canonical / パンくず / JSON-LD / URL / アンカー（#row-ka …）は変えていない。
// ★ 語が0の行は出さない（1日1語で増やす途中でも空の見出しが並ばない）。

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

export default function GlossaryHubPage() {
  const all = getAllGlossaryMeta();
  const cards = all.map(toCardData);

  // 五十音別（語のある行だけ・行内は読みの順）
  const sorted = sortByReading(all).map(toCardData);
  const rows = [...KANA_ROWS, KANA_ROW_OTHER]
    .map((row) => ({ row, id: KANA_ROW_IDS[row], items: sorted.filter((m) => kanaRow(m.reading) === row) }))
    .filter((r) => r.items.length > 0);
  const rowsWithItems = rows.map((r) => r.row);

  const setJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'DefinedTermSet',
    '@id': `${SITE_URL}/glossary#set`,
    name: PAGE_TITLE,
    description: PAGE_DESC,
    url: `${SITE_URL}/glossary`,
  };
  // ItemList は画面の並び（五十音順）と同じ順・同じ件数（第353便でカテゴリ別の節を外したので、
  // 画面に出ている唯一の並び＝読みの順に合わせる）。
  const itemListJsonLd = buildItemListJsonLd(
    sorted.map((m) => ({ name: m.term, path: `/glossary/${m.slug}` })),
    { name: PAGE_TITLE },
  );

  // 検索語が空のときに出す一覧（サーバー描画）。GlossaryExplorer が browse として受け取る。
  const browse = (
    <>
      <KanaNav rowsWithItems={rowsWithItems} />

      {all.length === 0 ? (
        <p className={`${styles.empty} ${styles.section}`}>用語集は準備中です。</p>
      ) : (
        /* 五十音順（★ 第353便でカテゴリ別の節を外し、一覧はこの1本だけになった） */
        <section className={styles.section} aria-labelledby="glossary-kana-heading">
          <h2 id="glossary-kana-heading" className={styles.h2}>
            <span className={styles.h2Bar} aria-hidden="true" />
            <span className={styles.h2Icon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M4 12h10M4 17h7" />
              </svg>
            </span>
            五十音順
          </h2>
          {rows.map((r) => (
            <div key={r.row} className={styles.rowGroup}>
              <h3 id={`row-${r.id}`} className={styles.h3}>
                <span className={styles.rowLabel} aria-hidden="true" />
                {r.row === KANA_ROW_OTHER ? KANA_ROW_OTHER : `${r.row}行`}
              </h3>
              <GlossaryCardGrid items={r.items} dense />
            </div>
          ))}
        </section>
      )}
    </>
  );

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエス', path: '/' },
        { name: '用語集', path: '/glossary' },
      ])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(setJsonLd) }} />
      {all.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(itemListJsonLd) }} />
      )}

      {/* パンくず：フクエス › 用語集 */}
      <nav aria-label="パンくずリスト" className={styles.crumbs}>
        <Link href="/" className={styles.crumbLink}>フクエス</Link>
        <span aria-hidden="true" className={styles.crumbSep}>›</span>
        <span aria-current="page" className={styles.crumbCurrent}>用語集</span>
      </nav>

      {/* ヒーロー＋検索＋（検索結果 or 一覧） */}
      <GlossaryExplorer entries={cards} eyebrow="GLOSSARY" title={PAGE_TITLE} description={PAGE_DESC} browse={browse} />

      {/* 注意文（情報カード・文言は GLOSSARY_POLICY_NOTE のまま。個別ページと共通の部品） */}
      <GlossaryNotice className={styles.section} />

      {/* 用語解説のコラムへ（関連記事カード） */}
      <div className="mt-6">
        <Link href="/column/category/glossary" className={styles.linkCard}>
          <span className={styles.linkCardIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
              <path d="M15 3v5h5M8 13h8M8 17h6" />
            </svg>
          </span>
          <span>用語解説のコラムも読む</span>
          <span className={styles.linkCardArrow} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </Link>
      </div>

      {/* 店舗検索 CTA（ページの締め・個別ページと共通の部品） */}
      <GlossaryCta className={styles.section} />

    </main>
  );
}
