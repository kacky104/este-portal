'use client';

// ★ 第1428便（2026-10-13・カッキーさん）: お店のページへ行かずに終わる「✕」。目立たない大きさで右上の角に。
//   ・まず window.close() を試す（QR から開いたタブは閉じられないことが多い）
//   ・閉じられなかったら、リンクの無い画面（/g/done・「この画面は閉じてください。」）に置き換える（戻るでリンクの画面に戻らないよう replace）
export default function CloseX() {
  const onClick = () => {
    try { window.close(); } catch { /* 閉じられない */ }
    setTimeout(() => { if (!window.closed) window.location.replace('/g/done'); }, 150);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="閉じる"
      className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center text-[15px] leading-none text-slate-400/80 hover:text-slate-500"
    >
      ✕
    </button>
  );
}
