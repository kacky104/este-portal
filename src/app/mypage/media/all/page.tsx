'use client';

import { useMediaGate } from '../useMediaGate';
import { MediaShell } from '../MediaShell';
import { MediaLinkPanel } from '../../MediaLinkPanel';
import { useToast } from '@/app/components/useToast';

// 媒体連携の【全部入り】（第56便）。
//
// ★★★ これは作り直しの途中を支えるための足場。
//   入口（/mypage/media）から用事ごとの画面へ割っていくが、
//   ★ 割り終わるまでのあいだ、店舗が全部の操作にたどり着けなくなってはいけない。
//   → 第55便までの画面をそのままここに置く。★ MediaLinkPanel は1行も触っていない。
//
// ★ 入口のタイルは、当面この画面の節（#login / #work / #diary / #roster / #log）へ飛ぶ。
//   ★★ 節を独立したページに割り終わったら、このページは畳む。
//     ★ そのときは入口のタイルの行き先を差し替えるだけで済む形にしてある。

export default function MediaLinkAllPage() {
  const { decision, salon, loadError } = useMediaGate();
  const { toast, showToast } = useToast();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      title="媒体連携の設定"
      backHref="/mypage/media"
      backLabel="媒体連携へ戻る"
      toast={toast}
    >
      <MediaLinkPanel
        salonId={salon ? Number(salon.id) : null}
        active={true}
        onToast={showToast}
      />
    </MediaShell>
  );
}
