import type { Metadata } from 'next';
import { ReviewsEmbed } from './ReviewsEmbed';

// 口コミの埋め込み（外部サイト向け・公式HPの既定）。中身は ./ReviewsEmbed.tsx（第1909便で切り出し）。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedSalonReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewsEmbed id={id} />;
}
