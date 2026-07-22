'use client';

// 電話発信の前に「フクエスを見たとお伝えください」を挟む確認ポップアップ付きリンク。
// tel: 直リンクだとOSの発信画面に文言を出せないため、タップ→ポップアップ→「電話をかける」で発信する。
// ポップアップは createPortal で body 直下に描画（backdrop-blur を持つ祖先があると
// position:fixed の基準がずれる既知の問題を回避。HamburgerMenu と同じ方式・外さないこと）。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function TelNoticeLink({
  phone,
  className,
  style,
  children,
}: {
  phone: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const telHref = `tel:${phone.replace(/[^0-9+]/g, '')}`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} style={style}>
        {children}
      </button>
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[100]">
          {/* オーバーレイ（クリックで閉じる） */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          {/* 本体 */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-48px)] max-w-sm bg-white rounded-2xl shadow-xl p-5 text-center">
            <p className="text-sm font-bold text-slate-800 leading-relaxed">
              お電話の際は<br />
              「<span className="text-pink-600">フクエスを見た</span>」と<br />
              お伝えください
            </p>
            <p className="mt-2 text-lg font-bold text-slate-700">{phone}</p>
            <a
              href={telHref}
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white hover:brightness-105 transition-all"
              style={{ background: 'linear-gradient(to right,#FB923C,#DB2777)' }}
            >
              電話をかける
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
