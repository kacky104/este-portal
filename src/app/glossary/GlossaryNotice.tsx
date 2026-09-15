import { GLOSSARY_POLICY_NOTE } from '@/app/lib/glossary';
import styles from './glossary.module.css';

// 掲載店舗についての方針文（情報カード）。★ 用語集のハブと各用語ページで共用（第354便）。
// ★ 文言は GLOSSARY_POLICY_NOTE（src/app/lib/glossary.ts）1か所。ここでは持たない。
// ★ 1ページに1回だけ出す（本文の中で繰り返さない）。
// ★★ 第389便（2026-09-15・カッキーさんの指示）: 左の ⓘ アイコンを外した。
//   ★ 背景に花柄が入ったので、アイコンまで置くと情報が2つ重なる。★ 文だけで伝わる。
//   ★ CSS の .noticeIcon は残す（第372便の作法: 消すのは画面だけ）。

export function GlossaryNotice({ className }: { className?: string }) {
  return (
    <aside className={className ? `${styles.notice} ${className}` : styles.notice} aria-label="掲載店舗についてのご案内">
      <p className={styles.noticeText}>{GLOSSARY_POLICY_NOTE}</p>
    </aside>
  );
}
