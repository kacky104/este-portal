'use client';

import { useEffect, useRef, useState } from 'react';

// 求人詳細「仕事内容」本文の表示部。page.tsx（ISRサーバーコンポーネント）から切り出した小さな
// client コンポーネント。モバイル（md未満）でのみ本文を10行にクランプし、溢れる長文には「続きを読む」を
// 出す。PC（md以上）は常に全文表示・ボタン/フェード非表示（md:line-clamp-none / md:hidden）。
//
// 挙動:
//  - 折りたたみは line-clamp-[10]（10行）。マウント後に ref で scrollHeight > clientHeight を比較し、
//    溢れた本文にだけ「続きを読む」＋下端フェードを出す（溢れていなければ何も出さない）。
//  - トグル式：「続きを読む」で全文展開、「閉じる」で再び折りたたむ。
//  - SSR/hydration の不整合を避けるため溢れ判定はマウント後1回のみ（判定前はボタン非表示・リサイズ追従なし）。
//
// 既存の本文整形（text-sm / text-slate-600 / leading-relaxed / whitespace-pre-wrap / break-words）は維持。
export function JobDescriptionCollapse({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    // line-clamp 適用時の可視高さ(clientHeight)と全高(scrollHeight)を比較（1px の許容）。
    // md 以上は clamp が外れ scrollHeight === clientHeight となるため overflowing=false（＝PCでは出さない）。
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [expanded, text]);

  const clamped = !expanded;

  return (
    <div>
      <div className="relative">
        <p
          ref={ref}
          className={`text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words ${
            clamped ? 'line-clamp-[10] md:line-clamp-none' : ''
          }`}
        >
          {text}
        </p>
        {/* 折りたたみ時の下端フェード（白へのグラデ）。溢れている時だけ・モバイルのみ表示。 */}
        {overflowing && clamped && (
          <div
            aria-hidden
            className="md:hidden pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent"
          />
        )}
      </div>
      {/* 続きを読む／閉じる（モバイルのみ・溢れている時だけ）。ワーク緑のテキストリンク調＋シェブロン。 */}
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="md:hidden mt-2 inline-flex items-center gap-1 text-xs font-bold"
          style={{ color: '#10B981' }}
        >
          {expanded ? '閉じる' : '続きを読む'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
