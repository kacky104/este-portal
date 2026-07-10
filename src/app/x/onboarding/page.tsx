import { redirect } from 'next/navigation';
import { getXContext } from '../xProfile';
import { OnboardingForm } from './OnboardingForm';
import { XLogo } from '../XLogo';

// ログイン必須＋自分の x_profiles 有無で分岐するため動的レンダリング。
export const dynamic = 'force-dynamic';

// 登録導線（ログイン必須）のため検索インデックス対象外（noindex,nofollow）。
export const metadata = { robots: { index: false, follow: false } };

export default async function XOnboardingPage() {
  const { userId, profile } = await getXContext();

  // 未ログインはログインへ（戻り先は開設フロー）。
  if (!userId) redirect('/x/login');
  // 既に開設済みなら開設フローに来させない（1 auth ユーザー = 1 x_profiles）。
  if (profile) redirect('/x');

  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface-translucent)] backdrop-blur-md border border-white/40 shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      {/* 見出し＋横長ロゴ（タイトルと同じ行の右隣）。サブテキストは行の下。狭幅で収まらない時のみ折り返す。 */}
      <div className="mb-6">
        <div className="flex flex-row flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent w-fit">
            アカウントを開設
          </h1>
          <div className="flex-shrink-0">
            <XLogo size="md" />
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-1">種別を選んで、プロフィールを設定しましょう。</p>
      </div>
      <OnboardingForm userId={userId} />
    </div>
  );
}
