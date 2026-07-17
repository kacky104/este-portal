'use client';

import { useState } from 'react';
import { VerifiedBadge } from './VerifiedBadge';
import { useXToast } from './useXToast';
import { unmuteProfile, unblockProfile } from './xModerationActions';
import type { ModeratedUser } from './xModerationData';

// ミュート/ブロック中アカウントの一覧（本人専用）。行タップで解除確認 → はい で解除し一覧から消える。
// 行はプロフィールへのリンクにしない（タップ＝解除確認に一本化。誤タップでの遷移を防ぐ）。
const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店', official: '運営' };

export function XModerationList({ mode, users: initialUsers }: { mode: 'mute' | 'block'; users: ModeratedUser[] }) {
  const { toast, showToast } = useXToast();
  const [users, setUsers] = useState(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const word = mode === 'mute' ? 'ミュート' : 'ブロック';

  const handleRelease = async (u: ModeratedUser) => {
    if (busyId) return;
    if (!window.confirm(`@${u.handle} の${word}を解除しますか？`)) return;
    setBusyId(u.id);
    const res = mode === 'mute' ? await unmuteProfile(u.id) : await unblockProfile(u.id);
    setBusyId(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setUsers(prev => prev.filter(x => x.id !== u.id));
    showToast(`@${u.handle} の${word}を解除しました`);
  };

  return (
    <>
      {users.length === 0 ? (
        <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">
          {word}中のアカウントはありません
        </p>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => handleRelease(u)}
              disabled={busyId === u.id}
              className="x-card w-full flex items-center gap-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 text-left hover:brightness-[0.98] transition disabled:opacity-50"
            >
              <span className="relative w-11 h-11 rounded-full overflow-hidden border border-[color:var(--x-border)] bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold">{u.displayName.charAt(0) || '?'}</span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm text-[color:var(--x-text-primary)] truncate max-w-[50%]">{u.displayName}</span>
                  {(u.kind === 'official' || ((u.kind === 'shop' || u.kind === 'therapist') && u.isVerified)) && (
                    <VerifiedBadge kind={u.kind as 'shop' | 'therapist' | 'official'} />
                  )}
                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                    {KIND_LABEL[u.kind] ?? u.kind}
                  </span>
                </div>
                <p className="text-xs text-[color:var(--x-text-muted)] truncate">@{u.handle}</p>
              </div>
              <span className="flex-shrink-0 text-[11px] font-bold text-[color:var(--x-text-muted)]">
                {busyId === u.id ? '解除中…' : 'タップで解除'}
              </span>
            </button>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-full bg-slate-900/90 text-white text-xs font-bold shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
