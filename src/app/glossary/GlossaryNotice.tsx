import { GLOSSARY_POLICY_NOTE } from '@/app/lib/glossary';
import styles from './glossary.module.css';

// 掲載店舗についての方針文（情報カード）。★ 用語集のハブと各用語ページで共用（第354便）。
// ★ 文言は GLOSSARY_POLICY_NOTE（src/app/lib/glossary.ts）1か所。ここでは持たない。
// ★ 1ページに1回だけ出す（本文の中で繰り返さない）。

export function GlossaryNotice({ className }: { className?: string }) {
  return (
    <aside className={className ? `${styles.notice} ${className}` : styles.notice} aria-label="掲載店舗についてのご案内">
      <span className={styles.noticeIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </span>
      <p className={styles.noticeText}>{GLOSSARY_POLICY_NOTE}</p>
    </aside>
  );
}
