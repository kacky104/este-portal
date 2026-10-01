import type { Metadata } from 'next';
import { TherapistDiaryBody } from './TherapistDiaryBody';
import { buildTherapistDiaryMetadata } from './diaryMetadata';

// ★ 第1082便: 1ページ目。2ページ目以降は ./page/[n]/page.tsx（旧 ?page= は next.config の redirects で転送）。
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return buildTherapistDiaryMetadata(id, 1);
}

export const revalidate = 600;

export async function generateStaticParams() {
  return [];
}

export default async function TherapistDiaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TherapistDiaryBody id={id} page={1} />;
}
