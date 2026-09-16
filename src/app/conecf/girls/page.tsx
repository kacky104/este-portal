'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「女性一覧」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfGirlsPage() {
  return (
    <ConecfShell current="girls" title="女性一覧">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
