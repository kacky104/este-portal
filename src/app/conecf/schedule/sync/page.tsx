'use client';

import { ConecfShell } from '../../ConecfShell';
import { WorkSend } from '@/app/mypage/media/WorkSend';
import { useToast } from '@/app/components/useToast';

// コネックエフ「出勤をサイトへ」（第399便・1d）。
// ★ 中身はフクエスリンクの「出勤の自動更新設定」と同じ部品（第393便の1本道）。
// ★ 送る元は therapist_schedules（＝コネックエフの週間スケジュールで保存した出勤）。

export default function ConecfScheduleSyncPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="scheduleSync" title="出勤をサイトへ" toast={toast}>
      {(a) => <WorkSend salonId={a.salonId} onToast={showToast} />}
    </ConecfShell>
  );
}
