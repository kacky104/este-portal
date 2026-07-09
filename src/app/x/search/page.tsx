import { Suspense } from 'react';
import { XSearch } from '../XSearch';

// ユーザー/投稿検索は公開情報。取得はすべて XSearch（クライアント）がデバウンスして行う薄いラッパー。
// XSearch は useSearchParams（?q=/?tab=）を使うため Suspense 境界で包む（Next 16 の静的レンダリング要件）。
// 検索結果は薄い/重複ページのため検索インデックス対象外（リンクは辿らせる）。
export const metadata = { title: '検索｜fukuX', robots: { index: false, follow: true } };

export default function XSearchPage() {
  return (
    <Suspense fallback={null}>
      <XSearch />
    </Suspense>
  );
}
