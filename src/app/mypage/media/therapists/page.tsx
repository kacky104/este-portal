'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { TherapistBoard } from '../TherapistBoard';
import { useToast } from '@/app/components/useToast';

// セラピスト一覧（第62便・㉞ その4・★ いまは見るだけ）。
// ★ 主役はフクエスに登録されているセラピスト。各サイトはその出先（設計メモ §180）。

export default function MediaTherapistsPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast, showToast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="セラピスト一覧"
      current="roster"
      toast={toast}
    >
      <TherapistBoard salonId={salon ? Number(salon.id) : null} onToast={showToast} />
    </MediaShell>
  );
}
