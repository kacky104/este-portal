'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { GuideBoard } from '../GuideBoard';
import { useToast } from '@/app/components/useToast';

// はじめての方へ（使い方・Q&A）（第394便・2026-09-16・カッキーさん）。
// ★ フクエスリンクを初めて開いた店舗オーナー様向け。★ 読むだけの画面（操作は各画面へのリンクだけ）。
// ★ 中身は lib/mediaGuide.ts（★ 文言の正は1か所）。

export default function MediaGuidePage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="はじめての方へ（使い方・Q&A）"
      current="guide"
      toast={toast}
    >
      <GuideBoard />
    </MediaShell>
  );
}
