'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { GlossaryCardGrid, type GlossaryCardData } from './GlossaryCard';
import styles from './glossary.module.css';

// ヒーロー（見出し＋説明文＋検索欄）と、検索結果の切り替え（/glossary のリデザイン・第352便）。
// ★ Client Component はここと KanaNav だけ。ページ本体（メタデータ・JSON-LD・一覧）はサーバーのまま。
// ★ 一覧（五十音ナビ・業態・五十音順）はサーバーが描画したものを browse として受け取り、
//   検索語が空のときはそのまま出す。検索中は「検索結果」1本にまとめる（業態と五十音を二重に出さない）。
// ★ 検索は用語名・読み・説明文を対象に、入力と同時に絞り込む。通信なし。データは既存の配列（entries）。

const EMPTY_MESSAGE = '該当する用語が見つかりませんでした。別の言葉で検索してください。';

// 全角→半角・大文字→小文字・カタカナ→ひらがな に寄せてから比べる（「ケンゼン」でも「けんぜん」に当たる）。
function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

function matches(m: GlossaryCardData, q: string): boolean {
  return normalize(m.term).includes(q) || normalize(m.reading).includes(q) || normalize(m.summary).includes(q);
}

export function GlossaryExplorer({
  entries,
  eyebrow,
  title,
  description,
  browse,
}: {
  entries: GlossaryCardData[];
  eyebrow: string;
  title: string;
  description: string;
  /** サーバーが描画した一覧（五十音ナビ・業態・五十音順）。検索語が空のときにそのまま出す */
  browse: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const inputId = useId();
  const q = normalize(query);
  const results = useMemo(() => (q ? entries.filter((m) => matches(m, q)) : entries), [entries, q]);

  return (
    <>
      <section className={styles.hero} aria-labelledby="glossary-title">
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 id="glossary-title" className={styles.h1}>{title}</h1>
          <p className={styles.lead}>{description}</p>

          <form role="search" className={styles.search} onSubmit={(e) => e.preventDefault()}>
            <label htmlFor={inputId} className="sr-only">用語を検索</label>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id={inputId}
              type="search"
              className={styles.searchInput}
              placeholder="用語を検索（例：健全店）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              aria-controls="glossary-results"
            />
            {query && (
              <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="検索語を消す">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </form>
          <p className={styles.searchHint} aria-live="polite">
            {q ? `${results.length}件の用語が見つかりました` : '用語名・読み仮名・説明文から探せます'}
          </p>
        </div>
      </section>

      <div id="glossary-results">
        {q ? (
          <section className={styles.section} aria-labelledby="glossary-search-results">
            <h2 id="glossary-search-results" className={styles.h2}>
              <span className={styles.h2Bar} aria-hidden="true" />
              検索結果
            </h2>
            {results.length === 0 ? (
              <p className={styles.empty}>{EMPTY_MESSAGE}</p>
            ) : (
              <GlossaryCardGrid items={results} dense />
            )}
          </section>
        ) : (
          browse
        )}
      </div>
    </>
  );
}
