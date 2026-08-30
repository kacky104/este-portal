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
// ★★ 途中は全部入りを /mypage/media/all に残していた（足場）。
//   ★ 節を1つずつ独立したページに割っていくあいだ、店舗が全部の操作に
//     たどり着ける形を保つため。★ 作り直しの途中で機能を落とさない。
//   → 第65便で6画面に割り終わったので、足場は畳んだ。
//     ★★ 最後に移したのは「毎回の承認をやめて自動にする」（置き場は出勤を送る）。

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
