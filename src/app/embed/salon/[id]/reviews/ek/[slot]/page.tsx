import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ReviewsEmbed } from '../../ReviewsEmbed';

// 公式HP向けの口コミの埋め込み・駅ちか対策つき（第1909便・2026-11-10）。口コミを押すと駅ちかの口コミページへ行く。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedSalonReviewsEkPage({ params }: { params: Promise<{ id: string; slot: string }> }) {
  const { id, slot } = await params;
  const s = Number(slot);
  if (!Number.isInteger(s) || s < 1 || s > 9) notFound();
  return <ReviewsEmbed id={id} ekSlot={s} />;
}
