import type { Metadata } from 'next';

// 店舗ドメイン/admin（公式HPの管理画面）の共通レイアウト。
// 親の /hp/layout.tsx が暗い額縁背景を敷いているので、管理画面はここで明るい背景に戻す。
// 管理画面は絶対に検索へ出さない（店舗ドメインの robots.txt でも Disallow: /admin を出している）。

export const metadata: Metadata = {
  title: 'ホームページ管理',
  robots: { index: false, follow: false },
};

export default function HpAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
