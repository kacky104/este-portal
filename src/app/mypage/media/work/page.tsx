'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { WorkSend } from '../WorkSend';
import { useToast } from '@/app/components/useToast';

// 出勤を更新（第57便・㉞ その2）。★ 第336便で「出勤を送る」から改名（カッキーさん）。
// ★ 入口（/mypage/media）の「出勤を更新」タイルの行き先。
// ★ 送る仕組みは第43〜46便のまま。★ 画面だけを作り直している。

export default function MediaWorkPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast, showToast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="出勤を更新"
      current="work"
      toast={toast}
    >
      <WorkSend salonId={salon ? Number(salon.id) : null} onToast={showToast} />
    </MediaShell>
  );
}
