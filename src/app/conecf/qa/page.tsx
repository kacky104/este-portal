'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「よくあるご質問（Q&A）」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfQaPage() {
  return (
    <ConecfShell current="qa" title="よくあるご質問（Q&A）">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
