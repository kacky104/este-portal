'use client';

import { useEffect, useState } from 'react';

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000; // 48時間

// 写メ日記の「NEW」バッジ。更新（created_at）から48時間以内のときだけ更新日の右横に表示する。
// 時刻依存判定は ISR キャッシュへの焼き付きを避けるため、サーバー初期描画では出さず、
// クライアントのマウント後に現在時刻（Date.now）で判定する（ハイドレーション不一致回避）。
// 判定は絶対時間のミリ秒差（カレンダー日数ではない）。色は新顔セラピストの NewBadge と同じ緑で統一。
export function DiaryNewBadge({ iso, className }: { iso: string; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || Date.now() - t >= NEW_WINDOW_MS) return null;

  return (
    <span
      className={className}
      style={{
        background: '#22c55e',
        color: 'white',
        fontSize: '9px',
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: '20px',
        lineHeight: 1.3,
        display: 'inline-block',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        marginLeft: '4px',
        verticalAlign: 'middle',
      }}
    >
      NEW
    </span>
  );
}
