import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { TherapistDiaryBody } from '../../TherapistDiaryBody';
import { buildTherapistDiaryMetadata } from '../../diaryMetadata';

// ★ 第1082便（2026-10-01）: セラピストの写メ日記の2ページ目以降。n=1 は 1ページ目へ 308。整数でない n は 404。

export const revalidate = 600;

export async function generateStaticParams() {
  return [];
}

function parsePage(n: string): number | null {
  return /^[1-9]\d{0,4}$/.test(n) ? Number(n) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; n: string }> }): Promise<Metadata> {
  const { id, n } = await params;
  const page = parsePage(n);
  if (!page || page === 1) return { robots: { index: false, follow: false } };
  return buildTherapistDiaryMetadata(id, page);
}

export default async function TherapistDiaryPageN({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const page = parsePage(n);
  if (!page) notFound();
  if (page === 1) permanentRedirect(`/therapist/${id}/diary`);
  return <TherapistDiaryBody id={id} page={page} />;
}
