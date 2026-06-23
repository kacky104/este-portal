'use client';

import { useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 通知一覧を開いたタイミングで既読化する不可視コンポーネント。
// notification_reads を upsert（user_id=本人uid固定・onConflict: 'user_id'）し last_checked_at を現在時刻へ。
// 表示（最新フィード）の後にバックグラウンドで実行し、操作を妨げない。次回以降は未読が0になる。
export function MarkNotificationsRead() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const nowIso = new Date().toISOString();
        await supabase
          .from('notification_reads')
          .upsert({ user_id: user.id, last_checked_at: nowIso, updated_at: nowIso }, { onConflict: 'user_id' });
      } catch {
        // 既読化の失敗は表示に影響させない。
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
