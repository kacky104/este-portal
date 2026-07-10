'use client';

import { useEffect, useRef, useState } from 'react';
import { XHashtagText } from './XHashtagText';

// fukuX 投稿本文（x_posts.body）の表示部。XPostCard から切り出した小さな client コンポーネントで、
// タイムライン・プロフィール・検索・保存・リプライ一覧など「一覧系」で共用する（切り出しは表示部のみ・
// カード全体の構造/リンク/いいね等は不変）。
//
// 挙動:
//  - 折りたたみは line-clamp-[8]（8行）。マウント後に ref で scrollHeight > clientHeight を比較し、
//    超過した投稿にだけ「続きを読む」を出す（超過していなければ何も出さない）。
//  - 「続きを読む」タップでその場全文展開（ページ遷移しない・片方向＝折りたたむは無し）。
//  - 展開 state は本コンポーネント内なので投稿ごとに独立（1つ展開しても他は畳んだまま）。
//  - clamp={false}（投稿単体ページ /x/post/[id] のメイン投稿）はクランプせず全文表示＝リンクも出さない。
//
// 既存の本文整形（whitespace-pre-wrap / break-words / leading-relaxed 等）は維持したまま line-clamp を重ねる。
// レイアウト（mt-2 ml-[50px]）は従来 <p> に付いていたものをラッパー div へ移設（見た目は不変）。
export function PostBody({ text, clamp = true }: { text: string; clamp?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (!clamp || expanded) return;
    const el = ref.current;
    if (!el) return;
    // line-clamp 適用時の可視高さ(clientHeight)と全高(scrollHeight)を比較（1px の許容）。
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [clamp, expanded, text]);

  const clamped = clamp && !expanded;

  return (
    <div className="mt-2 ml-[50px]">
      <XHashtagText
        ref={ref}
        text={text}
        className={`text-sm text-[color:var(--x-text-primary)] leading-relaxed whitespace-pre-wrap break-words ${clamped ? 'line-clamp-[8]' : ''}`}
      />
      {clamp && overflowing && !expanded && (
        <button
          type="button"
          // カードのタップ導線（詳細遷移）と競合しないよう伝播を止める。
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(true); }}
          className="mt-1 text-xs font-bold text-indigo-500 hover:underline"
        >
          続きを読む
        </button>
      )}
    </div>
  );
}
