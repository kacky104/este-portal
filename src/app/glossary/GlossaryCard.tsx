import Link from 'next/link';
import type { GlossaryMeta } from '@/lib/glossaryParse';
import styles from './glossary.module.css';

/** カードに要る項目だけ（検索の Client Component に渡すのもこれ。faq などの重い項目は渡さない） */
export type GlossaryCardData = Pick<GlossaryMeta, 'term' | 'reading' | 'slug' | 'summary'>;

export function toCardData(m: GlossaryMeta): GlossaryCardData {
  return { term: m.term, reading: m.reading, slug: m.slug, summary: m.summary };
}
// 用語カード（/glossary のリデザイン・第352便）。
// ★ 「五十音順」「検索結果」の2か所で同じものを使う（データは同じ配列）。
// ★ 「重要」バッジは出さない（第353便・カッキーさんの指示で撤去）。frontmatter の major は残っている。
// ★ カード全体が個別ページへのリンク。中に別のリンクは置かない（リンクの入れ子を作らない）。
// ★ 'use client' は付けない。サーバー側の一覧からも、検索（Client）からも呼べる。

export function GlossaryCard({ m }: { m: GlossaryCardData }) {
  return (
    <Link href={`/glossary/${m.slug}`} className={styles.card} aria-label={`${m.term}（${m.reading}）の解説を見る`}>
      <span className={styles.cardHead}>
        <span className={styles.cardTerm}>{m.term}</span>
        <span className={styles.cardReading}>{m.reading}</span>
      </span>
      <span className={styles.cardSummary}>{m.summary}</span>
      <span className={styles.cardMore} aria-hidden="true">詳しく見る →</span>
    </Link>
  );
}

export function GlossaryCardGrid({ items, dense = false }: { items: GlossaryCardData[]; dense?: boolean }) {
  return (
    <ul className={dense ? `${styles.cardGrid} ${styles.cardGridDense}` : styles.cardGrid}>
      {items.map((m) => (
        <li key={m.slug}>
          <GlossaryCard m={m} />
        </li>
      ))}
    </ul>
  );
}
