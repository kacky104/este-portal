'use client';

import { ConecfShell } from '../../ConecfShell';
import { SiteCompareBoard } from './SiteCompareBoard';
import { useToast } from '@/app/components/useToast';

// コネックエフ「女性をサイトへ登録」（第398便・1c）。
// ★ 第736便: ベンリー型の一覧表（SiteCompareBoard）に作り直した。★ それまでは TherapistBoard（サイトごとのタブ）。

export default function ConecfGirlsSyncPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="girlsSync" title="セラピスト登録状況一覧" toast={toast}>
      {(a) => <SiteCompareBoard salonId={a.salonId} onToast={showToast} />}
    </ConecfShell>
  );
}
