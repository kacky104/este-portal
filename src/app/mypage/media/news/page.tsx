'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { NewsBoard } from '../NewsBoard';
import { useToast } from '@/app/components/useToast';

// 駅ちかの新着情報（自動投稿）（第158便・2026-09-05。★ 第206便で「新着情報を送る」から改名）。フクエスリンクの7画面目。
// ★ 送る仕組みは第154〜157便のまま。★ ここは画面だけ。

export default function MediaNewsPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast, showToast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="駅ちかの新着情報（自動投稿）"
      current="news"
      toast={toast}
    >
      <NewsBoard salonId={salon ? Number(salon.id) : null} onToast={showToast} />
    </MediaShell>
  );
}
