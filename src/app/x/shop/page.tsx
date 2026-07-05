import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { getXContext } from '../xProfile';
import { fetchAffiliatedTherapists, type TherapistMini } from '../xAffiliation';
import { XShop, type PendingRequest } from './XShop';

// 自分のログイン状態・所属/申請状況を読むため動的レンダリング。
export const dynamic = 'force-dynamic';

// 店舗管理（ログイン＋認証必須）のため検索インデックス対象外（noindex,nofollow）。
export const metadata = { robots: { index: false, follow: false } };

export default async function XShopPage() {
  const { userId, profile } = await getXContext();

  // 未ログイン → ログインへ。アカウント未開設 or 店舗以外 → /x トップへ。
  if (!userId) redirect('/x/login');
  if (!profile || profile.kind !== 'shop') redirect('/x');

  // 未認証店舗：リダイレクトせず「運営の認証が必要」案内を表示（所属操作は verified のみ）。
  if (!profile.is_verified) {
    return (
      <div className="x-card my-6 p-6 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
        <h1 className="text-xl font-black tracking-tight mb-2">店舗管理</h1>
        <div className="mt-2 p-4 rounded-2xl bg-amber-50 border border-amber-100">
          <p className="text-sm font-bold text-amber-700">運営の認証が必要です</p>
          <p className="text-[12px] text-amber-600/90 mt-1 leading-relaxed">
            セラピストの所属管理は、運営による認証（認証バッジ）を受けた店舗のみご利用いただけます。
            認証されると、このページから @ID 検索で所属申請ができるようになります。
          </p>
        </div>
        <Link href="/x" className="inline-block mt-4 text-xs font-bold text-indigo-500 hover:text-indigo-700">
          ← fukuX トップへ戻る
        </Link>
      </div>
    );
  }

  const supabase = await createClient();

  // 自分が出した pending 申請（申請先セラピストの最小情報を辞書引きで合流：N+1回避）と所属セラピスト一覧。
  const [reqRes, affiliated] = await Promise.all([
    supabase
      .from('x_affiliation_requests')
      .select('id, therapist_profile_id, created_at')
      .eq('shop_profile_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    fetchAffiliatedTherapists(supabase, profile.id),
  ]);

  const reqRows = (reqRes.data ?? []) as Array<{
    id: number | string;
    therapist_profile_id: string;
    created_at: string;
  }>;
  const therapistIds = [...new Set(reqRows.map((r) => r.therapist_profile_id).filter(Boolean))];

  const tDict = new Map<string, TherapistMini>();
  if (therapistIds.length > 0) {
    const { data: ts } = await supabase
      .from('x_profiles')
      .select('id, handle, display_name, avatar_url')
      .in('id', therapistIds);
    (ts ?? []).forEach((t) =>
      tDict.set(t.id as string, {
        id: t.id as string,
        handle: (t.handle as string) ?? '',
        displayName: (t.display_name as string) ?? '',
        avatarUrl: (t.avatar_url as string | null) ?? null,
      })
    );
  }

  const pending: PendingRequest[] = reqRows
    .map((r) => {
      const th = tDict.get(r.therapist_profile_id);
      return th ? { requestId: String(r.id), therapist: th } : null;
    })
    .filter((v): v is PendingRequest => v !== null);

  return (
    <XShop shopProfileId={profile.id} initialPending={pending} initialAffiliated={affiliated} />
  );
}
