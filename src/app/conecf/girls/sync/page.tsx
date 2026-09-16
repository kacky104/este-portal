'use client';

import { ConecfShell } from '../../ConecfShell';
import { TherapistBoard } from '@/app/mypage/media/TherapistBoard';
import { useToast } from '@/app/components/useToast';

// コネックエフ「女性をサイトへ登録」（第398便・1c）。
// ★ 中身はフクエスリンクの「セラピスト設定」と同じ部品（各サイトの名簿との結び付け・新しく登録）。

export default function ConecfGirlsSyncPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="girlsSync" title="女性をサイトへ登録" toast={toast}>
      {(a) => <TherapistBoard salonId={a.salonId} onToast={showToast} />}
    </ConecfShell>
  );
}
