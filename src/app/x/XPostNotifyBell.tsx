'use client';

import { useState } from 'react';
import { setPostNotify } from './xPostNotifyActions';

// フォロー中ボタンの横に置く「投稿通知」ベルトグル。
// ON=塗り（紫・投稿通知オン）／OFF=アウトライン。フォロー中のときだけ親が描画する。
// 楽観更新→ setPostNotify で自分のフォロー行 notify_posts を更新。失敗時は元に戻す。
export function XPostNotifyBell({
  targetProfileId,
  initialOn,
  onToast,
}: {
  targetProfileId: string;
  initialOn: boolean;
  onToast?: (msg: string) => void;
}) {
  const [on, setOn] = useState(initialOn);
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    const next = !on;
    setOn(next); // 楽観更新
    setPending(true);

    const res = await setPostNotify(targetProfileId, next);
    setPending(false);
    if (res.ok) {
      onToast?.(next ? '投稿通知をオンにしました' : '投稿通知をオフにしました');
    } else {
      setOn(!next); // ロールバック
      onToast?.(res.error);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={on ? '投稿通知をオフにする' : '投稿通知をオンにする'}
      aria-pressed={on}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors disabled:opacity-50 ${
        on
          ? 'border-transparent text-white'
          : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
      }`}
      style={on ? { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' } : undefined}
    >
      {on ? (
        // Bell（塗り＝オン）
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a6 6 0 0 0-6 6c0 3.6-1 5.3-1.7 6.2-.4.5-.6.8-.6 1.3 0 .7.6 1.2 1.5 1.2h13.6c.9 0 1.5-.5 1.5-1.2 0-.5-.2-.8-.6-1.3C18.9 13.3 18 11.6 18 8a6 6 0 0 0-6-6z" />
          <path d="M10 19a2 2 0 0 0 4 0z" />
        </svg>
      ) : (
        // BellOff（アウトライン＝オフ）
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8.7 3A6 6 0 0 1 18 8c0 1.6.2 2.9.5 4M18.6 18.6A1 1 0 0 1 18 19H4.5c-.9 0-1.5-.5-1.5-1.2 0-.5.2-.8.6-1.3C4.3 15.6 5 14.2 5.3 12" />
          <path d="M10 19a2 2 0 0 0 4 0" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      )}
    </button>
  );
}
