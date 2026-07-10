'use client';

import Link from 'next/link';
import { XLogo } from './XLogo';

// 未ログイン／未開設のユーザーがアクション（いいね・フォロー等）をしたときに出すアカウント作成モーダル。
// loggedIn=false → 新規登録／ログイン導線。loggedIn=true（＝ログイン済みだが x_profiles 未開設）→ 開設導線。
// message: 未ログイン時の案内文をアクションに合わせて差し替え可（省略時は従来文言）。
export function XAuthGateModal({
  open,
  loggedIn,
  onClose,
  message,
}: {
  open: boolean;
  loggedIn: boolean;
  onClose: () => void;
  message?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-sm rounded-3xl bg-[color:var(--x-surface)] shadow-2xl border border-[color:var(--x-border)] p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-[color:var(--x-text-muted)] hover:bg-[color:var(--x-inset)] flex items-center justify-center"
        >
          ✕
        </button>

        <div className="text-center mb-5">
          <XLogo size="lg" />
        </div>

        {loggedIn ? (
          // ── ログイン済み・x_profiles 未開設 ──
          <>
            <p className="text-center text-sm text-[color:var(--x-text-primary)] leading-relaxed mb-6">
              いいね・フォローするには、表示名と ID を設定して<strong>アカウントを開設</strong>してください。
            </p>
            <Link
              href="/x/onboarding"
              className="block w-full py-3 rounded-xl text-center text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              アカウントを開設する
            </Link>
          </>
        ) : (
          // ── 未ログイン ──
          <>
            <p className="text-center text-sm text-[color:var(--x-text-primary)] leading-relaxed mb-6">
              {message ?? (
                <>
                  fukuX でいいね・フォローするには<strong>アカウント</strong>が必要です。
                </>
              )}
              <br />
              新規登録、またはログインして始めましょう。
            </p>
            <div className="space-y-2.5">
              <Link
                href="/x/signup"
                className="block w-full py-3 rounded-xl text-center text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
                style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
              >
                新規登録
              </Link>
              <Link
                href="/x/login"
                className="block w-full py-3 rounded-xl text-center border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] font-bold text-sm hover:border-indigo-300 hover:text-[color:var(--x-accent)] transition-colors"
              >
                ログイン
              </Link>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="block w-full mt-4 text-center text-xs text-[color:var(--x-text-muted)] hover:text-[color:var(--x-text-secondary)] transition-colors"
        >
          あとで
        </button>
      </div>
    </div>
  );
}
