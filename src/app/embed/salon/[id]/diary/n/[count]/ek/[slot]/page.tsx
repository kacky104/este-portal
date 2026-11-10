import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DiaryEmbed } from '../../../../DiaryEmbed';
import { HP_DIARY_COUNT_MIN, HP_DIARY_COUNT_MAX } from '@/app/lib/hpSite';

// 公式HP向けの写メ日記の埋め込み・駅ちか対策つき（第1908便・2026-11-10）。
//   画像を押すと駅ちかの写メ日記へ行く（公式HPの「駅ちか対策・もっと見る」が ON の店だけがこの URL を使う）。
//   ★ 枠は URL の段で受ける（?slot= だと ISR が効かない）。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedSalonDiaryEkPage({
  params,
}: {
  params: Promise<{ id: string; count: string; slot: string }>;
}) {
  const { id, count, slot } = await params;
  const n = Number(count);
  const s = Number(slot);
  if (!Number.isInteger(n) || n < HP_DIARY_COUNT_MIN || n > HP_DIARY_COUNT_MAX) notFound();
  if (!Number.isInteger(s) || s < 1 || s > 9) notFound();
  return <DiaryEmbed id={id} max={n} showMore={false} ekSlot={s} />;
}
