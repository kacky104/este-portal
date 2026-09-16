'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「写メ日記転送」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfDiaryPage() {
  return (
    <ConecfShell current="diary" title="写メ日記転送">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
