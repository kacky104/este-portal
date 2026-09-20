import type { Metadata } from 'next';
import { getConsentPage } from '@/app/actions/consent';
import { ConsentForm } from './ConsentForm';

// 来店時の同意書（第560便・2026-09-20）。部屋の QR から開く公開ページ。
// ★ 履歴に残っても目立たないように、題名は「ご案内」だけ。業種や「同意書」という言葉は題名に出さない。
// ★ 毎回その場のデータで作る（キャッシュしない）。検索にも出さない。

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ご案内',
  description: '',
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
};

export default async function GuidePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getConsentPage(token);
  if (!data.ok) {
    const msg = data.reason === 'no_booking'
      ? 'いまはこのお部屋の受付時間ではありません。スタッフにお声がけください。'
      : 'このページはいま使えません。スタッフにお声がけください。';
    return (
      <main className="mx-auto w-full max-w-md bg-white px-5 py-16 text-center">
        <p className="text-[15px] leading-relaxed text-slate-600">{msg}</p>
      </main>
    );
  }
  return <ConsentForm token={token} title={data.title} body={data.body} candidates={data.candidates} />;
}
