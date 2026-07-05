import type { Metadata } from 'next';

// ログインページは検索インデックス対象外（noindex,nofollow）。表示（メタ）のみ。
// title も固有値にして、noindex が効くまでの検索結果の見た目を整える。
// robots.txt で Disallow はしない（クロールを止めると Google が noindex を読めず残り続けるため）。
export const metadata: Metadata = {
  title: 'ログイン｜フクエス',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
