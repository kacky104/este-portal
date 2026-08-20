import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpTherapistView, isHpTherapistOpen } from '@/app/hp/_templates/subpages';

// セラピスト一覧ページ（2026-08-11 マルチページ化）。
//
// - URL: 独自ドメインなら /therapist、暫定URLなら /hp/{slug}/therapist
// - 出る条件: blocks.multipage が true ＋ 在籍1名以上（isHpTherapistOpen）。
//   ★ ブロックの ON/OFF は見ない。マルチページ時の ON/OFF は「トップに抜粋を出すか」だけの
//     意味で、OFF＝トップに載せない店でもこのページとメニューの導線は残る（2026-08-11）。
//   中身が無ければ 404（空ページを検索に出さないため）。
// - ★ 2026-08-20（第25便）: セラピストの個別ページをHP内に新設した（/therapist/[id]・noindex）。
//   カードのリンク先はHP内の個別ページに変更（従来はフクエス本体へ外部リンクだった）。
//   本体への実流入の導線は、個別ページ内の「写メ日記・口コミを見る（フクエス）」が引き継ぐ。
// - ★ ページの中身は _templates/subpages.tsx（デザインプレビューと共用）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpTherapistOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon, therapists } = data;
  return buildHpMetadata(data, slug, {
    title: `セラピスト一覧｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）に在籍するセラピスト${therapists.length}名の一覧です。` +
      '写真・年齢・ひとことプロフィールからお選びいただけます。',
    path: '/therapist',
  });
}

export default async function HpTherapistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpTherapistOpen(data)) notFound();
  return <HpTherapistView data={data} />;
}
