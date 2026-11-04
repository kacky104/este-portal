'use client';

import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { ShiftBoard } from '@/app/components/shift/ShiftBoard';

// コネックエフ「シフト管理表」（2026-11-04・店舗様のご要望）。中身は ShiftBoard（マイページと同じ）。
// ★ メニューに出るのは SHIFT_SALON_IDS の店だけ（ConecfShell の shiftNav）。それ以外の店が直接開いても「まだお使いいただけません」。
export default function ConecfShiftPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="shift" title="シフト管理表" toast={toast} wide>
      {() => <ShiftBoard onToast={showToast} />}
    </ConecfShell>
  );
}
