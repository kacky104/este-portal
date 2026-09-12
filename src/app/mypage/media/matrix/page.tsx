'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { MatrixBoard } from '../MatrixBoard';
import { useToast } from '@/app/components/useToast';

// 反映の早見表（第299便・2026-09-12・カッキーさん）。
// ★ ホームの折りたたみから独立させた。★ 左サイドバー「連携の記録」の下から来る。
// ★ 読むだけの画面。★ 操作は無いので onToast は渡さない（外枠の toast だけ受ける）。

export default function MediaMatrixPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="反映の早見表"
      current="matrix"
      toast={toast}
    >
      <MatrixBoard />
    </MediaShell>
  );
}
