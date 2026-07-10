'use client';

import { forwardRef } from 'react';
import Link from 'next/link';

// 本文中の #タグ をリンク化して表示する。タグ範囲＝# の直後から
// 「半角英数 _ / 全角英数 / ひらがな / カタカナ(ー含む) / 漢字 / 々」が連続する部分。
// 区切り（空白・記号・改行）で終端。XSS 回避のため dangerouslySetInnerHTML は使わず、
// テキストノードと <Link> の React 要素配列として描画する。
const TAG_RE =
  /#([0-9A-Za-z_０-９Ａ-Ｚａ-ｚ぀-ゟ゠-ヿ一-鿿々]+)/g;

// タグタップ → そのタグを含む投稿検索へ（# 込みで ilike 一致）。投稿タブを選択状態に。
function tagHref(tag: string): string {
  return `/x/search?q=${encodeURIComponent('#' + tag)}&tab=posts`;
}

// ref は本文の行数クランプ（PostBody）が scrollHeight/clientHeight を測るために <p> へ転送する。
// 既存の呼び出し（ref 未指定）は従来どおり動作する。
export const XHashtagText = forwardRef<HTMLParagraphElement, { text: string; className?: string }>(
  function XHashtagText({ text, className }, ref) {
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let i = 0;
    let m: RegExpExecArray | null;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text)) !== null) {
      const start = m.index;
      const full = m[0]; // "#タグ名"
      const tag = m[1]; // "タグ名"
      if (start > last) nodes.push(text.slice(last, start));
      nodes.push(
        <Link
          key={`h${i}`}
          href={tagHref(tag)}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-[color:var(--x-accent)] hover:underline"
        >
          {full}
        </Link>
      );
      last = start + full.length;
      i++;
    }
    if (last < text.length) nodes.push(text.slice(last));

    return <p ref={ref} className={className}>{nodes}</p>;
  }
);
