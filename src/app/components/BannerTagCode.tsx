'use client';

import { useState } from 'react';

// 貼り付け用HTMLタグの表示＋ワンタップコピー（本体 /banner・ワーク /jobs/banner 共用）。
// fukuX 版（x/banner/XBannerTagCode.tsx）のテーマ非依存版：accent でボタン配色だけ切り替える。
// タグ文字列は親（サーバー側）で組み立てて渡す＝URL・ファイル名の一元管理。
export function BannerTagCode({ tag, accent }: { tag: string; accent: 'pink' | 'emerald' }) {
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

  const btn =
    accent === 'pink'
      ? 'text-pink-600 border-pink-200 hover:bg-pink-50'
      : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50';

  return (
    <div className="mt-2">
      <pre className="text-[11px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all select-all">
        {tag}
      </pre>
      <button
        type="button"
        onClick={copy}
        className={`mt-2 px-4 py-1.5 rounded-full text-xs font-bold bg-white border active:scale-95 transition ${btn}`}
      >
        {copied ? 'コピーしました ✓' : 'タグをコピー'}
      </button>
    </div>
  );
}
