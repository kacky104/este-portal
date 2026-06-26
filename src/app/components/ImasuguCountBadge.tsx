'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { isImasuguLiveRow } from '@/lib/imasugu';

// サロン詳細の「今すぐ」件数ハートバッジ。
// 「今すぐ」は is_available_now=true かつ available_until が未来か、という時刻ベース判定（30分で自動失効）。
// この判定をサーバー（ISRキャッシュ対象）で行うと生成時刻が焼き付いてズレるため、
// トップの TherapistScroller と同様にクライアント側でマウント時の現在時刻で判定する。
export function ImasuguCountBadge({ salonId, fill, num }: { salonId: number; fill: string; num: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('therapists')
          .select('is_available_now, available_until, is_available_now_cast, available_until_cast')
          .eq('salon_id', salonId);
        if (!active) return;
        const now = new Date();
        // オーナー枠 OR キャスト枠の和集合。1人=1行なので二重カウントは起きない。
        // クランプを外し、今すぐ中の実数を表示する。
        const c = (data ?? []).filter(t => isImasuguLiveRow(t, now)).length;
        setCount(c);
      } catch {
        // 失敗時はバッジを出さないだけ（操作を妨げない）。
      }
    })();
    return () => { active = false; };
  }, [salonId]);

  if (count <= 0) return null;

  return (
    <svg
      width="50" height="50" viewBox="0 0 100 100"
      className="absolute drop-shadow"
      style={{ top: '-12px', right: '-12px' }}
      aria-label={`今すぐ ${count}名`}
    >
      <path d="M50 86 C50 86 14 60 14 34 C14 21 25 13 35 13 C43 13 48 19 50 25 C52 19 57 13 65 13 C75 13 86 21 86 34 C86 60 50 86 50 86 Z" fill={fill} />
      <text x="50" y="43" textAnchor="middle" dominantBaseline="central" fill={num} fontWeight="600" fontSize={count >= 10 ? 26 : 34}>{count}</text>
    </svg>
  );
}
