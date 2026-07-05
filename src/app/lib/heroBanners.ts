import type { JobListItem } from '@/app/lib/jobs';
import { shuffleJobs } from '@/app/lib/shuffleJobs';

// 求人一覧ページのバナーカード（JobHeroBanners）の生成ロジックを共通化したユーティリティ。
// 任意の jobs 配列（そのページの条件に合致する JobListItem[]）から、hero_image_urls を1枚以上持つ求人を
// 抽出し、30分バケットでシャッフル（shuffleJobs・非破壊）してから先頭 limit 件を切り出してバナーカード化する。
// 「シャッフル→切り出し」の順にすることで、対象が limit 件を超えても30分ごとに全対象が公平にバナー枠へ露出する
// （先頭 limit 件で切ってからシャッフルすると上位固定メンバーだけが並び替わり、それ以降が永久に非表示になる問題を解消）。
// 同一30分バケット内は顔ぶれ・並びとも決定的（リロードで不変）。バケットが変われば顔ぶれと並びの両方が変わる。
// シャッフルの適用はこの1箇所のみ（呼び出し側でバナー配列を再シャッフルしない＝二重シャッフルなし）。
// バナー化できる求人が無ければ空配列（＝呼び出し側でブロックごと非表示）。
export type HeroBanner = { id: number; title: string; heroImageUrl: string; salonName: string };

// バナー表示上限。件数が増えた場合はここを調整、または将来的にページングを追加する拡張ポイント。
export const HERO_BANNER_LIMIT = 30;

export function deriveHeroBanners(jobs: JobListItem[], limit: number = HERO_BANNER_LIMIT): HeroBanner[] {
  const eligible = jobs.filter((j) => j.heroImageUrls.length > 0);
  // 抽出 → 30分バケットでシャッフル → 先頭 limit 件を切り出し → バナーカード化。
  return shuffleJobs(eligible)
    .slice(0, limit)
    .map((j) => ({ id: j.id, title: j.title, heroImageUrl: j.heroImageUrls[0], salonName: j.salon.name }));
}
