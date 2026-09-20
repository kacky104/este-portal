import type { Metadata } from 'next';

// 同意書の送信が終わったあとの画面（第560便）。★ 同意書の中身は出さない（戻るボタンで同意書に戻れないように、送信後はここへ置き換える）。

export const metadata: Metadata = {
  title: 'ご案内',
  description: '',
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
};

export default async function GuideDonePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const time = /^\d{2}:\d{2}$/.test(String(t ?? '')) ? String(t) : '';
  return (
    <main className="mx-auto w-full max-w-md bg-white px-5 py-16 text-center">
      <p className="text-[40px] leading-none text-emerald-600">✓</p>
      <p className="mt-4 text-[18px] font-black text-slate-800">{time ? `${time}〜の予約で了承しました` : '了承しました'}</p>
      <p className="mt-3 text-[14px] text-slate-500">ありがとうございました。この画面は閉じてください。</p>
    </main>
  );
}
