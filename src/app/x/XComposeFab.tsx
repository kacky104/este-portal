'use client';

import { useEffect, useState } from 'react';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import { XComposer } from './XComposer';

// 右下フローティング投稿ボタン（FAB）＋投稿モーダル。
// 表示条件（approved の therapist/shop）は親（XTimeline）の eng.canPost で判定済み＝出ている時点で投稿可能。
// 投稿本体は既存 XComposer をそのまま流用し、投稿成功で onPosted（親の楽観反映）→モーダルを閉じる。
export function XComposeFab({
  me,
  myAffiliatedShop,
  onPosted,
}: {
  me: XProfile;
  myAffiliatedShop?: { handle: string; displayName: string } | null;
  onPosted: (post: XPost) => void;
}) {
  const [open, setOpen] = useState(false);

  // モーダル表示中は body スクロールロック＋Escで閉じる。
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 投稿成功 → 親の楽観反映を呼んでからモーダルを閉じる。
  const handlePosted = (post: XPost) => {
    onPosted(post);
    setOpen(false);
  };

  return (
    <>
      {/* FAB：モーダルを開いている間は隠す（オーバーレイと被らないように） */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="投稿する"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg,#EC4899,#A855F7)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}

      {/* 投稿モーダル */}
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl bg-[color:var(--x-surface)] shadow-2xl border border-[color:var(--x-border)] p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
              className="absolute top-3 right-3 w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center"
            >
              ✕
            </button>
            <h2 className="text-sm font-black text-slate-800 mb-1">投稿する</h2>
            <XComposer me={me} myAffiliatedShop={myAffiliatedShop ?? null} onPosted={handlePosted} />
          </div>
        </div>
      )}
    </>
  );
}
