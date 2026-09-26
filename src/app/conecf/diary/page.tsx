'use client';

import { useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { DiaryTargets } from '@/app/mypage/media/DiaryTargets';
import { DiaryConsent } from '@/app/mypage/media/DiaryConsent';
import { useToast } from '@/app/components/useToast';
import { useConecfHref } from '../ConecfBase';

// コネックエフ「写メ日記転送」（第402便・1f）。★ 中身はフクエスリンクの「写メ日記の投稿先」と同じ部品。
// ★ 写メ日記を書くのは、これまでどおりフクエス（マイページ・セラピスト本人）。

export default function ConecfDiaryPage() {
  const { toast, showToast } = useToast();
  const href = useConecfHref();
  const [consentVersion, setConsentVersion] = useState(0);
  return (
    <ConecfShell current="diary" title="写メ日記転送" toast={toast}>
      {(a) => (
        <div className="space-y-3">
          {/* ★ 第872便（カッキーさん）: フクエスでの投稿が必須・セラピストページと連携しないと送れない、をはっきり書く */}
          <div className="text-[13.5px] text-slate-600 bg-white border border-slate-200 px-4 py-2.5 leading-relaxed space-y-0.5">
            <p>・写メ日記は、<b className="font-bold text-slate-800">フクエスでの投稿が必須</b>です。フクエスに投稿した写メ日記を、ここで決めたサイトへ転送します。</p>
            <p>・セラピストは、<b className="font-bold text-slate-800">セラピストページと連携しないと写メ日記を送れません</b>（連携はセラピスト編集の「基本情報」または「写メ日記」タブから）。</p>
          </div>
          <DiaryTargets
            salonId={a.salonId}
            onToast={showToast}
            consentVersion={consentVersion}
            therapistEditOrigin="https://fukues.com"
            therapistEditHref={(tid) => href(`/girls/${tid}?tab=diary`)}
            showCastLink
            esutamaPanel={<DiaryConsent salonId={a.salonId} onToast={showToast} showCastLink onChanged={() => setConsentVersion((v) => v + 1)} />}
          />
        </div>
      )}
    </ConecfShell>
  );
}
