import Link from 'next/link';
import styles from './glossary.module.css';

// 「福岡のメンズエステ求人を探す」CTA（/jobs/glossary のハブと各用語ページで共用・第970便）。
// ★ /glossary の CTA（店舗一覧・エリア）の求人版。★ 求人一覧と求職マッチングの2つへ。
export function GlossaryCta({ className }: { className?: string }) {
  return (
    <section className={className ? `${styles.cta} ${className}` : styles.cta} aria-labelledby="work-glossary-cta-heading">
      <h2 id="work-glossary-cta-heading" className={styles.h2}>
        <span className={styles.h2Bar} aria-hidden="true" />
        福岡のメンズエステ求人を探す
      </h2>
      <Link href="/jobs" className={styles.ctaButton}>
        求人一覧を見る
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
      <ul className={styles.chipList}>
        <li><Link href="/jobs/matching" className={styles.chip}>条件を登録してお店から連絡をもらう（求職マッチング）</Link></li>
        <li><Link href="/jobs/column" className={styles.chip}>働き方のコラムを読む</Link></li>
      </ul>
    </section>
  );
}
