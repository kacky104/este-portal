'use client';

import { useEffect, useRef, useState } from 'react';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import { XComposer, type XComposerHandle } from './XComposer';
import { useXToast } from './useXToast';

// 右下フローティング投稿ボタン（FAB）＋投稿モーダル。
// 表示条件（approved の therapist/shop）は親（XTimeline）の eng.canPost で判定済み＝出ている時点で投稿可能。
// 投稿本体は既存 XComposer をそのまま流用し、投稿成功で onPosted（親の楽観反映）→モーダルを閉じる。
// 下書き：未送信の内容がある状態で閉じようとすると「下書きに保存/破棄/キャンセル」を確認する（本家X型）。
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
  const [confirmClose, setConfirmClose] = useState(false);
  const composerRef = useRef<XComposerHandle>(null);
  const { toast, showToast } = useXToast();

  // 閉じる要求：未送信の下書き化できる内容があれば確認、無ければそのまま閉じる。
  const requestClose = () => {
    if (composerRef.current?.hasUnsavedDraftableContent()) {
      setConfirmClose(true);
    } else {
      setOpen(false);
    }
  };

  // モーダル表示中は body スクロールロック＋Escで閉じる（Escも確認フローを通す）。
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (composerRef.current?.hasUnsavedDraftableContent()) setConfirmClose(true);
        else setOpen(false);
      }
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

  // 下書き保存ボタン成功 → トースト＋モーダルを閉じる。
  const handleDraftSaved = () => {
    showToast('下書きに保存しました');
    setOpen(false);
  };

  // 確認ダイアログ「下書きに保存」：保存できたら閉じる。失敗時はコンポーザにエラーが出るので閉じない。
  const confirmSave = async () => {
    const ok = await composerRef.current?.saveDraft();
    if (ok) {
      setConfirmClose(false);
      showToast('下書きに保存しました');
      setOpen(false);
    } else {
      setConfirmClose(false);
    }
  };

  // 確認ダイアログ「破棄する」：保存せず閉じる。
  const confirmDiscard = () => {
    setConfirmClose(false);
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
          onClick={requestClose}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl bg-[color:var(--x-surface)] shadow-2xl border border-[color:var(--x-border)] p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={requestClose}
              aria-label="閉じる"
              className="absolute top-3 right-3 w-8 h-8 rounded-full text-[color:var(--x-text-muted)] hover:bg-[color:var(--x-inset)] flex items-center justify-center"
            >
              ✕
            </button>
            <h2 className="text-sm font-black text-[color:var(--x-text-primary)] mb-1">投稿する</h2>
            <XComposer
              ref={composerRef}
              me={me}
              myAffiliatedShop={myAffiliatedShop ?? null}
              onPosted={handlePosted}
              onDraftSaved={handleDraftSaved}
            />
          </div>
        </div>
      )}

      {/* 閉じる時確認：下書きに保存 / 破棄 / キャンセル */}
      {confirmClose && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
          onClick={() => setConfirmClose(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-[color:var(--x-surface)] border border-[color:var(--x-border)] shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <p className="text-sm font-bold text-[color:var(--x-text-primary)] mb-1">下書きを保存しますか？</p>
            <p className="text-[12px] text-[color:var(--x-text-secondary)] mb-4 leading-relaxed">
              未送信の内容を下書きに保存できます。
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmSave}
                className="px-4 py-2 rounded-full text-white font-bold text-sm shadow-sm"
                style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
              >
                下書きに保存
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="px-4 py-2 rounded-full font-bold text-sm text-rose-500 hover:bg-rose-50 transition-colors"
              >
                破棄する
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="px-4 py-2 rounded-full font-bold text-sm text-[color:var(--x-text-secondary)] hover:bg-[color:var(--x-inset)] transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト（モーダルを閉じた後も見えるよう FAB 直下＝ルートに置く） */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
