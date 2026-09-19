import type { Metadata } from 'next';

// フクエスCRM（/mypage/crm）の外枠（2026-09-19）。
// ★ ログインの見張りは親（/mypage/layout.tsx）が済ませている。★ 有料かどうかはページ側（サーバー処理）で判定。
// ★ 地は薄い藍色。★ 予約ボード（無料・/mypage）とは別の画面だと、色でも分かるようにする。

export const metadata: Metadata = {
  title: 'フクエスCRM（顧客台帳）',
  robots: { index: false, follow: false },
};

export default function MypageCrmLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#eef1f8]">{children}</div>;
}
