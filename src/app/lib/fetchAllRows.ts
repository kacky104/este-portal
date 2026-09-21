// Supabase(PostgREST) は .limit/.range 未指定だと既定 max-rows=1000 で「静かに」打ち切られる。
// 「全件が要る」取得（sitemap・全店舗一覧など）はここを通し、1000件ずつページングする。
// build には .order('id') を必ず入れること（順序未指定だと range のページ境界が安定しない）。
// 元は sitemap.ts 内のローカル関数（2026-08-05）。/salons でも使うため共有化した（2026-08-06）。
//
// ★★★ エラーを握りつぶさないこと（2026-09-21 追加）
//   以前は `const { data } = await build(...)` と書いていたため、クエリが失敗しても
//   data:null → 空配列 → ループ脱出 となり、【全件0件】が正常系と見分けられなかった。
//   実際これで sitemap の /therapist/[id] が449件まるごと消えたまま数週間気づけなかった
//   （原因は therapists→salons の埋め込みが PGRST201 であいまいになっていたこと）。
//   → 返り値の挙動は従来どおり（失敗しても throw せず、取れた分だけ返す。sitemap は壊さない）。
//     ただし ★ 失敗したことは必ず console.error に出す。Vercel のログで気づけるようにする。
export const ROW_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: { message?: string; code?: string } | null }>,
  // ログに出す識別名（どのクエリが落ちたか分かるように）。省略時は 'fetchAllRows'。
  label = 'fetchAllRows',
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await build(from, from + ROW_PAGE_SIZE - 1);
    if (error) {
      // ★ 静かに空で返さない。ここに出た時点で「その一覧は0件になっている」と読める。
      console.error(
        `[fetchAllRows] ${label} failed at offset ${from}: ${error.code ?? 'no-code'} ${error.message ?? ''}`.trim(),
      );
      break;
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < ROW_PAGE_SIZE) break;
  }
  return all;
}
