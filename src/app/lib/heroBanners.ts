import type { JobListItem } from '@/app/lib/jobs';
import { shuffleJobs } from '@/app/lib/shuffleJobs';

// 求人一覧ページのバナーカード（JobHeroBanners）の生成ロジックを共通化したユーティリティ。
// 任意の jobs 配列（そのページの条件に合致する JobListItem[]）から、hero_image_urls を1枚以上持つ求人を
// 抽出して先頭 limit 件のバナーカードを作り、30分バケットでシャッフル（shuffleJobs・非破壊）して返す。
// バナー化できる求人が無ければ空配列（＝呼び出し側でブロックごと非表示）。
// 選定ロジック（画像あり・先頭limit件）は /jobs トップの従来実装と同一。並びのみ30分ごとに入れ替わる。
export type HeroBanner = { id: number; title: string; heroImageUrl: string; salonName: string };

// バナー初期表示上限。件数が増えた場合はここを調整、または将来的にページングを追加する拡張ポイント。
export const HERO_BANNER_LIMIT = 10;

export function deriveHeroBanners(jobs: JobListItem[], limit: number = HERO_BANNER_LIMIT): HeroBanner[] {
  const banners = jobs
    .filter((j) => j.heroImageUrls.length > 0)
    .slice(0, limit)
    .map((j) => ({ id: j.id, title: j.title, heroImageUrl: j.heroImageUrls[0], salonName: j.salon.name }));
  // バナーカードの並びを30分バケットでシャッフル（同一バケット内は決定的・非破壊・クライアント再シャッフルなし）。
  return shuffleJobs(banners);
}
