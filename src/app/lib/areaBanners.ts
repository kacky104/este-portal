import { createPublicClient } from '@/app/lib/supabase/public';

// エリア別ヒーローバナー（area_hero_banners）の公開読み取り。cookieless anon（ISRを効かせる）。
// area は AREA_ORDER キー（DB値・例 '博多・住吉'）。行が無い／両URLとも空なら null（＝バナー非表示）。
// URL は相対パス（/jobs/area/…・移行期の初期データ）と Storage 絶対URLの両方があり得る（表示側は両対応）。
export type AreaHeroBannerUrls = { sp: string | null; pc: string | null };

export async function fetchAreaHeroBanner(area: string): Promise<AreaHeroBannerUrls | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('area_hero_banners')
    .select('sp_image_url, pc_image_url')
    .eq('area', area)
    .maybeSingle();

  if (!data) return null;
  const sp = (data.sp_image_url as string | null) ?? null;
  const pc = (data.pc_image_url as string | null) ?? null;
  if (!sp && !pc) return null;
  return { sp, pc };
}
