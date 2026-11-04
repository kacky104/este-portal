'use client';

import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { ShiftBoard } from '@/app/components/shift/ShiftBoard';
import { useConecfSession } from '../ConecfSession';

// コネックエフ「シフト管理表」（2026-11-04・店舗様のご要望）。中身は ShiftBoard（マイページと同じ）。
// ★ メニューに出るのは SHIFT_SALON_IDS の店だけ（ConecfShell の shiftNav）。それ以外の店が直接開いても「まだお使いいただけません」。
export default function ConecfShiftPage() {
  const { toast, showToast } = useToast();
  // ★ 第1740便: 開いて「見た」が進んだら、左メニューの「新しい希望」バッジを読み直す
  const { refresh } = useConecfSession();
  return (
    <ConecfShell current="shift" title="シフト希望管理表" toast={toast} wide>
      {() => <ShiftBoard onToast={showToast} onSeen={() => void refresh()} />}
    </ConecfShell>
  );
}
