import type { Metadata } from 'next';

// フクエスCRM ログイン（第631便）。★ 検索に出さない。
export const metadata: Metadata = {
  title: 'ログイン｜フクエスCRM',
  robots: { index: false, follow: false },
};

export default function CrmLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
