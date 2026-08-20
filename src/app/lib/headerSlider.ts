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
