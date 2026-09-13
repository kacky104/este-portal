'use client';

import { useEffect, useState } from 'react';
import { KANA_ROW_IDS } from '@/lib/glossaryParse';
import { GlossaryCardGrid, type GlossaryCardData } from './GlossaryCard';
import { KanaNav, kanaRowLabel } from './KanaNav';
import styles from './glossary.module.css';

// 五十音ナビ＋五十音順の一覧（/glossary・第361便）。
//
// ★ 第361便（カッキーさんの指示）:
//     ① 「か」を押したら【か行だけ】、「さ」を押したら【さ行だけ】を出す（押した行で絞り込む）。
//     ② 「五十音順」の見出しバーは出さない。一覧はナビのすぐ下から始まる。
//   もう一度同じ行を押す／「すべて表示」を押すと解除して全部の行に戻る。
//
// ★ SEO: 最初に描かれる HTML は【絞り込みなし＝全部の行】。全語へのリンクがそのまま HTML に入る。
//   絞り込みはクリックのあとだけ効く（サーバー描画では選択なし）。
// ★ 用語ページの「さ行の用語一覧へ戻る」（/glossary#row-sa）から来たときは、hash を読んでさ行に絞る。
//   行の id（row-a … row-wa・row-other）は第352便から変えていない。
// ★ 押したときに hash を書き換えるのは replaceState（履歴を増やさない＝戻るボタンが効かなくならない）。

export type KanaRowData = { row: string; id: string; items: GlossaryCardData[] };

/** hash（#row-sa）→ 行（'さ'）。該当が無ければ null。 */
function rowFromHash(hash: string, rows: KanaRowData[]): string | null {
  const id = hash.replace(/^#row-/, '');
  if (!id || id === hash) return null;
  const row = Object.keys(KANA_ROW_IDS).find((k) => KANA_ROW_IDS[k] === id) ?? null;
  return row && rows.some((r) => r.row === row) ? row : null;
}

export function KanaBrowser({ rows }: { rows: KanaRowData[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const rowsKey = rows.map((r) => r.row).join(',');

  // ★ 初期値は必ず null（サーバー描画と同じ）。hash はマウント後に読む＝hydration がずれない。
  useEffect(() => {
    const read = () => setSelected(rowFromHash(window.location.hash, rows));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
    // rows は配列なので中身のキーで比べる（親が描き直しても effect を無駄に走らせない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  const select = (row: string | null) => {
    const next = row === null || selected === row ? null : row;
    setSelected(next);
    if (typeof window === 'undefined') return;
    const base = window.location.pathname + window.location.search;
    const id = next ? KANA_ROW_IDS[next] : null;
    window.history.replaceState(null, '', id ? `${base}#row-${id}` : base);
  };

  const shown = selected ? rows.filter((r) => r.row === selected) : rows;
  const count = shown.reduce((n, r) => n + r.items.length, 0);

  return (
    <>
      <KanaNav rowsWithItems={rows.map((r) => r.row)} selected={selected} onSelect={select} />

      {/* 絞り込み中だけ出る帯。いま何で絞っているかと、解除の入口。 */}
      {selected && (
        <div className={styles.filterBar}>
          <p className={styles.filterText} aria-live="polite">
            <strong>{kanaRowLabel(selected)}</strong>の用語 {count}件
          </p>
          <button type="button" className={styles.filterClear} onClick={() => select(null)}>
            すべて表示
          </button>
        </div>
      )}

      {/* ★ 第361便で「五十音順」の見出しバーを外した。節の名前は aria-label で持つ。 */}
      <section id="glossary-kana-rows" className={styles.rowsSection} aria-label="五十音順の用語一覧">
        {shown.map((r) => (
          <div key={r.row} className={styles.rowGroup}>
            <h2 id={`row-${r.id}`} className={styles.h3}>
              <span className={styles.rowLabel} aria-hidden="true" />
              {kanaRowLabel(r.row)}
            </h2>
            <GlossaryCardGrid items={r.items} dense />
          </div>
        ))}
      </section>
    </>
  );
}
