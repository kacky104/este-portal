import { notFound } from 'next/navigation';
import { resolveProfileMini, fetchFollowUsers } from '@/app/x/xFollows';
import { XFollowList } from '@/app/x/XFollowList';

// フォロー一覧は公開データだが人数と一致した最新を出すため常に動的（Cookieは読まない＝閲覧者非依存）。
export const dynamic = 'force-dynamic';

// フォロー中一覧は薄いページのため検索インデックス対象外（プロフィールへのリンクは辿らせる）。
export const metadata = { robots: { index: false, follow: true } };

export default async function XFollowingPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  const target = await resolveProfileMini(decoded);
  if (!target) notFound();

  const users = await fetchFollowUsers(target.id, 'following');

  return (
    <XFollowList
      targetHandle={target.handle}
      title={`${target.displayName}さんのフォロー中`}
      users={users}
      emptyText="まだ誰もフォローしていません"
    />
  );
}
