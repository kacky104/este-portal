import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { buildSalonSubpageMetadata } from '../../../subpageMetadata';
import { SalonDiaryBody } from '../../SalonDiaryBody';

// ★ 第1082便（2026-10-01）: 店舗の写メ日記の2ページ目以降（/salon/[id]/diary/page/[n]）。
//   ★ n=1 は 1ページ目（/salon/[id]/diary）へ 308（同じ中身の URL を2つ作らない）。
//   ★ 整数でない n は 404。無い番号は本体側で 404。

export const revalidate = 600;

export async function generateStaticParams() {
  return [];
}

function parsePage(n: string): number | null {
  return /^[1-9]\d{0,4}$/.test(n) ? Number(n) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; n: string }> }): Promise<Metadata> {
  const { id, n } = await params;
  const page = parsePage(n);
  if (!page || page === 1) return { robots: { index: false, follow: false } };
  // 2ページ目以降は自己参照 canonical（1ページ目の重複扱いにしない）。title に「（nページ目）」。
  const base = await buildSalonSubpageMetadata(id, `diary/page/${page}`, `写メ日記（${page}ページ目）`);
  return base;
}

export default async function SalonDiaryPageN({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const page = parsePage(n);
  if (!page) notFound();
  if (page === 1) permanentRedirect(`/salon/${id}/diary`);
  return <SalonDiaryBody id={id} page={page} />;
}
