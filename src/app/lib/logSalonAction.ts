'use client';

import { createClient } from '@/app/lib/supabase/client';

// 店舗詳細の「送客アクション」を1回記録する（increment_salon_action RPC）。
// PageViewLogger と同じ思想の fire-and-forget：失敗しても本来の動作（発信・遷移）は絶対に止めない。
//
// 多重カウント防止：同一セッション内で「同じ店舗 × 同じアクション」は1回だけ数える（sessionStorage）。
// PV（page_view_weekly）もセッション単位で1回なので、両方を「人数ベース」に揃えることで
// /admin の「送客率 = 送客数 ÷ PV」が意味のある比率になる。
// （タップ回数を数えたくなったら、この sessionStorage ガードを外すだけでよい）
export type SalonActionKind = 'tel' | 'line' | 'book';

export function logSalonAction(salonId: number | null | undefined, action: SalonActionKind): void {
  if (!salonId || Number.isNaN(salonId)) return;

  const key = `sa:${action}:${salonId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // sessionStorage が使えない環境でも計測は続行（多重防止のみ諦める）。
  }

  try {
    createClient()
      .rpc('increment_salon_action', { p_salon_id: salonId, p_action: action })
      .then(() => {}, () => {}); // 失敗は無視
  } catch {
    // ここで投げるとボタンの本来の動作を邪魔するので握りつぶす。
  }
}
