'use client';

import { ConecfShell } from '../ConecfShell';
import { NewsBoard } from '@/app/mypage/media/NewsBoard';
import { useToast } from '@/app/components/useToast';

// コネックエフ「駅ちか新着情報」（第402便・1f）。★ 中身はフクエスリンクと同じ部品。

export default function ConecfNewsPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="news" title="駅ちか新着情報（自動投稿）" toast={toast}>
      {(a) => <NewsBoard salonId={a.salonId} onToast={showToast} />}
    </ConecfShell>
  );
}
