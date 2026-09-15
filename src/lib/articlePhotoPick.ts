// 新着情報に付ける写真を1枚選ぶ（第172便・2026-09-06 → ★ 第373便で【店舗ぜんぶで1つの写真の箱】に作り直し・2026-09-15）。
//
// ★★★ このファイルは通信もDBも触らない。**さいころすら引数で受ける**（rand）。
//   ★ articleRotation / announceAuto と同じ理由:【判断は、固定して見返せる形に置く】。
//   ★★ Math.random() をこの中で呼ぶと、点検で「同じ目が続いたとき」を作れなくなる。
//
// ★★★ 第373便の決めごと（★ カッキーさん・2026-09-15）
//   「まずシンプルにします」
//   「画像選択のブロックを作ります。そこに10枚画像を設定できるようにします」
//   「どのカテゴリーからの投稿もここで設定した10枚の写真から1枚がランダムで表示されて投稿する」
//
//   ① **写真の箱は店舗（＋媒体＋枠）に1つ。** ★ 文章ごとに写真を持たない（第172便の形をやめた）
//      ★ 置き場は salon_article_settings.photo_therapist_ids。★ 文章の therapist_ids は【読まない】
//   ② **どの枠（速報NEWS・新人速報・…）から出すときも、同じ箱から1枚。**
//   ③ **直前と同じ1枚は避ける。**（第172便から引き継ぎ）
//      ★ 2枚しか選んでいないと、ランダムでは2回に1回が同じ写真になる。
//      ★★ 店舗様には「変わっていない＝壊れている」に見える。
//   ④ **箱が空なら、写真に触らない。**
//      ★ 空配列は「いまの写真のまま」。★ 0枚を「1枚目」に倒さない（作法3-5）
//   ⑤ **1枚だけなら、ずっとその1枚。**（★ 「推しの子を上げ続ける」はこの形で残る）
//
// ★★ ベンリー（他社のチャンネルマネージャー）に合わせる必要は、もう無い（カッキーさん・2026-09-15）。
//   ★ 10枚という数だけは残す（★ 店舗様が数えやすい上限）。

/** ★ 写真の箱に入れられる上限。★ 10枚 */
export const ARTICLE_PHOTO_MAX = 10;

export type ArticlePhotoPick =
  | { kind: 'keep' }                       // ★ 箱が空＝いまの写真のまま
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
 * @param ids    箱に入っている写真の持ち主（★ normalize 済みを渡す）
 * @param lastId 直前に出した1枚。★ null は「まだ出していない」
 * @param rand   0以上1未満の数。★ 呼ぶ側が Math.random() を渡す（★ ここでは呼ばない）
 */
export function pickArticlePhoto(
  ids: readonly number[],
  lastId: number | null,
  rand: number,
): ArticlePhotoPick {
  const list = normalizeArticlePhotoIds(ids);
  // ★ 箱が空。★ 「1枚目」に倒さない
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
 * ★ 写真の箱の下に出す1行。★ 文言はここで作る（★ 画面で作らない・第167便で直した作法）。
 *
 * ★★★ 第375便（2026-09-15）: **画面（NewsBoard）からは外した。** ★ いまどこからも呼ばれていない。
 *   ★ 理由: 節の見出しの下の1行「ここで選んだ写真の中から1枚がランダムで入ります。最大10枚。」が
 *     同じことを言っていて、青い箱が2つ目の説明になっていた（カッキーさんの指摘）。
 *   ★★ 消さずに残してある（第372便の作法: 消すのは画面だけ。ライブラリ・番人・受け口は残す）。
 *      ★ 戻すなら NewsBoard で import して1行出すだけ。★ 番人 check:articlephoto も残っている。
 *
 *   ★ 0枚のときは【何も言わない】（null）。★ 空文字と null を混ぜない（作法3-5）。
 *   ★ 押す前の確認は articlePhotoConfirmNote が別に言う（★ こちらは画面で使っている）。
 * @returns 言うことが無ければ null
 */
export function articlePhotoNote(count: number): string | null {
  const n = Number.isFinite(count) ? Math.trunc(count) : 0;
  if (n <= 0) return null;
  if (n === 1) return 'この1枚が、どの枠から出すときもずっと入ります。';
  return n + '枚選んでいます。どの枠から出すときも、この中から1枚が入ります（直前と同じ写真は避けます）。';
}

/**
 * ★ 「いま出す」の確認に出す1行。★ 箱の枚数だけで決まる（★ 文章ごとの違いは無い）。
 */
export function articlePhotoConfirmNote(count: number): string {
  const n = Number.isFinite(count) ? Math.trunc(count) : 0;
  if (n <= 0) return '写真は駅ちかに入っているものがそのまま残ります（変わるのはタイトルと本文だけです）。';
  if (n === 1) return '写真は「写真」で選んでいる1枚を駅ちかへ送って差し替えます。';
  return '写真は「写真」で選んでいる ' + n + ' 枚の中から1枚を送って差し替えます（直前と同じ写真は避けます）。';
}
