import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpSystemView, isHpSystemOpen } from '@/app/hp/_templates/subpages';

// コース料金ページ（2026-08-11 マルチページ化）。
//
// - URL: 独自ドメインなら /system、暫定URLなら /hp/{slug}/system
//   （ヘッダーのナビ表記 SYSTEM に合わせた。/menu は飲食店と紛らわしく、
//    /price は検索語そのものだがURL内の単語が順位に効く度合いは今は小さい）
// - 出る条件: blocks.multipage が true ＋ コース登録1件以上（isHpSystemOpen）。
//   ★ ブロックの ON/OFF は見ない（ON/OFF はトップに抜粋を出すかだけの意味）。
// - 料金の元データは salons.courses。公式HPのために二重入力させない。
// - ★ ページの中身は _templates/subpages.tsx（デザインプレビューと共用）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpSystemOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon, courses } = data;
  // 先頭のコースを1つだけ添える（金額の解釈はしない＝登録された文字列をそのまま使う）
  const head = courses[0];
  return buildHpMetadata(data, slug, {
    title: `コース料金｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）のコース料金一覧です。` +
      (head ? `${head.duration} ${head.price} など` : '') +
      `全${courses.length}コース、表示料金はすべて税込みです。`,
    path: '/system',
  });
}

export default async function HpSystemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpSystemOpen(data)) notFound();
  return <HpSystemView data={data} />;
}
