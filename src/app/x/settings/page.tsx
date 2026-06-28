import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { getXContext } from '../xProfile';
import { fetchShopMini, type ShopMini } from '../xAffiliation';
import { XSettingsForm } from './XSettingsForm';

// ログイン必須＋自分の x_profiles の編集なので動的レンダリング。
export const dynamic = 'force-dynamic';

export default async function XSettingsPage() {
  const { userId, email, profile } = await getXContext();

  // 未ログイン → ログインへ。未開設 → 開設フローへ。
  if (!userId) redirect('/x/login');
  if (!profile) redirect('/x/onboarding');

  // 自主脱退ボタン用に所属先（あれば）を解決（therapist のみ）。
  let affiliatedShop: ShopMini | null = null;
  if (profile.kind === 'therapist' && profile.affiliated_shop_id) {
    const supabase = await createClient();
    affiliatedShop = await fetchShopMini(supabase, profile.affiliated_shop_id);
  }

  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(168,85,247,0.25)]">
      <h1 className="text-2xl font-black tracking-tight mb-1">プロフィール設定</h1>
      <p className="text-sm text-slate-500 mb-6">表示名・自己紹介・画像を編集できます。</p>
      <XSettingsForm profile={profile} email={email} affiliatedShop={affiliatedShop} />
    </div>
  );
}
