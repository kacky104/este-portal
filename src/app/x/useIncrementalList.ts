'use client';

import { useEffect, useRef, useState } from 'react';

// ★★ 第1002便（2026-09-30・カッキーさん）: 長い一覧を「最初は PAGE 件、下まで来たら次の PAGE 件」で少しずつ描く。
// ★ 手元にある配列をそのまま渡す（取得はしない）。並びを変えないので、おすすめの30分シャッフルもそのまま。
// ★ 戻り値: 今描くぶんの配列と、一番下に置く見張り要素（sentinel）の ref。
export const INCREMENTAL_PAGE = 30;

export function useIncrementalList<T>(items: T[], page = INCREMENTAL_PAGE) {
  const [count, setCount] = useState(page);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 配列が入れ替わったら（タブ切替・投稿追加）先頭ページに戻す
  useEffect(() => { setCount(page); }, [items, page]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || count >= items.length) return;
    if (typeof IntersectionObserver === 'undefined') { setCount(items.length); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(items.length, c + page));
    }, { rootMargin: '600px 0px' }); // ★ 見えるより少し前に足す（スクロールが止まらない）
    io.observe(el);
    return () => io.disconnect();
  }, [count, items.length, page]);

  return { visible: items.slice(0, count), hasMore: count < items.length, sentinelRef };
}
