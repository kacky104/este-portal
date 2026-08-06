// Supabase(PostgREST) は .limit/.range 未指定だと既定 max-rows=1000 で「静かに」打ち切られる。
// 「全件が要る」取得（sitemap・全店舗一覧など）はここを通し、1000件ずつページングする。
// build には .order('id') を必ず入れること（順序未指定だと range のページ境界が安定しない）。
// 元は sitemap.ts 内のローカル関数（2026-08-05）。/salons でも使うため共有化した（2026-08-06）。
export const ROW_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data } = await build(from, from + ROW_PAGE_SIZE - 1);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < ROW_PAGE_SIZE) break;
  }
  return all;
}
