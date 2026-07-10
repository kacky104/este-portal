import { createClient } from '@/app/lib/supabase/server';
import { seededWeightedShuffle, thirtyMinSeed } from '@/lib/shuffle';

export type OfferTherapist = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  age: number | null;
  height: number | null;
  offerComment: string | null;
  offerAreas: string[];
};

// オファー一覧用: 承認済み・オファー受付中・未所属のセラピストを30分シードでシャッフルして返す。
// 閲覧は認証済みshop・official のみ（ページ側でゲート）＝anonではなくログインクライアントで取得する。
export async function fetchOfferTherapists(): Promise<OfferTherapist[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, is_verified, age, height, offer_comment, offer_areas')
    .eq('kind', 'therapist')
    .eq('status', 'approved')
    .eq('offer_enabled', true)
    .is('affiliated_shop_id', null); // 所属が決まると自動で一覧から外れる
  const rows = (data ?? []).map((r) => ({
    id: String(r.id),
    handle: r.handle as string,
    displayName: r.display_name as string,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    isVerified: Boolean(r.is_verified),
    age: (r.age as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    offerComment: (r.offer_comment as string | null) ?? null,
    offerAreas: (r.offer_areas as string[] | null) ?? [],
  }));
  return seededWeightedShuffle(rows, thirtyMinSeed(), () => 1.0);
}
