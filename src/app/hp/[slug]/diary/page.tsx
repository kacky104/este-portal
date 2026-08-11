import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpDiaryView, isHpDiaryOpen } from '@/app/hp/_templates/subpages';

// 写メ日記ページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /diary、暫定URLなら /hp/{slug}/diary
// - トップの埋め込み（iframe・最大12件）と違い、このページはHPが自分で一覧を描く
//   （ひな形のデザインに馴染む・件数も多い＝最新36件）。取得条件は埋め込みと同じ。
//   サムネイルはフクエス本体の日記詳細を新しいタブで開く（実流入の導線）。
// - ★ デモ店（slug='demo'）だけは全店の日記を出す（サンプルサイトとして中身を見せるため。
//   デモ用サロン自身には日記が無い）。実店舗は必ず自店のぶんだけ。
// - 出る条件: blocks.multipage が true ＋ 日記1件以上（isHpDiaryOpen）。
// - ★ 常に noindex。日記の本文・正規ページはフクエス本体（/diary/[id]）にあり、
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
  if (!data || !isHpDiaryOpen(data)) return HP_NOT_PUBLIC_METADATA;
  return {
    title: `写メ日記｜${data.salon.name}`,
    robots: { index: false, follow: true }, // 冒頭コメント参照（本体と重複するため常に noindex）
  };
}

export default async function HpDiaryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpDiaryOpen(data)) notFound();
  return <HpDiaryView data={data} />;
}
