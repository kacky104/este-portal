import { notFound } from 'next/navigation';
import { resolveProfileMini, fetchVerifiedProfiles } from '@/app/x/xFollows';
import { XFollowList } from '@/app/x/XFollowList';

// 運営(official)プロフィールの「承認店舗」カウンタから開く一覧。
// 中身は fukuX 全体の「shop かつ is_verified（インディゴのバッジ）」＝運営が手動で認証した店舗。
// 件数と一致した最新を出すため常に動的（プロフィール本体のカウンタと同じ条件で数える）。
export const dynamic = 'force-dynamic';

// フォロワー一覧と同じく薄いページのため検索インデックス対象外（各プロフィールへのリンクは辿らせる）。
export const metadata = { robots: { index: false, follow: true } };

export default async function XVerifiedShopsPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  // 運営アカウント限定の一覧。他 kind の handle では URL の存在を隠すため 404。
  const target = await resolveProfileMini(decoded);
  if (!target || target.kind !== 'official') notFound();

  const users = await fetchVerifiedProfiles('shop');

  return (
    <XFollowList
      targetHandle={target.handle}
      title="承認店舗"
      users={users}
      emptyText="まだ承認店舗はありません"
    />
  );
}
