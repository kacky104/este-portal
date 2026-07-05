import { createPublicClient } from '@/app/lib/supabase/public';

// エリアアイコン（area_browse_icons）の公開読み取り。cookieless anon（ISRを効かせる）。
// AreaBrowse のタイル画像を DB 管理するためのマップを返す。fetchAreaHeroBanner と同流儀。
// area は AREA_ORDER キー（DB値・例 '博多・住吉'、出張は '出張'）。
// 戻り値は area → image_url のマップ。image_url が空/null の行は含めない（＝そのエリアはチップフォールバック）。
// 行なし・エラー時は空オブジェクト（＝全エリア チップフォールバック）。
// URL は相対パス（移行期の初期データ）と Storage 絶対URLの両方があり得る（表示側は next/image で両対応）。
export async function fetchAreaBrowseIcons(): Promise<Record<string, string>> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('area_browse_icons')
    .select('area, image_url');

  const map: Record<string, string> = {};
  (data ?? []).forEach((r) => {
    const area = (r.area as string | null) ?? '';
    const url = (r.image_url as string | null) ?? '';
    if (area && url) map[area] = url;
  });
  return map;
}
