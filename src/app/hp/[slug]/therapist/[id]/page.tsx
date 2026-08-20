import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { fetchHpTherapistDetail } from '@/app/hp/_lib/subpageData';
import { HpTherapistDetailView, isHpTherapistOpen } from '@/app/hp/_templates/subpages';
import { HP_DEMO_SLUG, normalizeHpSiteKey } from '@/app/lib/hpSite';

// セラピスト個別ページ（2026-08-20 第25便・オーナー要望でマルチページ化）。
//
// - URL: 独自ドメインなら /therapist/{id}、暫定URLなら /hp/{slug}/therapist/{id}
// - 出る条件: セラピスト一覧と同じ（マルチページ＋在籍1名以上）＋
//   その id が data.therapists（在籍のみ）に居ること。他店の id・退店済みは 404。
// - ★★ このページは常に【noindex】（buildHpMetadata の noindex: true）。
//   フクエス本体の /therapist/[id] と内容が重複するため、検索対象は本体側に一本化する
//   （2026-08-20 オーナー判断）。sitemap にも載せない（hp/[slug]/sitemap.xml は触っていない）。
// - ★ 保存時の即時反映は /api/revalidate の revalidatePath('/hp/[slug]', 'layout')（第25便）が
//   このページも含めて無効化するので、個別の対応は不要。
// - ★ id の存在確認を fetchHpTherapistDetail より【先に】data.therapists で行うこと。
//   確認せずにDBへ id を渡すと、URLに数字以外を入れられたとき型エラー＝500になり得る。
// - ページの中身は _templates/subpages.tsx の HpTherapistDetailView。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpTherapistOpen(data)) return HP_NOT_PUBLIC_METADATA;
  const t = data.therapists.find((x) => x.id === id);
  if (!t) return HP_NOT_PUBLIC_METADATA;

  const { salon } = data;
  return buildHpMetadata(data, slug, {
    title: `${t.name}｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）のセラピスト「${t.name}」のプロフィールと出勤スケジュールです。`,
    path: `/therapist/${id}`,
    noindex: true, // 本体の /therapist/[id] との重複回避（2026-08-20 オーナー判断）
  });
}

export default async function HpTherapistDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpTherapistOpen(data)) notFound();

  // 在籍リストに居るかを先に確認（他店の id・退店済み・不正な id はここで 404）
  const therapist = data.therapists.find((x) => x.id === id);
  if (!therapist) notFound();

  // プロフィール文と複数写真だけ追加取得（デモ店は data.ts と同じ作法で service_role）
  const detail = await fetchHpTherapistDetail(data.salon.id, id, {
    demo: normalizeHpSiteKey(slug) === HP_DEMO_SLUG,
  });
  if (!detail) notFound();

  return <HpTherapistDetailView data={data} therapist={therapist} detail={detail} />;
}
