'use client';

import { useEffect, useState } from 'react';
import { KANA_ROWS, KANA_ROW_IDS } from '@/lib/glossaryParse';
import styles from './glossary.module.css';

// 五十音ナビ（/glossary のリデザイン・第352便）。
// ★ 行の id は既存のまま（#row-a … #row-wa）。外から #row-ka で来ても同じ場所に着く。
// ★ 「選択中」は URL の hash（#row-ka）で判定する。サーバー描画では選択なし、
//   クライアントで hash を読んで色を付ける（hashchange で追従）。
// ★ 語が無い行は aria-disabled。リンクにせず、押しても何も起きないことをカーソルでも示す。

export function KanaNav({ rowsWithItems, sticky = true }: { rowsWithItems: string[]; sticky?: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const has = new Set(rowsWithItems);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#row-/, '');
      const row = Object.keys(KANA_ROW_IDS).find((k) => KANA_ROW_IDS[k] === h) ?? null;
      setActive(row);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  return (
    <nav aria-label="五十音で探す" className={sticky ? `${styles.kanaCard} ${styles.kanaCardSticky}` : styles.kanaCard}>
      <ul className={styles.kanaList}>
        {[...KANA_ROWS].map((row) => {
          const id = KANA_ROW_IDS[row];
          if (!has.has(row)) {
            return (
              <li key={row}>
                <span
                  className={`${styles.kanaBtn} ${styles.kanaBtnDisabled}`}
                  aria-disabled="true"
                  title={`${row}行の用語はまだありません`}
                >
                  {row}
                </span>
              </li>
            );
          }
          const isActive = active === row;
          return (
            <li key={row}>
              <a
                href={`#row-${id}`}
                className={isActive ? `${styles.kanaBtn} ${styles.kanaBtnActive}` : styles.kanaBtn}
                aria-current={isActive ? 'location' : undefined}
                aria-label={`${row}行の用語へ`}
              >
                {row}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
