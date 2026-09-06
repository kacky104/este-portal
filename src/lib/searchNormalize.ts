// 検索用のかな正規化（画面側）。
//
// ★★★ 正は DB の public.search_normalize（supabase/migrations/20260715_search_normalize.sql）。
//   ★ TOPの検索バーは RPC（search_salons / search_therapists）越しにDB側で正規化している。
//   ★ /mypage の出勤ページは【すでに手元にある一覧】を絞るだけなので通信しない。
//     そのため、同じ規則をこちらにも1つだけ置く。★ 規則を変えるときは両方を直すこと。
//
// 揃える順番（DBと同じ）:
//   NFKD分解（半角カナ→全角・濁点を結合文字へ）→ 小文字化 → ひらがな→カタカナ
//   → 濁点/半濁点/長音/中黒/空白 を削除
//
// ★★ できないこと: 漢字の読み。★「桜」と「さくら」は別物として扱う（DB側も同じ）。
//   ★ 読みで引きたい場合は、セラピストに【読みがな】の列を足すしかない。

export function searchNormalize(input: string | null | undefined): string {
  const s = (input ?? '').normalize('NFKD').toLowerCase();
  // ひらがな（ぁ..ゖ = U+3041..U+3096）→ カタカナ（ァ..ヶ = U+30A1..U+30F6）
  const kata = s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  // 濁点(U+3099)・半濁点(U+309A)・長音(U+30FC)・中黒(U+30FB)・全角空白(U+3000)・空白類 を削除
  return kata.replace(/[゙゚ー・　\s]/g, '');
}

/** 名前が検索語に当たるか。★ どちらも同じ規則で潰してから部分一致で見る。 */
export function matchesSearch(name: string | null | undefined, query: string): boolean {
  const q = searchNormalize(query);
  if (!q) return true;            // ★ 空の検索は「全部」。★ 0件に倒さない
  return searchNormalize(name).includes(q);
}
