'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「今すぐ一括」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfNowPage() {
  return (
    <ConecfShell current="now" title="今すぐ一括">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
