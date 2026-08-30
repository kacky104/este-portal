'use client';

import { useMediaGate } from './useMediaGate';
import { MediaShell } from './MediaShell';
import { MediaHome } from './MediaHome';

// 媒体連携の入口（第55便で新設・第56便で中身を入れ替え）。
//
// ★★★ 第55便までは、この場所に MediaLinkPanel（全部入り・1084行）をそのまま置いていた。
//   ★ 8つのかたまりが同じ大きさで縦に並ぶ形は、連携先が4サイトになると持たない
//     （設計メモ §151・§152）。
//   → この画面は【状態を見せること】だけを引き受け、操作は各画面へ渡す。
//
// ★★ 全部入りは /mypage/media/all に残してある。
//   ★ 節を1つずつ独立したページに割っていくあいだも、店舗が全部の操作に
//     たどり着ける形を保つため。★ 作り直しの途中で機能を落とさない。

export default function MediaLinkPage() {
  const { decision, salon, loadError } = useMediaGate();

  return (
    <MediaShell
      decision={decision}
      loadError={loadError}
      salonId={salon ? Number(salon.id) : null}
      salonName={salon?.name ?? null}
      title="ホーム"
      current="home"
    >
      <MediaHome
        salonId={salon ? Number(salon.id) : null}
        salonName={salon?.name ?? null}
      />
    </MediaShell>
  );
}
