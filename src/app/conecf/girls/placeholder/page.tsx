'use client';

import { ConecfShell } from '../../ConecfShell';
import { PlaceholderCard } from '../PlaceholderCard';
import { useToast } from '@/app/components/useToast';

// ★ 第1722便（2026-11-02・カッキーさん）: 「セラピスト既定画像」（写真が無いセラピストに使う画像）の画面。
//   第1550便ではセラピスト一覧のいちばん下にたたんで置いていたが、人数が多い店は気づかず設定し忘れる
//   （設定が無いと、写真の無い新人のプロフィール・ジャンルが駅ちかに入らない）→ 左メニューの項目にした。
export default function ConecfPlaceholderPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="placeholder" title="セラピスト既定画像" toast={toast}>
      {() => <PlaceholderCard onToast={showToast} alwaysOpen />}
    </ConecfShell>
  );
}
