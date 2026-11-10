'use client';

import { ConecfShell } from '../ConecfShell';
import { HpAnalyticsView } from '@/app/components/HpAnalyticsView';

// ★ 第1792便（カッキーさん・2026-11-08）: コネックエフ「アクセス解析（公式HP）」。中身は HpAnalyticsView（公式HP管理の「アクセス解析」と同じ）。
//   ★ 公式ホームページを公開していないお店は「公開しているお店で使えます」の案内だけ出る。
export default function ConecfAnalyticsPage() {
  return (
    <ConecfShell current="analytics" title="アクセス解析（公式ホームページ）" wide>
      {(a) => (a.salonId != null ? <HpAnalyticsView salonId={a.salonId} siteLinks /> : null)}
    </ConecfShell>
  );
}
