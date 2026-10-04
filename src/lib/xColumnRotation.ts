// ★ 第1185便（2026-10-05・カッキーさん）: フクエックスの運営アカウントが、フクエスのメンズエステコラムを
//   毎日1本ずつ順番に投稿する周（/api/admin/x-column-post）の【どれを出すか】の判断。
//   ★ ここは純粋関数だけ（DB もファイルも読まない）。配線は route.ts。
//
// ★ 順番の決め方（位置の数字は持たない・駅ちかの新着情報の周と同じ考え方）
//   1. まだ1度も投稿していないコラムが先（公開日の古い順 → slug 順）。
//   2. 全部出したあとは、最後に投稿したのがいちばん古いコラム（＝ひと回りして最初に戻る）。
//   ★ コラムが増えたら、次の日にその1本が先に出る。★ 消えたコラムは候補に無いので出ない。

export const COLUMN_URL_PREFIX = 'https://fukues.com/column/';

export type ColumnForRotation = { slug: string; publishedAt: string | null };

/** 投稿のリンク（https://fukues.com/column/◯◯）から slug を取り出す。コラムの記事でなければ null。 */
export function columnSlugFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(COLUMN_URL_PREFIX)) return null;
  const rest = url.slice(COLUMN_URL_PREFIX.length).split(/[?#]/)[0].replace(/\/+$/, '');
  // ★ 一覧（/column）・カテゴリ別（/column/category/…）は記事ではない
  if (!rest || rest.includes('/')) return null;
  return rest;
}

function ms(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** 出す順に並べる（先頭が今日の1本）。lastPostedAt＝slug → 最後に投稿した時刻（ISO）。 */
export function orderColumnsForPost<T extends ColumnForRotation>(columns: T[], lastPostedAt: Map<string, string>): T[] {
  const byPublished = (a: T, b: T) => ms(a.publishedAt) - ms(b.publishedAt) || a.slug.localeCompare(b.slug);
  const never = columns.filter((c) => !lastPostedAt.has(c.slug)).sort(byPublished);
  const done = columns
    .filter((c) => lastPostedAt.has(c.slug))
    .sort((a, b) => ms(lastPostedAt.get(a.slug)) - ms(lastPostedAt.get(b.slug)) || byPublished(a, b));
  return [...never, ...done];
}
