import type { Metadata } from 'next';
import { buildSalonSubpageMetadata } from '../subpageMetadata';
import { countSalonDiary } from '../subpageEmpty';
import { SalonDiaryBody } from './SalonDiaryBody';

// ★ 第1082便: 1ページ目。2ページ目以降は ./page/[n]/page.tsx（旧 ?page= は next.config の redirects で転送）。
// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。詳細は ../subpageMetadata.ts。
// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。詳細は ../subpageMetadata.ts。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // ★ 第1077便: 写メ日記0件なら noindex（1件でも入れば index 可に戻る）
  const n = await countSalonDiary(Number(id));
  return buildSalonSubpageMetadata(id, 'diary', '写メ日記', { emptyNoindex: n === 0 });
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonDiaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SalonDiaryBody id={id} page={1} />;
}
