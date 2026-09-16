'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「更新結果」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfLogPage() {
  return (
    <ConecfShell current="log" title="更新結果">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
