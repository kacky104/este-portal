'use client';

import { ConecfShell } from '../ConecfShell';
import { GuideBoard } from '@/app/mypage/media/GuideBoard';
import { CONECF_GUIDE } from '@/lib/conecfGuide';

// コネックエフ「はじめての方へ」（第396便・1b）。★ 部品はフクエスリンクと同じ、中身は lib/conecfGuide.ts。

export default function ConecfGuidePage() {
  return (
    <ConecfShell current="guide" title="はじめての方へ">
      {() => <GuideBoard content={CONECF_GUIDE} />}
    </ConecfShell>
  );
}
