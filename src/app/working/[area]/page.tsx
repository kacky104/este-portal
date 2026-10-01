import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WorkingPageBody } from '../WorkingPageBody';
import { areaFromSlug, AREA_SLUGS_LIST, DISPATCH_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

// ★ 第1081便（2026-10-01）: エリア別の「現在出勤中」。旧 /working?area=<slug> をパスにした（ISR を効かせるため）。
//   ★ 旧 URL は next.config.ts の redirects で /working/<slug> へ 308。
//   ★ 6エリア分を事前生成。未知のスラッグは 404。

export const revalidate = 60;

export async function generateStaticParams() {
  return AREA_SLUGS_LIST.map((area) => ({ area }));
}

function headingOf(areaValue: string): string {
  return areaValue === DISPATCH_AREA ? '出張対応' : areaLabel(areaValue);
}

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  const areaValue = areaFromSlug(area);
  if (!areaValue) return { robots: { index: false, follow: false } };
  const name = headingOf(areaValue);
  const title = `${name}で現在出勤中のセラピスト一覧｜福岡メンズエステ【フクエス】`;
  const description = `${name}のメンズエステで現在出勤中のセラピスト一覧。いま施術を受けられるセラピストをフクエスでまとめてチェックできます。`;
  const path = `/working/${area}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: 'フクエス', type: 'website', images: [{ url: '/ogp.png', width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/ogp.png'] },
  };
}

export default async function WorkingAreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!areaFromSlug(area)) notFound();
  return <WorkingPageBody slug={area} />;
}
