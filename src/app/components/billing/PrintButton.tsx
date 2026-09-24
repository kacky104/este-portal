'use client';

// 請求書の「印刷・PDFで保存」（第816便）。★ ブラウザの印刷を開くだけ。
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-pink-600 text-white text-sm font-bold px-4 py-2 hover:bg-pink-700"
    >
      印刷・PDFで保存
    </button>
  );
}
