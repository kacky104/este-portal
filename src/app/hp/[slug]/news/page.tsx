import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpNewsView, isHpNewsOpen } from '@/app/hp/_templates/subpages';

// お知らせページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /news、暫定URLなら /hp/{slug}/news
// - 出る条件: blocks.multipage が true ＋ 公開中のお知らせが1件以上（isHpNewsOpen）。
//   ★ ブロックの ON/OFF は見ない（ON/OFF はトップに抜粋を出すかの意味。他ページと同じ）。
// - 中身は announcements（フクエスのマイページで書いたお知らせ）そのもの＝二重入力なし。
//   data.ts が最新20件まで取り、トップは先頭3件・ここは全件を出す。
// - サーバーが本文を描くページなので、/therapist・/system と同じく index 可
//   （実際に載るのは独自ドメイン運用の店だけ。判定は buildHpMetadata）。
// - ★ ページの中身は _templates/subpages.tsx（デザインプレビューと共用）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpNewsOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon, news } = data;
  return buildHpMetadata(data, slug, {
    title: `お知らせ｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）からのお知らせ一覧です。` +
      (news[0] ? `最新: ${news[0].title.slice(0, 40)}` : ''),
    path: '/news',
  });
}

export default async function HpNewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpNewsOpen(data)) notFound();
  return <HpNewsView data={data} />;
}
