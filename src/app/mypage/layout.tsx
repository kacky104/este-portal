import type { Metadata } from 'next';

// /mypage 配下（ユーザー専用マイページ）は検索インデックス対象外。表示（メタ）のみ。
// 認証ガードは各 page.tsx / 既存ロジックが担い、ここでは触れない。
// robots.txt で Disallow はしない（クロールを止めると noindex を読めず残り続けるため）。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MypageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
