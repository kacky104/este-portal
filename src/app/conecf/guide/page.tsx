'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「はじめての方へ」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfGuidePage() {
  return (
    <ConecfShell current="guide" title="はじめての方へ">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
