// 駅ちかのエリア（第1416便・2026-10-12・カッキーさん）。★ 純粋関数だけ。
//
// ★ 駅ちかのお店のページの URL にはエリアの番号が入っている（例: https://ranking-deli.jp/fukuoka/area175/style8/12345/）。
//   その番号から「福岡市・博多」「中洲・天神」などを出す。★ DB に列は足さない（URL から毎回求める）。
// ★ ねらい: 掲載枠が2つある店で、枠ごとにどのエリアのお店ページか（＝どの管理画面の ID・パスワードを入れるか）を
//   運営の画面とコネックエフの「ID・パスワード登録」の両方で見えるようにする。
//   （オイルクエスト様の枠2: 中洲・天神ではないエリアの ID・パスワードが入っていた疑い・10/12）
// ★ 名前は駅ちかの画面の呼び方そのまま（2026-10-12 に ranking-deli.jp/fukuoka/areaNNN/ の見出しで確かめた）。

export const EKICHIKA_AREA_NAMES: Readonly<Record<number, string>> = {
  175: '福岡市・博多',
  202: '中洲・天神',
  176: '北九州・小倉',
  177: '久留米',
  178: '福岡県その他',
};

/** URL からエリアの番号。見つからなければ null */
export function ekichikaAreaIdFromUrl(url: string | null | undefined): number | null {
  const m = /ranking-deli\.jp\/[a-z]+\/area(\d{1,6})(?:\/|$|\?)/i.exec(String(url ?? ''));
  return m ? Number(m[1]) : null;
}

/** URL からエリアの名前。知らない番号は「エリア番号 NNN」、URL に無ければ null */
export function ekichikaAreaFromUrl(url: string | null | undefined): string | null {
  const id = ekichikaAreaIdFromUrl(url);
  if (id === null) return null;
  return EKICHIKA_AREA_NAMES[id] ?? `エリア番号 ${id}`;
}

/**
 * ★ 第1416便: 駅ちかで店名を検索するページ（福岡県・pref=40）。その店のお店ページが、どのエリアにいくつあるかを見るのに使う。
 *   店名に「～オイルクエスト～」「-アイリス-」のような読みがあれば、その読みで探す（駅ちかの店名はカタカナのことが多い）。
 */
export function ekichikaShopSearchUrl(salonName: string): string {
  const name = String(salonName ?? '').trim();
  // ★ 「～アロマメイ～」を先に見る（「AROMA-May-～アロマメイ～」で「May」を拾わないように）。無ければ「-アイリス-」
  const m = /[～〜~]\s*([^～〜~]+?)\s*[～〜~]/.exec(name) ?? /[-－]\s*([^-－]+?)\s*[-－]/.exec(name);
  const word = (m ? m[1] : name).replace(/\s+/g, ' ').trim();
  return `https://ranking-deli.jp/shop-list/?pref=40&shopname=${encodeURIComponent(word)}`;
}
