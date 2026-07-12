import type { Metadata } from 'next';

// 新しいパスワードの設定ページは検索インデックス対象外（noindex,nofollow）。/login と同方針。
// page はクライアントコンポーネントなので metadata は layout に置く。
// robots.txt で Disallow はしない（クロールを止めると Google が noindex を読めず残り続けるため）。
export const metadata: Metadata = {
  title: '新しいパスワードの設定｜フクエス',
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
