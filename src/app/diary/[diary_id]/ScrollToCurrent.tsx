'use client';

import { useEffect } from 'react';

// 読み込み時に現在の日記セクションを画面中央へスクロール
export function ScrollToCurrent({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [targetId]);
  return null;
}
