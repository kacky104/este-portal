'use client';

import { useState, useSyncExternalStore } from 'react';

// ★ 第1791便（カッキーさん・2026-11-08）: 「LINEで送る」ボタンの共通部品。
// ★ 起きたこと: 「スマホからは送れるけど、PCからは送れない」（フクエスCRM の LINE ボタン）。
//   原因: LINE の送る画面を開くリンク（https://line.me/R/share?text=…）は、LINE の公式の説明で
//   「LINE for iOS／Android だけ対応・LINE for PC（Windows・Mac）は対応していない」。PC では何も起きないか、ダウンロードの画面になる。
// ★ だから: スマホ（iPhone・iPad・Android）は今までどおり LINE の送る画面を開く。
//   PC は【文面をコピー】して「PC の LINE で送り先のトークを開き、貼り付けて送ってください」と出す。
// ★ スマホかどうかは、開いた端末で判断（サーバーでは分からないので、最初はリンクのまま描いて、ブラウザで読み替える）。

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS は Mac のふりをする（タッチがあれば iPad）
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}
const noop = () => () => {};

export function LineShareLink({ text, className, wrapClassName = '', title, children }: {
  text: string;
  className?: string;
  /** PC のとき、ボタンを包む枠のクラス（グリッドの中で幅いっぱいにしたいときは 'w-full'） */
  wrapClassName?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const mobile = useSyncExternalStore(noop, isMobileUA, () => true);
  const [msg, setMsg] = useState<'' | 'copied' | 'failed'>('');

  if (mobile) {
    return (
      <a href={`https://line.me/R/share?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={className} title={title}>
        {children}
      </a>
    );
  }

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setMsg('copied');
    } catch {
      setMsg('failed');
    }
    window.setTimeout(() => setMsg(''), 8000);
  };

  return (
    <span className={`relative inline-flex ${wrapClassName}`}>
      <button type="button" onClick={(e) => void onClick(e)} className={className}
        title={title ? `${title}（パソコンでは文面をコピーします）` : 'パソコンでは文面をコピーします。PC の LINE に貼り付けて送ってください'}>
        {children}
      </button>
      {msg && (
        <span role="status" className="absolute left-0 top-full z-[60] mt-1 w-[280px] border border-emerald-300 bg-white p-2 text-left text-[12px] font-bold leading-relaxed text-slate-700 shadow-lg"
          onClick={(e) => e.stopPropagation()}>
          {msg === 'copied' ? (
            <>
              <span className="text-emerald-700">文面をコピーしました。</span><br />
              パソコンの LINE で送り先のトークを開き、貼り付け（Ctrl+V）て送ってください。
            </>
          ) : (
            <>
              コピーできませんでした。下の文面を選んでコピーし、パソコンの LINE に貼り付けてください。
              <textarea readOnly value={text} rows={4} className="mt-1 w-full border border-slate-300 p-1 text-[12px] font-normal" onFocus={(e) => e.currentTarget.select()} />
            </>
          )}
        </span>
      )}
    </span>
  );
}
