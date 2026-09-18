'use client';

import { useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { DiaryTargets } from '@/app/mypage/media/DiaryTargets';
import { DiaryConsent } from '@/app/mypage/media/DiaryConsent';
import { useToast } from '@/app/components/useToast';

// コネックエフ「写メ日記転送」（第402便・1f）。★ 中身はフクエスリンクの「写メ日記の投稿先」と同じ部品。
// ★ 写メ日記を書くのは、これまでどおりフクエス（マイページ・セラピスト本人）。

export default function ConecfDiaryPage() {
  const { toast, showToast } = useToast();
  const [consentVersion, setConsentVersion] = useState(0);
  return (
    <ConecfShell current="diary" title="写メ日記転送" toast={toast}>
      {(a) => (
        <div className="space-y-3">
          <p className="text-[13.5px] text-slate-500 bg-white border border-slate-200 px-4 py-2.5">
            写メ日記は、フクエス（マイページ・セラピストさん本人）で書いてください。それを、ここで決めたサイトへ転送します。
          </p>
          <DiaryTargets
            salonId={a.salonId}
            onToast={showToast}
            consentVersion={consentVersion}
            esutamaPanel={<DiaryConsent salonId={a.salonId} onToast={showToast} onChanged={() => setConsentVersion((v) => v + 1)} />}
          />
        </div>
      )}
    </ConecfShell>
  );
}
