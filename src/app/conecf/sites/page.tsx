'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「ID・PASS登録」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfSitesPage() {
  return (
    <ConecfShell current="sites" title="ID・PASS登録">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
