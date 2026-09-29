import Link from 'next/link';
import type { Metadata } from 'next';
import { buildBreadcrumbJsonLd, buildItemListJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { getAllWorkGlossaryMeta } from '@/app/lib/workGlossary';
import type { GlossaryMeta } from '@/lib/glossaryParse';
import {
  KANA_ROWS,
  KANA_ROW_OTHER,
  KANA_ROW_IDS,
  kanaRow,
  sortByReading,
} from '@/lib/glossaryParse';
import { GlossaryExplorer } from './GlossaryExplorer';
import { toCardData } from './GlossaryCard';
import { KanaBrowser } from './KanaBrowser';
import { GlossaryNotice } from './GlossaryNotice';
import { GlossaryCta } from './GlossaryCta';
import styles from './glossary.module.css';

// ★★★ フクエスワークのセラピスト用語集のハブ（/jobs/glossary・第970便・2026-09-29）
// ★ /glossary のハブ（お客様目線）を写して、置き場所・文言・リンク先・色を働く人向けに差し替えたもの。
// ★ 語は src/content/work-glossary/*.md。読み取りは src/app/lib/workGlossary.ts。

const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'セラピスト用語集';
// ★ 画面の説明文と <meta description> は同じ1本（コラム一覧と同じ作り）。
const PAGE_DESC =
  'メンズエステで働くときに出てくる言葉を、1語ずつやさしく解説するセラピスト向けの用語集です。お給料と待遇、働き方、お店のしくみ、安心して働くためのことまで。意味が分かると、福岡でのお店選びや面接がぐっと楽になります。';

export const metadata: Metadata = {
  // ★ /jobs の layout が title.template（%s｜フクエスワーク）を持つので、ここは語だけ。
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/jobs/glossary' },
  openGraph: {
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    url: `${SITE_URL}/jobs/glossary`,
    siteName: 'フクエスワーク',
    type: 'website',
    images: [{ url: '/ogp-fukuwork.png', width: 1200, height: 630, alt: 'フクエスワーク' }],
  },
};

export default function WorkGlossaryHubPage() {
  // ★ 共通の部品（並べ替え・カード）は /glossary の型で受けるので読み替える（カテゴリーだけ違う）。
  const all = getAllWorkGlossaryMeta() as unknown as GlossaryMeta[];
  const cards = all.map(toCardData);

  // 五十音別（語のある行だけ・行内は読みの順）
  const sorted = sortByReading(all).map(toCardData);
  const rows = [...KANA_ROWS, KANA_ROW_OTHER]
    .map((row) => ({ row, id: KANA_ROW_IDS[row], items: sorted.filter((m) => kanaRow(m.reading) === row) }))
    .filter((r) => r.items.length > 0);

  const setJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'DefinedTermSet',
    '@id': `${SITE_URL}/jobs/glossary#set`,
    name: PAGE_TITLE,
    description: PAGE_DESC,
    url: `${SITE_URL}/jobs/glossary`,
  };
  // ItemList は画面の並び（五十音順）と同じ順・同じ件数（第353便でカテゴリ別の節を外したので、
  // 画面に出ている唯一の並び＝読みの順に合わせる）。
  const itemListJsonLd = buildItemListJsonLd(
    sorted.map((m) => ({ name: m.term, path: `/jobs/glossary/${m.slug}` })),
    { name: PAGE_TITLE },
  );

  // 検索語が空のときに出す一覧（サーバー描画）。GlossaryExplorer が browse として受け取る。
  // ★ 第361便: 五十音ナビと一覧は KanaBrowser（Client）が持つ。
  //   「か」を押したら【か行だけ】を出す絞り込みになった。最初に描かれる HTML は絞り込みなし＝全行。
  //   「五十音順」の見出しバーは第361便で外した（一覧はナビのすぐ下から始まる）。
  const browse =
    all.length === 0 ? (
      <p className={`${styles.empty} ${styles.section}`}>用語集は準備中です。</p>
    ) : (
      <KanaBrowser rows={rows} />
    );

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエスワーク', path: '/jobs' },
        { name: 'セラピスト用語集', path: '/jobs/glossary' },
      ])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(setJsonLd) }} />
      {all.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(itemListJsonLd) }} />
      )}

      {/* パンくず：フクエス › 用語集 */}
      <nav aria-label="パンくずリスト" className={styles.crumbs}>
        <Link href="/jobs" className={styles.crumbLink}>フクエスワーク</Link>
        <span aria-hidden="true" className={styles.crumbSep}>›</span>
        <span aria-current="page" className={styles.crumbCurrent}>セラピスト用語集</span>
      </nav>

      {/* ヒーロー＋検索＋（検索結果 or 一覧） */}
      <GlossaryExplorer entries={cards} eyebrow="THERAPIST GLOSSARY" title={PAGE_TITLE} description={PAGE_DESC} browse={browse} />

      {/* 注意文（情報カード・文言は GLOSSARY_POLICY_NOTE のまま。個別ページと共通の部品） */}
      <GlossaryNotice className={styles.section} />

      {/* 用語解説のコラムへ（関連記事カード）
          ★★ 第391便（カッキーさんの指示）: 左の書類アイコンを外した。
            ★ 注意文の箱（第389便）と同じ判断。右の矢印だけで「押して進む」は伝わる。
            ★ CSS の .linkCardIcon は残す（第372便の作法: 消すのは画面だけ）。 */}
      <div className="mt-6">
        <Link href="/jobs/column" className={styles.linkCard}>
          <span>働き方のコラムも読む</span>
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
