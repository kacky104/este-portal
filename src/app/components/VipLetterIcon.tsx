'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getVipUnreadCount } from '@/app/lib/vipLetters';

// ヘッダーのVIPレター専用アイコン（封筒）。ログイン会員のときのみ表示し、未読数をバッジで出す。
// 未読の計算は必ずクライアント側（マウント後）で行う。これにより ISR キャッシュ済みページ
// （トップ・サロン詳細）のサーバーレンダリングに会員個別計算を持ち込まず、キャッシュを壊さない。
// （NotificationBell と同じ設計。こちらは VIPレターの未読＝vip_letter_recipients.read_at=null のみ）
export function VipLetterIcon() {
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
        const count = await getVipUnreadCount(supabase);
        if (active) setUnread(count);
      } catch {
        // 失敗時はバッジを出さないだけ（操作を妨げない）。
      }
    })();
    return () => { active = false; };
  }, []);

  // 未ログイン（初期表示を含む）はアイコンを出さない。
  if (!mounted || !loggedIn) return null;

  const badge = unread > 9 ? '9+' : String(unread);
  const hasUnread = unread > 0;

  return (
    <Link
      href="/member/vip-letters"
      aria-label={hasUnread ? `VIPレター ${unread}件の未読` : 'VIPレター'}
      className={`relative flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border bg-white transition-colors ${
        hasUnread ? 'border-fuchsia-300 ring-2 ring-fuchsia-200/60 animate-pulse' : 'border-slate-200 hover:border-fuchsia-300'
      }`}
    >
      {/* 封筒（レター）＋「VIP」文字。VIP がはっきり読めることを最優先（封筒に被ってもよい）。 */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="vipLetterGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#DB2777" />
            <stop offset="1" stopColor="#9333EA" />
          </linearGradient>
        </defs>
        {/* 封筒（線・グラデ） */}
        <g stroke="url(#vipLetterGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3.5 6.5l8.5 5.5l8.5 -5.5" />
        </g>
        {/* VIP 下地プレート（グラデ塗り・文字を読みやすく） */}
        <rect x="2" y="12" width="20" height="9" rx="2.5" fill="url(#vipLetterGrad)" />
        {/* VIP 文字（白・極太・中央） */}
        <text
          x="12"
          y="19.1"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          fontSize="8.6"
          fontWeight="800"
          letterSpacing="0.3"
          fill="#ffffff"
        >
          VIP
        </text>
      </svg>
      {hasUnread && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold leading-none flex items-center justify-center shadow-sm">
          {badge}
        </span>
      )}
    </Link>
  );
}
