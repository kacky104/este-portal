import { WORK_GLOSSARY_POLICY_NOTE } from '@/app/lib/workGlossary';
import styles from './glossary.module.css';

// 掲載求人についての方針文（情報カード）。★ /jobs/glossary のハブと各用語ページで共用（第970便）。
// ★ 文言は WORK_GLOSSARY_POLICY_NOTE（src/app/lib/workGlossary.ts）1か所。★ 1ページに1回だけ。
export function GlossaryNotice({ className }: { className?: string }) {
  return (
    <aside className={className ? `${styles.notice} ${className}` : styles.notice} aria-label="掲載求人についてのご案内">
      <p className={styles.noticeText}>{WORK_GLOSSARY_POLICY_NOTE}</p>
    </aside>
  );
}
