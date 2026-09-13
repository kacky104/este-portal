'use client';

import { KANA_ROWS, KANA_ROW_OTHER } from '@/lib/glossaryParse';
import styles from './glossary.module.css';

// 五十音ナビ（/glossary・第352便で新設・第361便で「絞り込み」に変更）。
//
// ★ 第361便（カッキーさんの指示）: 「か」を押したら【か行だけ】を出す。
//   第352便では #row-ka へ飛ぶだけのリンクだったが、いまは押した行だけを表示する絞り込みになった。
//   ★ このファイルは見た目だけを持つ。押されたときに何をするかは KanaBrowser が決める。
// ★ 行の id（row-a … row-wa）は変えていない。用語ページの「さ行の用語一覧へ戻る」（/glossary#row-sa）
//   から来たときも、KanaBrowser が hash を読んでその行に絞る。
// ★ 語が無い行は押せない（aria-disabled・破線・カーソルでも示す）。

export function KanaNav({
  rowsWithItems,
  selected,
  onSelect,
  sticky = true,
}: {
  rowsWithItems: string[];
  /** 選択中の行（'か' など）。未選択は null＝すべて表示 */
  selected: string | null;
  onSelect: (row: string) => void;
  sticky?: boolean;
}) {
  const has = new Set(rowsWithItems);

  return (
    <nav aria-label="五十音で絞り込む" className={sticky ? `${styles.kanaCard} ${styles.kanaCardSticky}` : styles.kanaCard}>
      <ul className={styles.kanaList}>
        {[...KANA_ROWS].map((row) => {
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
          const isActive = selected === row;
          return (
            <li key={row}>
              <button
                type="button"
                className={isActive ? `${styles.kanaBtn} ${styles.kanaBtnActive}` : styles.kanaBtn}
                aria-pressed={isActive}
                aria-controls="glossary-kana-rows"
                // 押すと絞り込み、もう一度押すと解除（どちらも同じボタン）
                aria-label={isActive ? `${row}行の絞り込みを解除` : `${row}行だけを表示`}
                onClick={() => onSelect(row)}
              >
                {row}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 行の見出しに出す文字（「か行」／「その他」）。★ ナビと一覧で同じ言い方にそろえる。 */
export function kanaRowLabel(row: string): string {
  return row === KANA_ROW_OTHER ? KANA_ROW_OTHER : `${row}行`;
}
