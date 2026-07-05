import { JOB_FEATURE_GROUPS, featureLabel } from '@/app/lib/jobs';
import { fetchFeatureCategoryIcons } from '@/app/lib/featureIcons';
import { FeatureBrowseClient } from './FeatureBrowseClient';

// 「特徴から探す」画像アイコンタイル群（/jobs トップ・タグページ・エリアページ・出張ページの回遊で共用）。
// async サーバーコンポーネント：アイコン画像は feature_category_icons（fetchFeatureCategoryIcons）で DB 管理し、
// ここ（サーバー）で fetch する。開閉（排他アコーディオン）だけを FeatureBrowseClient に委譲する。AreaBrowse の特徴版。
// カテゴリー（4つ）とタグ（18個）は JOB_FEATURE_GROUPS 由来。カテゴリーキーは title（= DB category 値）。
// currentSlug を渡すと、そのタグを強調表示する（タグページ下部での現在地表示用）。
// areaSlug を渡すと、リンク先を /jobs/area/<areaSlug>/tag/<slug>（エリア×タグ掛け合わせ）に切替える
//（未指定なら従来の /jobs/tag/<slug>）。← 遷移先ロジックは従来チップ版と完全に同一（各ページの挙動を変えない）。
export async function FeatureBrowse({
  title = '特徴から探す',
  currentSlug,
  areaSlug,
}: {
  title?: string;
  currentSlug?: string;
  areaSlug?: string;
}) {
  const icons = await fetchFeatureCategoryIcons();
  const categories = JOB_FEATURE_GROUPS.map((g) => ({
    key: g.title,
    label: g.title,
    imageUrl: icons[g.title] ?? null,
    tags: g.slugs.map((slug) => ({
      slug,
      label: featureLabel(slug),
      // 従来チップ版と同一：areaSlug 指定でエリア掛け合わせ、未指定で通常タグページ。currentSlug は強調のみ。
      href: areaSlug ? `/jobs/area/${areaSlug}/tag/${slug}` : `/jobs/tag/${slug}`,
      active: slug === currentSlug,
    })),
  }));

  return <FeatureBrowseClient title={title} categories={categories} />;
}
