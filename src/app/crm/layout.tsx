import type { Metadata } from 'next';

// /crm 配下（ログイン・利用規約・顧客データの取り扱い）の外枠（第633便）。★ ファビコンを CRM のものにするだけ。
export const metadata: Metadata = {
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

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
