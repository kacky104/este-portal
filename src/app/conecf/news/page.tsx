'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「駅ちか新着情報」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfNewsPage() {
  return (
    <ConecfShell current="news" title="駅ちか新着情報">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
