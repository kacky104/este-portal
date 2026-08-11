import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpVoiceView, isHpVoiceOpen } from '@/app/hp/_templates/subpages';

// 口コミページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /voice、暫定URLなら /hp/{slug}/voice
// - トップの埋め込み（iframe・3件）と違い、このページはHPが自分で一覧を描く
//   （ひな形のデザインに馴染む・最新30件）。承認済みのみ・取得は lib/reviews.ts に集約。
// - ★ デモ店（slug='demo'）だけは全店の口コミを出す（サンプルとして中身を見せるため）。
//   実店舗は必ず自店のぶんだけ＋平均評価も出す。
// - 出る条件: blocks.multipage が true ＋ 承認済み口コミ1件以上（isHpVoiceOpen）。
// - ★ 常に noindex。口コミの正規ページはフクエス本体（/salon/[id]/reviews）にあり、
//   ここに一覧を出して index させると本体との重複コンテンツになるため。sitemap にも載せない。
// - ★ ページの中身は _templates/subpages.tsx（デザインプレビューと共用）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpVoiceOpen(data)) return HP_NOT_PUBLIC_METADATA;
  return {
    title: `口コミ｜${data.salon.name}`,
    robots: { index: false, follow: true }, // 冒頭コメント参照（本体と重複するため常に noindex）
  };
}

export default async function HpVoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpVoiceOpen(data)) notFound();
  return <HpVoiceView data={data} />;
}
