'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/client';

// /cast ヘッダーの fukuX アイコン（第601便）。★ fukuX の未読（通知＋メッセージ）があれば赤いバッジを出す。
// ★ 数え方は fukuX のヘッダー（XHeader）と同じ：x_notifications の is_read=false ＋ RPC x_unread_dm_count。
// ★ 押した先：通知の未読があれば通知一覧、メッセージだけならメッセージ、どちらも無ければ自分のページ。
// ★ ページを開いたとき・タブに戻ってきたときに数え直す（常時の購読はしない）。
export function CastXIcon({ handle, profileId }: { handle: string; profileId: string | null }) {
  const [notif, setNotif] = useState(0);
  const [dm, setDm] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    const supabase = createClient();
    let alive = true;
    const load = async () => {
      const [{ count }, { data }] = await Promise.all([
        supabase.from('x_notifications').select('id', { count: 'exact', head: true }).eq('recipient_profile_id', profileId).eq('is_read', false),
        supabase.rpc('x_unread_dm_count'),
      ]);
      if (!alive) return;
      setNotif(count ?? 0);
      setDm(typeof data === 'number' ? data : 0);
    };
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
  }, [profileId]);

  const total = notif + dm;
  const href = notif > 0 ? '/x/notifications' : dm > 0 ? '/x/messages' : `/x/u/${handle}`;
  return (
    <Link
      href={href}
      aria-label={total > 0 ? `fukuX（未読${total}件）` : 'fukuX の自分のページ'}
      title="fukuX"
      className="relative w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center hover:border-pink-300 transition-colors"
    >
      <Image src="/fukux-mark.png" alt="" width={18} height={18} className="object-contain" />
      {total > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-sm">
          {total > 99 ? '99+' : total}
        </span>
      )}
    </Link>
  );
}
