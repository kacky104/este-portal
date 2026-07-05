import type { Metadata } from 'next';

// /cast 配下（セラピスト専用：ダッシュボード・ログイン・パスワード再設定等）は検索インデックス対象外。
// 表示（メタ）のみ。認証ガードは各 page.tsx / 既存ロジックが担い、ここでは触れない。
// robots.txt で Disallow はしない（クロールを止めると noindex を読めず残り続けるため）。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CastLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
