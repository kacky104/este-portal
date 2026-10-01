// トップページのヒーロー画像スライダー（header_slider_images）の共通定数。
//
// ★★ 枚数の上限はこの MAX_HEADER_SLIDER_IMAGES ただ1つが正。
//   /admin の登録UI（components/HeaderSliderManager.tsx）と
//   トップの表示側（src/components/HeaderImageSlider.tsx）の【両方】がこれを参照する。
//   片方だけ直すと「登録はできるのに出ない」「4枚目が出てしまう」がすぐ起きる。
//
// ★ 表示側でも必ず切り詰めること（登録UIの制限だけに頼らない）。
//   上限を導入する前に登録された行や、SQLで直接入れた行が残っていても
//   トップには先頭3枚しか出ないようにするため。
//
// ★ 公式HP側にも同種の上限がある（lib/hpSite.ts の MAX_HP_HERO_SLIDES = 3）。
//   別の設定なので連動はしないが、店舗様への案内で数が食い違わないよう
//   変えるときは両方を見比べること。
//
// 2026-08-20（第25便・オーナー要望）: 上限なし → 3枚に制限。
export const MAX_HEADER_SLIDER_IMAGES = 3;

export type HeaderSlide = {
  /** PC用画像URL（必須）。 */
  url: string;
  /** SP用画像URL。未登録(null)なら PC 用にフォールバックする。 */
  urlSp: string;
};

// ★ 第1076便（2026-10-01）: トップの hero はサーバーで読む。
//   それまで表示側（HeaderImageSlider）がブラウザで Supabase を読んでから画像を取りに行っていたので、
//   hero（LCP）の画像要求が約1秒遅れていた（本番実測: 読み取り 725→986ms・画像要求 995ms〜）。
//   トップは ISR 600 ＋ /admin 保存時の revalidateTop で即時更新なので、サーバー読みで鮮度は変わらない。
//   ★ 読めなかったら空配列（hero 無しでページは出す）。
export async function fetchHeaderSlides(
  supabase: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any -- createPublicClient の型をそのまま受ける
): Promise<HeaderSlide[]> {
  const { data } = await supabase
    .from('header_slider_images')
    .select('image_url, image_url_sp')
    .order('display_order', { ascending: true })
    .limit(MAX_HEADER_SLIDER_IMAGES);
  return ((data ?? []) as { image_url: string; image_url_sp: string | null }[]).map((row) => ({
    url: row.image_url,
    urlSp: row.image_url_sp ?? row.image_url,
  }));
}
