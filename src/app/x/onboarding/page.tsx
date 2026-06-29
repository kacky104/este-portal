import { redirect } from 'next/navigation';
import { getXContext } from '../xProfile';
import { OnboardingForm } from './OnboardingForm';
import { XLogo } from '../XLogo';

// ログイン必須＋自分の x_profiles 有無で分岐するため動的レンダリング。
export const dynamic = 'force-dynamic';

export default async function XOnboardingPage() {
  const { userId, profile } = await getXContext();

  // 未ログインはログインへ（戻り先は開設フロー）。
  if (!userId) redirect('/x/login');
  // 既に開設済みなら開設フローに来させない（1 auth ユーザー = 1 x_profiles）。
  if (profile) redirect('/x');

  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-white/70 backdrop-blur-md border border-white/40 shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      {/* 見出し＋横長ロゴ（fukuX と一目で分かるように）。狭幅はロゴが下に回り込む。 */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight mb-1 bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent w-fit">
            アカウントを開設
          </h1>
          <p className="text-sm text-slate-500">種別を選んで、プロフィールを設定しましょう。</p>
        </div>
        <div className="flex-shrink-0 self-start sm:self-end">
          <XLogo size="lg" />
        </div>
      </div>
      <OnboardingForm userId={userId} />
    </div>
  );
}
