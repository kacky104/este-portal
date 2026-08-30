'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { LoginBoard } from '../LoginBoard';
import { useToast } from '@/app/components/useToast';

// ログイン情報（第63便・㉞ その5）。
// ★ 4サイトぶんのログイン情報を1画面に集めた。同意文もここに移した。

export default function MediaLoginPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast, showToast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="ログイン情報"
      current="login"
      toast={toast}
    >
      <LoginBoard salonId={salon ? Number(salon.id) : null} onToast={showToast} />
    </MediaShell>
  );
}
