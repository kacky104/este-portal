'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { DiaryTargets } from '../DiaryTargets';
import { useToast } from '@/app/components/useToast';

// 写メ日記の投稿先（第58便・㉞ その3）。
// ★ 入口（/mypage/media）の「写メ日記の投稿先」タイルの行き先。

export default function MediaDiaryPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast, showToast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      title="写メ日記の投稿先"
      backHref="/mypage/media"
      backLabel="媒体連携へ戻る"
      toast={toast}
    >
      <DiaryTargets salonId={salon ? Number(salon.id) : null} onToast={showToast} />
    </MediaShell>
  );
}
