'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getNotificationFeed } from '@/app/lib/notifications';

// ヘッダーの通知ベル。ログイン会員のときのみ表示し、未読数をバッジで出す。
// 未読の計算は必ずクライアント側（マウント後）で行う。これにより ISR キャッシュ済みページ
// （トップ・サロン詳細）のサーバーレンダリングに会員個別計算を持ち込まず、キャッシュを壊さない。
export function NotificationBell() {
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setMounted(true);
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) { setLoggedIn(false); return; }
        setLoggedIn(true);
        const feed = await getNotificationFeed(supabase);
        if (active) setUnread(feed.unreadCount);
      } catch {
        // 失敗時はバッジを出さないだけ（操作を妨げない）。
      }
    })();
    return () => { active = false; };
  }, []);

  // 未ログイン（初期表示を含む）はベルを出さない。
  if (!mounted || !loggedIn) return null;

  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <Link
      href="/member/notifications"
      aria-label={unread > 0 ? `通知 ${unread}件の未読` : '通知'}
      className="relative flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-white hover:border-pink-300 transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DB2777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
        <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold leading-none flex items-center justify-center shadow-sm">
          {badge}
        </span>
      )}
    </Link>
  );
}
