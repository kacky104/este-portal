'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { DiaryTargets } from '../DiaryTargets';
import { DiaryConsent } from '../DiaryConsent';
import { EsutamaDiaryStatus } from '../EsutamaDiaryStatus';
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
      salonName={salon?.name ?? null}
      title="写メ日記の投稿先"
      current="diary"
      toast={toast}
    >
      <div className="space-y-3">
        <DiaryTargets salonId={salon ? Number(salon.id) : null} onToast={showToast} />
        {/* ★ エステ魂は代理ログインで送る（メールの口が無い）。★ 数だけ出す（第141便） */}
        <EsutamaDiaryStatus salonId={salon ? Number(salon.id) : null} />
        {/* ★ エステ魂は本人のアカウントから投稿する仕組み（第118便）。★ 了承を1人ずつ記録する */}
        <DiaryConsent salonId={salon ? Number(salon.id) : null} onToast={showToast} />
      </div>
    </MediaShell>
  );
}
