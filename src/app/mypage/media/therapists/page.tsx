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
      <div className="space-y-3">
        <TherapistBoard salonId={salon ? Number(salon.id) : null} onToast={showToast} />
        {/* ★ 名簿の結び（第115便）。★ これまで運営が SQL で入れていたものを、店舗様が画面から */}
        <RosterLinkBoard salonId={salon ? Number(salon.id) : null} onToast={showToast} />
      </div>
    </MediaShell>
  );
}
