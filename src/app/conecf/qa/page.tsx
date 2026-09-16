'use client';

import { ConecfShell } from '../ConecfShell';
import { QaBoard } from '@/app/mypage/media/QaBoard';
import { CONECF_GUIDE } from '@/lib/conecfGuide';

// コネックエフ「よくあるご質問（Q&A）」（第396便・1b）。★ 中身は lib/conecfGuide.ts。

export default function ConecfQaPage() {
  return (
    <ConecfShell current="qa" title="よくあるご質問（Q&A）">
      {() => <QaBoard content={CONECF_GUIDE} />}
    </ConecfShell>
  );
}
