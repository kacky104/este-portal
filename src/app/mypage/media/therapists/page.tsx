'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { TherapistBoard } from '../TherapistBoard';
import { RosterLinkBoard } from '../RosterLinkBoard';
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
      {/* ★ 第119便: 2つの塊をタブにした（縦に長すぎたため）。
          ★ 「媒体側の登録と結びつける」はタブが選ばれたときだけ描かれる */}
      <TherapistBoard salonId={salon ? Number(salon.id) : null} onToast={showToast}>
        <RosterLinkBoard salonId={salon ? Number(salon.id) : null} onToast={showToast} />
      </TherapistBoard>
    </MediaShell>
  );
}
