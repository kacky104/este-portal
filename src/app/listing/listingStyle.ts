// /listing（掲載のご案内）の見た目の共通の値（第1301便・2026-10-08）。
//
// ★ 第1301便で、画像だった各ブロックを【文字（HTML）】に組み直した（カッキーさんの決定）。
//   料金・機能が変わったため（lib/listingPlan.ts）。このあと、ブロックごとに画像を用意して差し替えていく予定。
//   ★ 差し替えるときは、ブロックの部品（ListingAbout など）を1つずつ画像に戻せばよい。文字は sr-only で残すこと（禁則85）。
//
// ★ 明朝は【端末に入っている書体】だけを使う（Web フォントは読み込まない＝転送量を増やさない・layout.tsx の方針）。
//   明朝が無い端末（Android の一部）ではゴシックで出る。崩れはしない。
export const LISTING_MINCHO =
  '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", serif';

// 色（これまでの画像の色に合わせた）。★ 文字色は背景とのコントラスト比を測ってある（scripts/listingplan-selftest.js）。
//   紙 #faf5ec ／ 墨 #2b211c ／ 朱 #c8402f ／ 青緑 #17767e ／ 金（線）#c9a55c ／ 金（文字・暗い面）#d9b46a ／ 暗い面 #1f1f1e
