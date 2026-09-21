import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { crmBaseFor } from '@/lib/crmHost';
import { CrmBaseProvider } from './CrmBase';

// フクエスCRM（/mypage/crm）の外枠（2026-09-19）。
// ★ ログインの見張りは親（/mypage/layout.tsx）が済ませている。★ 有料かどうかはページ側（サーバー処理）で判定。
// ★ 第631便: fukuescrm.com から来たときはリンクの頭を '' にする（CrmBaseProvider で配る）。
// ★ 地は薄い藍色。★ 予約ボード（無料・/mypage）とは別の画面だと、色でも分かるようにする。

export const metadata: Metadata = {
  title: 'フクエスCRM（顧客台帳）',
  robots: { index: false, follow: false },
};

export default async function MypageCrmLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const base = crmBaseFor(h.get('x-forwarded-host') ?? h.get('host'));
  return (
    <CrmBaseProvider base={base}>
      <div className="min-h-screen bg-[#eef1f8]">{children}</div>
    </CrmBaseProvider>
  );
}
