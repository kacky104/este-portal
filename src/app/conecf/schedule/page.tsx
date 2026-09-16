'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「週間スケジュール」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfSchedulePage() {
  return (
    <ConecfShell current="schedule" title="週間スケジュール">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
