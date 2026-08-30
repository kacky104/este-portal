'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { LogBoard } from '../LogBoard';
import { useToast } from '@/app/components/useToast';

// 連携の記録（第64便・㉞ その6）。

export default function MediaLogPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="連携の記録"
      current="log"
      toast={toast}
    >
      <LogBoard salonId={salon ? Number(salon.id) : null} />
    </MediaShell>
  );
}
