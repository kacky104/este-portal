import Link from 'next/link';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, areaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import styles from './glossary.module.css';

// 「福岡のメンズエステを探す」CTA。★ 用語集のハブと各用語ページで共用（第354便）。
// ★ 見出し・ボタンの文言・リンク先は変えない（トップ＋エリアページ）。
// ★ areas に frontmatter のエリア slug を渡すと、その語で触れたエリアをチップの先頭に並べ替える。
//   渡さなければ AREA_ORDER の順（全域はトップに集約されるため除外・出張は含める）。

export function GlossaryCta({ areas = [], className }: { areas?: string[]; className?: string }) {
  const all = AREA_ORDER.filter((a) => a !== ALL_AREA);
  const mentioned = areas
    .map((s) => all.find((a) => areaHref(a) === `/area/${s}`))
    .filter((a): a is (typeof all)[number] => !!a);
  const areaLinks = [...mentioned, ...all.filter((a) => !mentioned.includes(a))];

  return (
    <section className={className ? `${styles.cta} ${className}` : styles.cta} aria-labelledby="glossary-cta-heading">
      <h2 id="glossary-cta-heading" className={styles.h2}>
        <span className={styles.h2Bar} aria-hidden="true" />
        福岡のメンズエステを探す
      </h2>
      <Link href="/" className={styles.ctaButton}>
        店舗一覧を見る
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
      <ul className={styles.chipList}>
        {areaLinks.map((area) => (
          <li key={area}>
            <Link href={areaHref(area)} className={styles.chip}>
              {area === DISPATCH_AREA ? '出張対応' : areaLabel(area)}の店舗
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
