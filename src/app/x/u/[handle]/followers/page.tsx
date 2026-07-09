import { notFound } from 'next/navigation';
import { resolveProfileMini, fetchFollowUsers } from '@/app/x/xFollows';
import { XFollowList } from '@/app/x/XFollowList';
import { getXContext } from '@/app/x/xProfile';
import { createClient } from '@/app/lib/supabase/server';

// フォロー一覧は公開データだが人数と一致した最新を出すため常に動的。
// スキボタンの owner/kind 判定は本人依存なので Cookie 経由で行う（このページのみ閲覧者依存になる）。
export const dynamic = 'force-dynamic';

// フォロワー一覧は薄いページのため検索インデックス対象外（プロフィールへのリンクは辿らせる）。
export const metadata = { robots: { index: false, follow: true } };

export default async function XFollowersPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  const target = await resolveProfileMini(decoded);
  if (!target) notFound();

  const users = await fetchFollowUsers(target.id, 'followers');

  // スキボタンを出すのは「本人（このプロフィールの owner）かつ therapist」のときだけ。
  const { profile } = await getXContext();
  const sukiEnabled = !!profile && profile.id === target.id && profile.kind === 'therapist';

  // owner かつ therapist のときだけ、表示中フォロワーに対する既存スキ（from=自分）をまとめ取得して初期状態に。
  let initialSukiIds: string[] = [];
  if (sukiEnabled && users.length > 0) {
    const supabase = await createClient();
    const { data: sukiRows } = await supabase
      .from('x_suki')
      .select('to_profile_id')
      .eq('from_profile_id', profile.id)
      .in('to_profile_id', users.map((u) => u.id));
    initialSukiIds = ((sukiRows ?? []) as Array<{ to_profile_id: string }>).map((r) => r.to_profile_id);
  }

  return (
    <XFollowList
      targetHandle={target.handle}
      title={`${target.displayName}さんのフォロワー`}
      users={users}
      emptyText="まだフォロワーはいません"
      sukiEnabled={sukiEnabled}
      initialSukiIds={initialSukiIds}
    />
  );
}
