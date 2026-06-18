'use client';

import { useEffect, useRef, useState } from 'react';

// 本文が5行を超える場合は5行でクランプし「続きを見る →」で全文表示する。
export function ExpandableText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={`text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-all ${expanded ? '' : 'line-clamp-5'}`}
      >
        {text}
      </p>
      {canExpand && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-sm font-bold text-pink-600 hover:underline"
        >
          続きを見る →
        </button>
      )}
    </div>
  );
}
