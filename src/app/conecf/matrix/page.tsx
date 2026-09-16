'use client';

import { ConecfShell } from '../ConecfShell';
import { MatrixBoard } from '@/app/mypage/media/MatrixBoard';

// コネックエフ「反映の早見表」（第396便・1b）。★ 部品はフクエスリンクと同じ（コネックエフでは「駅ちかから反映」の表を出さない）。

export default function ConecfMatrixPage() {
  return (
    <ConecfShell current="matrix" title="反映の早見表">
      {() => <MatrixBoard />}
    </ConecfShell>
  );
}
