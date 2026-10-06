'use client';

import { useHydrated } from '@/lib/useHydrated';
// ★ 第1126便: 48時間の窓は lib/diaryNew.ts が唯一の正（★ 第1239便: 店舗カードのタブの数は別の定数＝60時間）
import { DIARY_NEW_WINDOW_MS as NEW_WINDOW_MS } from '@/lib/diaryNew';

// 写メ日記の「NEW」バッジ。更新（created_at）から48時間以内のときだけ更新日の右横に表示する。
// 時刻依存判定は ISR キャッシュへの焼き付きを避けるため、サーバー初期描画では出さず、
// クライアントのマウント後に現在時刻（Date.now）で判定する（ハイドレーション不一致回避）。
// 判定は絶対時間のミリ秒差（カレンダー日数ではない）。色は新顔セラピストの NewBadge と同じ緑で統一。
export function DiaryNewBadge({ iso, className }: { iso: string; className?: string }) {
  const mounted = useHydrated();
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
