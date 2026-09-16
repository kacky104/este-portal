'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { QaBoard } from '../QaBoard';
import { useToast } from '@/app/components/useToast';

// よくあるご質問（Q&A）（第394便b・2026-09-16・カッキーさん）。★ 使い方のページから分けた。
// ★ フクエスリンクを初めて開いた店舗オーナー様向け。★ 読むだけの画面（操作は各画面へのリンクだけ）。
// ★ 中身は lib/mediaGuide.ts の GUIDE_QA。

export default function MediaQaPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="よくあるご質問（Q&A）"
      current="qa"
      toast={toast}
    >
      <QaBoard />
    </MediaShell>
  );
}
