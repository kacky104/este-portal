import { createPublicClient } from '@/app/lib/supabase/public';

// エリアアイコン（area_browse_icons）の公開読み取り。cookieless anon（ISRを効かせる）。
// AreaBrowse のタイル画像を DB 管理する。SP/PC 2枚方式（バナーテーブルと同構成：sp_image_url / pc_image_url）。
// area は AREA_ORDER キー（DB値・例 '博多・住吉'、出張は '出張'）。
// 戻り値は area → { sp, pc } のマップ。sp・pc とも空/null の行は含めない（＝そのエリアはチップフォールバック）。
// 行なし・エラー時は空オブジェクト（＝全エリア チップフォールバック）。
// URL は相対パス（移行期の初期データ）と Storage 絶対URLの両方があり得る（表示側は next/image で両対応）。
export type AreaBrowseIcon = { sp: string | null; pc: string | null };

export async function fetchAreaBrowseIcons(): Promise<Record<string, AreaBrowseIcon>> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('area_browse_icons')
    .select('area, sp_image_url, pc_image_url');

  const map: Record<string, AreaBrowseIcon> = {};
  (data ?? []).forEach((r) => {
    const area = (r.area as string | null) ?? '';
    const sp = (r.sp_image_url as string | null) ?? null;
    const pc = (r.pc_image_url as string | null) ?? null;
    if (area && (sp || pc)) map[area] = { sp, pc };
  });
  return map;
}
