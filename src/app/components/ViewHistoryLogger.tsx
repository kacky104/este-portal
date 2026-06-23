'use client';

import { useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 会員の閲覧履歴を記録する不可視のロガー。
// ISR キャッシュ済みのサロン詳細でもキャッシュヒット時に確実に走るよう、記録は必ずクライアント側で行う。
// - ログイン中の会員のみ記録（未ログインなら何もしない・エラーも出さない）。
// - view_history へ upsert（onConflict: user_id,item_type,item_id）。再閲覧で viewed_at が最新化される。
// - user_id は必ずセッションのユーザーIDを使う（クライアントから任意値を渡さない／RLSと整合）。
// - 記録は投げっぱなしで表示をブロックしない。マウント時1回だけ実行する。
export function ViewHistoryLogger({ itemType, itemId }: { itemType: 'salon' | 'therapist'; itemId: number }) {
  useEffect(() => {
    // 無効な ID では何もしない。
    if (!Number.isFinite(itemId)) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return; // 未ログインは記録しない
        await supabase
          .from('view_history')
          .upsert(
            { user_id: user.id, item_type: itemType, item_id: itemId, viewed_at: new Date().toISOString() },
            { onConflict: 'user_id,item_type,item_id' }
          );
      } catch {
        // 記録失敗はユーザー操作を妨げない（握りつぶす）。
      }
    })();
    return () => { cancelled = true; };
    // マウント時1回のみ（item が変わらない限り再記録しない）。
  }, [itemType, itemId]);

  return null;
}
