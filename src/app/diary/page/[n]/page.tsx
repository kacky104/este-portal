import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { DiaryListBody } from '../../DiaryListBody';
import { buildDiaryListMetadata } from '../../diaryMetadata';

// ★ 第1082便（2026-10-01）: 写メ日記一覧の2ページ目以降（/diary/page/[n]）。n=1 は /diary へ 308。整数でない n は 404。
//   ★ /diary/[diary_id] とは段数が違う（/diary/page/2 は2段）ので取り合いにならない。

export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

function parsePage(n: string): number | null {
  return /^[1-9]\d{0,4}$/.test(n) ? Number(n) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  const page = parsePage(n);
  if (!page || page === 1) return { robots: { index: false, follow: false } };
  return buildDiaryListMetadata(page);
}

export default async function DiaryListPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const page = parsePage(n);
  if (!page) notFound();
  if (page === 1) permanentRedirect('/diary');
  return <DiaryListBody page={page} />;
}
