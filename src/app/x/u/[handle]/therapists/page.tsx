import { notFound } from 'next/navigation';
import { resolveProfileMini, fetchVerifiedProfiles } from '@/app/x/xFollows';
import { XFollowList } from '@/app/x/XFollowList';

// 運営(official)プロフィールの「赤バッジセラピスト」カウンタから開く一覧。
// 中身は fukuX 全体の「therapist かつ is_verified（赤のバッジ）」＝所属＋画像付き投稿10件以上で自動付与された認証。
// 件数と一致した最新を出すため常に動的（プロフィール本体のカウンタと同じ条件で数える）。
export const dynamic = 'force-dynamic';

// フォロワー一覧と同じく薄いページのため検索インデックス対象外（各プロフィールへのリンクは辿らせる）。
export const metadata = { robots: { index: false, follow: true } };

export default async function XVerifiedTherapistsPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  // 運営アカウント限定の一覧。他 kind の handle では URL の存在を隠すため 404。
  const target = await resolveProfileMini(decoded);
  if (!target || target.kind !== 'official') notFound();

  const users = await fetchVerifiedProfiles('therapist');

  return (
    <XFollowList
      targetHandle={target.handle}
      title="赤バッジセラピスト"
      users={users}
      emptyText="まだ赤バッジのセラピストはいません"
    />
  );
}
