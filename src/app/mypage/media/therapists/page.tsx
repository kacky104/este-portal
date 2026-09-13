'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { TherapistBoard } from '../TherapistBoard';
import { useToast } from '@/app/components/useToast';

// セラピスト設定（第62便・㉞ その4）。★ 第298便で「セラピスト一覧」→「セラピスト設定」に（カッキーさん）。
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
      title="セラピスト設定"
      current="roster"
      toast={toast}
    >
      {/* ★★★ 第302便: 2つのタブ（一覧／媒体側の登録と結びつける）をやめ、サイトごとのタブに作り替えた。
          ★ 結びつけは TherapistBoard の1人1行に溶かした。★ RosterLinkBoard.tsx は第314便で消した。 */}
      <TherapistBoard salonId={salon ? Number(salon.id) : null} onToast={showToast} />
    </MediaShell>
  );
}
