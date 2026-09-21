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
  // ★ フクエスCRM 専用のファビコン（第633便・水色と紫の F）。ネストした metadata は近いほうが優先 → CRM の画面だけ差し替わる。
  icons: {
    icon: [
      { url: '/favicon-crm.ico', sizes: 'any' },
      { url: '/favicon-crm-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-crm-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: '/apple-touch-icon-crm.png', sizes: '180x180' }],
  },
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
