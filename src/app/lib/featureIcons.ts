import { createPublicClient } from '@/app/lib/supabase/public';

// 特徴カテゴリーアイコン（feature_category_icons）の公開読み取り。cookieless anon（ISRを効かせる）。
// FeatureBrowse のタイル画像を DB 管理する。SP/PC 共通1枚方式（image_url 1カラム。エリアの2枚方式とは異なる）。
// category は JOB_FEATURE_CATEGORY_KEYS の値（＝ JOB_FEATURE_GROUPS の title・DB値。例 '経験・年齢'）。
// 戻り値は category → image_url のマップ。image_url が空/null の行は含めない（＝そのカテゴリーはチップフォールバック）。
// 行なし・エラー時は空オブジェクト（＝全カテゴリー チップフォールバック）。lib/areaIcons.ts と同型。
// URL は相対パス（移行期の初期データ）と Storage 絶対URLの両方があり得る（表示側は next/image で両対応）。
export async function fetchFeatureCategoryIcons(): Promise<Record<string, string>> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('feature_category_icons')
    .select('category, image_url');

  const map: Record<string, string> = {};
  (data ?? []).forEach((r) => {
    const category = (r.category as string | null) ?? '';
    const url = (r.image_url as string | null) ?? null;
    if (category && url) map[category] = url;
  });
  return map;
}
