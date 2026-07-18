import type { Metadata } from 'next';
import { getSalonIntakeGate } from '@/app/actions/salonIntake';
import { SalonIntakeForm } from './SalonIntakeForm';

// 新規店舗の初回情報入力フォーム。運営が発行したワンタイムURL（トークン）でのみ表示される。
// トークン検証は Server Action（service_role）側で実施。非公開ページのため noindex。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '掲載情報入力フォーム｜フクエス',
  robots: { index: false, follow: false },
};

// 無効・期限切れ・送信済みの案内カード。
function Info({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
      <p className="text-base font-bold text-slate-800">{title}</p>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}

export default async function SalonIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gate = await getSalonIntakeGate(token);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center">
          <span className="text-lg font-black bg-gradient-to-r from-pink-500 to-fuchsia-500 bg-clip-text text-transparent">
            フクエス
          </span>
          <span className="ml-2 text-xs text-slate-400 font-bold">掲載情報入力フォーム</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        {gate.state === 'notfound' && (
          <Info
            title="このURLは無効です"
            body={'URLが正しいかご確認ください。\n解決しない場合は、フクエス運営事務局（info@fukues.com）までご連絡ください。'}
          />
        )}
        {gate.state === 'expired' && (
          <Info
            title="このURLは有効期限が切れています"
            body={'お手数ですが、フクエス運営事務局（info@fukues.com）まで再発行をご依頼ください。'}
          />
        )}
        {gate.state === 'submitted' && (
          <Info
            title="このフォームは送信済みです"
            body={'ご入力ありがとうございました。\n内容をもとに店舗ページを作成し、担当よりご連絡いたします。'}
          />
        )}
        {gate.state === 'ok' && (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {gate.label ? `${gate.label} 様` : '掲載店舗様'}　掲載情報のご入力
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-1">
              このたびはフクエスへの掲載ありがとうございます。店舗ページの作成に必要な情報のご入力をお願いいたします。
            </p>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              ※送信は一度のみです。掲載後の変更はいつでも承りますので、まずは分かる範囲でご入力ください。
            </p>
            <SalonIntakeForm token={token} />
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
