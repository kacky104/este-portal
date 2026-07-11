'use client';

import { useState } from 'react';

// 貼り付け用HTMLタグの表示＋ワンタップコピー。
// タグ文字列は親（サーバー側）で組み立てて渡す＝URL・ファイル名の一元管理。
export function XBannerTagCode({ tag }: { tag: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード非対応環境（http等）では選択コピーしてもらう
    }
  };

  return (
    <div className="mt-2">
      <pre className="text-[11px] leading-relaxed text-[color:var(--x-text-secondary)] bg-[color:var(--x-inset)] border border-[color:var(--x-border)] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all select-all">
        {tag}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="mt-2 px-4 py-1.5 rounded-full text-xs font-bold bg-[color:var(--x-inset)] text-[color:var(--x-accent)] border border-[color:var(--x-border-strong)] hover:brightness-110 active:scale-95 transition"
      >
        {copied ? 'コピーしました ✓' : 'タグをコピー'}
      </button>
    </div>
  );
}
