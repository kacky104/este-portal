import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DiaryEmbed } from '../../DiaryEmbed';
import { HP_DIARY_COUNT_MIN, HP_DIARY_COUNT_MAX } from '@/app/lib/hpSite';

// 公式HP（フクエスサイト）向けの写メ日記の埋め込み（第1897便・2026-11-10）。
//   管理画面「表示ブロック」の写メ日記の件数（1〜12）で出す。中身は ../../DiaryEmbed.tsx（外部サイト向けと共通）。
//   ★ 件数は URL の段で受ける（?count= だと ISR が効かず毎回動的になる）。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedSalonDiaryCountPage({
  params,
}: {
  params: Promise<{ id: string; count: string }>;
}) {
  const { id, count } = await params;
  const n = Number(count);
  if (!Number.isInteger(n) || n < HP_DIARY_COUNT_MIN || n > HP_DIARY_COUNT_MAX) notFound();
  return <DiaryEmbed id={id} max={n} />;
}
