// 新着情報に付ける写真を1枚選ぶ（第172便・2026-09-06）。
//
// ★★★ このファイルは通信もDBも触らない。**さいころすら引数で受ける**（rand）。
//   ★ articleRotation / announceAuto と同じ理由:【判断は、固定して見返せる形に置く】。
//   ★★ Math.random() をこの中で呼ぶと、点検で「同じ目が続いたとき」を作れなくなる。
//
// ★★★ 決めごと（★ カッキーさんのご指摘から）
//   「同じ文章でいい。毎回違うセラピストの写真がランダムで載るシステムが欲しい」
//   「逆に特定のセラピスト紹介の時は選んだ画像がずっと出続けるようにできる」
//
//   ① **1枚固定と、複数から回すを、別の設定にしない。**
//      ★ 1枚だけ選べば固定。★ 10枚選べば回る。★ 同じ操作で両方できる。
//   ② **直前と同じ1枚は避ける。**
//      ★ 2枚しか選んでいないと、ランダムでは2回に1回が同じ写真になる。
//      ★★ 店舗様には「変わっていない＝壊れている」に見える。
//   ③ **選ばれていなければ、写真に触らない。**
//      ★ 空配列は「いまの写真のまま」。★ 0枚を「1枚目」に倒さない（作法3-5）

/** ★ 1本の文章に付けられる写真の上限。★ ベンリーと同じ10枚 */
export const ARTICLE_PHOTO_MAX = 10;

export type ArticlePhotoPick =
  | { kind: 'keep' }                       // ★ 選ばれていない＝いまの写真のまま
  | { kind: 'fixed'; id: number }          // ★ 1枚だけ＝ずっとこれ
  | { kind: 'rotate'; id: number };        // ★ 複数から1枚

/**
 * ★ 並びを整える。★ 数でないもの・0以下・重複を落とし、★ 上限で切る。
 *   ★★ ここを通した配列だけを保存する。★ 画面から来た形をそのまま入れない。
 */
export function normalizeArticlePhotoIds(input: unknown): number[] {
  const src = Array.isArray(input) ? input : [];
  const out: number[] = [];
  for (const v of src) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    const i = Math.trunc(n);
    if (out.includes(i)) continue;          // ★ 同じ人を2回入れない
    out.push(i);
    if (out.length >= ARTICLE_PHOTO_MAX) break;
  }
  return out;
}

/**
 * ★★★ 出す写真を1枚決める。
 *
 * @param ids    選ばれている写真の持ち主（★ normalize 済みを渡す）
 * @param lastId 直前に出した1枚。★ null は「まだ出していない」
 * @param rand   0以上1未満の数。★ 呼ぶ側が Math.random() を渡す（★ ここでは呼ばない）
 */
export function pickArticlePhoto(
  ids: readonly number[],
  lastId: number | null,
  rand: number,
): ArticlePhotoPick {
  const list = normalizeArticlePhotoIds(ids);
  // ★ 選ばれていない。★ 「1枚目」に倒さない
  if (list.length === 0) return { kind: 'keep' };
  // ★ 1枚だけ＝固定。★ 直前と同じでも、それが店舗様の望み（★ 推しの子を上げ続ける）
  if (list.length === 1) return { kind: 'fixed', id: list[0] };

  // ★★ 直前の1枚を候補から外してから選ぶ。★ 「変わっていない」を作らない
  const pool = lastId === null ? list : list.filter((x) => x !== lastId);
  // ★ 外した結果が空になることはない（★ 2枚以上あるので）。★ ただし念のため戻す
  const use = pool.length > 0 ? pool : list;

  // ★ rand が壊れていても落ちない。★ 0番目に寄せる（★ 例外を投げて送信を止めない）
  const r = Number.isFinite(rand) ? Math.min(Math.max(rand, 0), 0.999999) : 0;
  return { kind: 'rotate', id: use[Math.floor(r * use.length)] };
}

/**
 * ★ 画面に出す1行。★ 文言はここで作る（★ 画面で作らない・第167便で直した作法）。
 * @returns 言うことが無ければ null（★ 空文字と分ける）
 */
export function articlePhotoNote(count: number): string | null {
  const n = Number.isFinite(count) ? Math.trunc(count) : 0;
  if (n <= 0) return null;                  // ★ 「変えない」は写真の欄の説明が言う
  if (n === 1) return 'この写真がずっと入ります。';
  return n + '枚選んでいます。出すたびに、この中から1枚が入ります（直前と同じ写真は避けます）。';
}
