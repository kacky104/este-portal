'use client';

import { useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 店舗/セラピスト詳細ページのマウント時に、週間アクセス数を +1（increment_page_view RPC）する。
// 表示のみ担う不可視部品（null を返す）。ISRでキャッシュされる詳細ページでも、
// クライアントで毎表示ごとに1回発火する（サーバー側で数えるとキャッシュヒットで数えられないため）。
// 多重カウント防止：同一セッション内で同じ item は1回だけ（sessionStorage）。
// 集計は付随的な指標なので、失敗しても本文表示には影響させない（fire-and-forget・例外握りつぶし）。
export default function PageViewLogger({
  itemType,
  itemId,
}: {
  itemType: 'salon' | 'therapist';
  itemId: number;
}) {
  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) return;
    const key = `pv:${itemType}:${itemId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage が使えない環境でも計測は続行（多重防止のみ諦める）。
    }
    createClient()
      .rpc('increment_page_view', { p_item_type: itemType, p_item_id: itemId })
      .then(() => {}, () => {}); // 失敗は無視
  }, [itemType, itemId]);

  return null;
}
