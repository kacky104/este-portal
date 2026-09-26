'use client';

import { useState } from 'react';
import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { DiaryTargets } from '../DiaryTargets';
import { DiaryConsent } from '../DiaryConsent';
// ★ 第372便: EsutamaDiaryStatus（「エステ魂へ送った写メ日記」）の import を外した。
//   ★ 部品（EsutamaDiaryStatus.tsx）・受け口（getEsutamaDiaryStatus）・番人（check:esutamadiarystatus）は
//     そのまま残してある。★ 戻すなら、この import と下の1行を戻すだけ
import { useToast } from '@/app/components/useToast';

// 写メ日記の投稿先（第58便・㉞ その3）。
// ★ 入口（/mypage/media）の「写メ日記の投稿先」タイルの行き先。

export default function MediaDiaryPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast, showToast } = useToast();
  // ★ 第370便: 了承パネルで押すたびに +1 → 上の「エステ魂（n/m名）」を読み直す
  const [consentVersion, setConsentVersion] = useState(0);

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
        {/* ★ 第201便（2026-09-07・カッキーさん）: エステ魂のものは、上のブロックで「エステ魂」を
            選んだときだけ出す。★ 常に下に並べていると、どこがエステ魂の設定なのかが読めなかった。
            ★ 第372便: 出すのは【了承】だけにした（「エステ魂へ送った写メ日記」は外した）。 */}
        <DiaryTargets
          salonId={salon ? Number(salon.id) : null}
          onToast={showToast}
          consentVersion={consentVersion}
          // ★ 第905便（カッキーさん）: 駅ちかだけ・セラピストページ連携の列（〇／✕）
          onlyEkichika
          showCastLink
          esutamaPanel={
            /* ★ エステ魂は本人のアカウントから投稿する仕組み（第118便）。★ 了承を1人ずつ記録する */
            <DiaryConsent
              salonId={salon ? Number(salon.id) : null}
              onToast={showToast}
              onChanged={() => setConsentVersion((v) => v + 1)}
            />
          }
        />
      </div>
    </MediaShell>
  );
}
