import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpInfoView, isHpInfoOpen } from '@/app/hp/_templates/subpages';

// 店舗情報ページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /info、暫定URLなら /hp/{slug}/info
// - 中身はフクエス本体の店舗情報（salons）そのもの＝二重入力なし。
//   トップの店舗情報セクション（住所・営業時間・アクセス・電話）に加えて、
//   エリア・定休日・支払い方法まで載せる「詳しい版」。
// - 出る条件: blocks.multipage が true のみ（店舗情報は常に中身がある）。
// - サーバーが本文を描くページなので index 可・sitemap にも載せる。
//   独自ドメインでは LocalBusiness 系の構造化データも出す（店の公式サイトとしての基本情報）。
// - ★ ページの中身は _templates/subpages.tsx（デザインプレビューと共用）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpInfoOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon } = data;
  return buildHpMetadata(data, slug, {
    title: `店舗情報・アクセス｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）の店舗情報です。` +
      [salon.address, salon.access, salon.hours ? `営業時間 ${salon.hours}` : '']
        .filter((v) => v !== '')
        .join('｜')
        .slice(0, 90),
    path: '/info',
  });
}

export default async function HpInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpInfoOpen(data)) notFound();
  return <HpInfoView data={data} />;
}
