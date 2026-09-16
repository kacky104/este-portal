'use client';

import { ConecfShell, ConecfComingSoon } from '../../ConecfShell';

// コネックエフ「出勤をサイトへ」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfScheduleSyncPage() {
  return (
    <ConecfShell current="scheduleSync" title="出勤をサイトへ">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
