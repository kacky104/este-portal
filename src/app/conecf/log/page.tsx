'use client';

import { ConecfShell } from '../ConecfShell';
import { LogBoard } from '@/app/mypage/media/LogBoard';

// コネックエフ「更新結果」（第396便・1b）。★ 中身はフクエスリンクの「連携の記録」と同じ部品。

export default function ConecfLogPage() {
  return (
    <ConecfShell current="log" title="更新結果">
      {(a) => <LogBoard salonId={a.salonId} />}
    </ConecfShell>
  );
}
