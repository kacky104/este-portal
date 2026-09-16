'use client';

import { ConecfShell, ConecfComingSoon } from '../ConecfShell';

// コネックエフ「反映の早見表」（第395便・1a：外枠だけ。中身は準備中）

export default function ConecfMatrixPage() {
  return (
    <ConecfShell current="matrix" title="反映の早見表">
      {() => <ConecfComingSoon />}
    </ConecfShell>
  );
}
