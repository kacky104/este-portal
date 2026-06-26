import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import { CastSignOutButton } from './CastSignOutButton';

// キャスト管理トップ（フェーズ1：最小実装）。
// ガードはページ内 redirect 方式（proxy.ts は触らない）。
// - 未ログイン → /cast/login。
// - ログイン済みだが user_id に紐づく therapists が無い（会員・オーナー等）→ 案内を表示して弾く。
export default async function CastHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/cast/login');

  const { data: therapist } = await supabase
    .from('therapists')
    .select('id, name, salon_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="flex items-baseline gap-1">
            <span className="font-bold text-[20px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span>
            <span className="text-[12px] font-normal leading-none text-slate-400">キャスト</span>
          </span>
          <CastSignOutButton />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {therapist ? (
          <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-6 space-y-3 text-center">
            <p className="text-xs font-bold text-pink-500">こんにちは</p>
            <h1 className="text-xl font-black text-slate-800">{therapist.name ?? '(名前未設定)'} さん</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              キャスト管理ページ（準備中）です。<br />
              写メ日記・「今すぐ」などの機能は順次ご利用いただけるようになります。
            </p>
          </div>
        ) : (
          // ログインはできたが紐づくキャストが無い別種アカウント
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4 text-center">
            <p className="text-sm text-slate-700 leading-relaxed">
              このアカウントに紐づくキャスト情報が見つかりません。
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              オーナーからの招待メールに記載のアドレスでログインしているかご確認ください。
            </p>
            <Link
              href="/cast/login"
              className="inline-block px-5 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700 transition-colors"
            >
              ログインし直す
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
