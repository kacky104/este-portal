import { redirect } from 'next/navigation';
import { getXContext } from '../xProfile';
import { OnboardingForm } from './OnboardingForm';

// ログイン必須＋自分の x_profiles 有無で分岐するため動的レンダリング。
export const dynamic = 'force-dynamic';

export default async function XOnboardingPage() {
  const { userId, profile } = await getXContext();

  // 未ログインはログインへ（戻り先は開設フロー）。
  if (!userId) redirect('/x/login');
  // 既に開設済みなら開設フローに来させない（1 auth ユーザー = 1 x_profiles）。
  if (profile) redirect('/x');

  return (
    <div className="py-8">
      <h1 className="text-2xl font-black tracking-tight mb-1">アカウントを開設</h1>
      <p className="text-sm text-slate-500 mb-6">種別を選んで、表示名と ID を設定してください。</p>
      <OnboardingForm userId={userId} />
    </div>
  );
}
