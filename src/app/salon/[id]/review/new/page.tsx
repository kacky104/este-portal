import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/app/components/Logo';
import { createPublicClient } from '@/app/lib/supabase/public';
import { getSalonActiveTherapists } from '@/app/lib/reviews';
import { SalonReviewForm } from './SalonReviewForm';

// 口コミ投稿ページ（ログイン会員向け）。ログイン判定はフォーム側（クライアント）で行うため、
// ここは店舗名・在籍セラピストを取得してフォームを描画するだけ。
// 投稿用ページなので ISR 不要（公開セラピスト/サロン詳細の ISR には影響しない）。
export const dynamic = 'force-dynamic';

export default async function SalonReviewNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const salonId = Number(id);
  if (!Number.isFinite(salonId)) notFound();

  const supabase = createPublicClient();
  const { data: salon } = await supabase
    .from('salons')
    .select('id, name')
    .eq('id', salonId)
    .maybeSingle();
  if (!salon) notFound();

  const therapists = await getSalonActiveTherapists(salonId);
  const salonName = (salon.name as string) ?? '';

  return (
    <div className="min-h-screen bg-pink-50/40">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <Link
            href={`/salon/${salonId}`}
            className="text-sm font-medium text-slate-500 hover:text-pink-600 transition-colors"
          >
            店舗ページへ戻る
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-orange-400 to-pink-600" />
          <h1 className="text-xl font-bold text-slate-900">口コミを書く</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6 truncate">{salonName}</p>

        <SalonReviewForm salonId={salonId} salonName={salonName} therapists={therapists} />
      </main>
    </div>
  );
}
