import { Suspense } from 'react';
import { XSearch } from '../XSearch';

// ユーザー/投稿検索は公開情報。取得はすべて XSearch（クライアント）がデバウンスして行う薄いラッパー。
// XSearch は useSearchParams（?q=/?tab=）を使うため Suspense 境界で包む（Next 16 の静的レンダリング要件）。
export const metadata = { title: '検索｜fukuX' };

export default function XSearchPage() {
  return (
    <Suspense fallback={null}>
      <XSearch />
    </Suspense>
  );
}
