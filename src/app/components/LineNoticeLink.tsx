'use client';

// ★ 第1720便: LINE予約の前に「フクエスを見たとお伝えください」を挟む確認ポップアップ付きリンク（TelNoticeLink の LINE 版）。
//   タップ→ポップアップ→「LINEを開く」で LINE の URL を新規タブで開く。
//   ポップアップは createPortal で body 直下に描画（backdrop-blur を持つ祖先があると position:fixed の基準がずれる既知の問題を回避）。
//   店舗カード（SalonCardCta）・店舗詳細（SalonActionButtons）・追従バナー（SalonCtaBar）で共通。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHydrated } from '@/lib/useHydrated';

export function LineNoticeLink({
  href,
  className,
  style,
  children,
  onOpen,
  tabIndex,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /** ポップアップの「LINEを開く」を押した瞬間に呼ばれる（送客アクション計測用）。開いただけでは呼ばれない。 */
  onOpen?: () => void;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useHydrated();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} style={style} tabIndex={tabIndex}>
        {children}
      </button>
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-48px)] max-w-sm bg-white rounded-2xl shadow-xl p-5 text-center">
            <p className="text-sm font-bold text-slate-800 leading-relaxed">
              LINEでご予約の際は<br />
              「<span className="text-pink-600">フクエスを見た</span>」と<br />
              お伝えください
            </p>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { onOpen?.(); setOpen(false); }}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white hover:brightness-105 transition-all"
              style={{ background: '#06C755' }}
            >
              LINEを開く
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
