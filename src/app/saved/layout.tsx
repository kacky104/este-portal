import type { Metadata } from 'next';

// 保存済み一覧は localStorage 依存の個人ページのため検索インデックス対象外（noindex,nofollow）。
// ワーク側の /jobs/saved と同方針。page はクライアントコンポーネントなので metadata は layout に置く。
// robots.txt で Disallow はしない（クロールを止めると Google が noindex を読めず残り続けるため）。
export const metadata: Metadata = {
  title: '保存済みの店舗・セラピスト｜フクエス',
  robots: { index: false, follow: false },
};

export default function SavedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
