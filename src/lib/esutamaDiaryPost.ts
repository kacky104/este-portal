// エステ魂の写メ日記の投稿フォームを組み立てる（第129便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ 前提（設計メモ_エステ魂の写メ日記_2026-09-03.md）
//   ★ 店舗の管理画面からは投稿できない。★ 写メ日記は【セラピスト本人のアカウント】の持ち物。
//     → 画面にこう書いてある:「管理画面から写メ日記の編集・削除を行うことはできません。」
//   ★ 代わりに「本人の代わりにログイン」（代理ログイン）を通って、本人の画面から投稿する。
//   ★★ だから【1人ずつの了承】で送る（第118便）。★ 既定は送らない。
//
// ★★★ 実測した項目（2026-09-03・POST https://estama.jp/tamathera/diary/post/）
// ★★★ 2026-09-04 に**実物のフォームを読んで確定**（代理ログイン中に GET しただけ・投稿はしていない）:
//   enctype = application/x-www-form-urlencoded   ★★ multipart ではない
//   ctk             hidden    32文字。★ 毎回ページから拾う
//   photo_data      hidden    空・required なし   ★★★ 画像なしで送れる
//   title           text      maxLength 30
//   category_id     radio     1:日常* 2:お知らせ 3:出勤情報 4:お礼 5:ブログ 6:イベント
//   content         textarea  maxLength 2000
//   published_date  hidden    空
//   schedule_mode   radio     now* | schedule
//
// ★★★ **設計メモとの違い（2026-09-04）**: メモには schedule-date / -hour / -minute があると
//   書いてあったが、**フォームの要素には入っていなかった**（form.elements に無い）。
//   ★ schedule_mode='schedule' を選んだときに JS が作るものと思われる。
//   ★★ **フォームに無い項目は送らない。** ★ 第129便は即時投稿（now）だけにする。
//     ★ 予約投稿を作るなら、先に 'schedule' を選んだ状態のフォームを実物で見ること。
//
// ★★★ 日記は【上書きではなく投稿】。★ 二度送ると記事が2本載る。★ しかも店舗側から消せない。
//   → 送った印（diary_posts 側）が無いと重複する。★ ここは呼び出し側の責任。

/** カテゴリ。★ 数字は相手の value。★ 名前はこちらの画面用。 */
export const ESUTAMA_DIARY_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: '1', label: '日常' },
  { id: '2', label: 'お知らせ' },
  { id: '3', label: '出勤情報' },
  { id: '4', label: 'お礼' },
  { id: '5', label: 'ブログ' },
  { id: '6', label: 'イベント' },
];

/** 既定のカテゴリ。★ 日常。★ 迷ったら当たり障りのないものへ倒す。 */
export const ESUTAMA_DIARY_DEFAULT_CATEGORY = '1';

/** 相手の上限。★ 画面の注意書きの実測値。 */
export const ESUTAMA_TITLE_MAX = 30;
export const ESUTAMA_CONTENT_MAX = 2000;

export function isEsutamaCategory(v: unknown): boolean {
  return typeof v === 'string' && ESUTAMA_DIARY_CATEGORIES.some((c) => c.id === v);
}

/**
 * ★★★ 上限で切る。★ 切ったことを【黙らせない】（落ちた字数も返す）。
 *
 * ★ 相手が弾くのに任せない。★ 弾かれ方が分からないと、何が悪かったのか永久に分からない。
 * ★★ 「0件と分からないを混ぜない」と同じ筋（引き継ぎメモ 3-5）。
 * ★ 数えるのは【文字数】。★ 空白も改行も1文字として数える（相手の数え方に合わせる）。
 */
export function clampText(raw: string, max: number): { text: string; dropped: number } {
  const s = String(raw ?? '');
  const chars = [...s]; // ★ サロゲートペア（絵文字）を1文字として数える
  if (chars.length <= max) return { text: s, dropped: 0 };
  return { text: chars.slice(0, max).join(''), dropped: chars.length - max };
}

export type DiaryDraft = {
  title: string;
  content: string;
  /** 省略時は「日常」。★ 知らない値も「日常」へ倒す（送らないより送る）。 */
  categoryId?: string;
};

export type BuiltDiaryPost = {
  /** そのまま application/x-www-form-urlencoded にする組。★ 並びは相手のフォーム順に揃える。 */
  fields: Array<[string, string]>;
  /** ★ 切った字数。★ 0 でなければ画面と監査に出す。 */
  titleDropped: number;
  contentDropped: number;
  /** ★ 本文が空なら送らない。★ 空の記事を本人のアカウントから出さない。 */
  empty: boolean;
};

/** ★ 実物のフォームにあった項目（2026-09-04 実測）。★ これ以外は送らない。 */
export const ESUTAMA_DIARY_FIELD_NAMES: readonly string[] = [
  'ctk', 'photo_data', 'title', 'category_id', 'content', 'published_date', 'schedule_mode',
];

/**
 * 投稿フォームの中身を組み立てる。
 * ★ ctk はページから拾った値をそのまま渡す（こちらでは作らない）。
 * ★★ 並びは【実物のフォーム順】に揃える。★ 相手が順番を見ていないとしても、
 *   実物と同じ形で送るほうが、食い違ったときに気づきやすい。
 * ★★★ 予約投稿は作らない（第129便）。★ フォームに無い項目を送らない。
 */
export function buildEsutamaDiaryPost(draft: DiaryDraft, ctk: string): BuiltDiaryPost {
  const t = clampText(draft.title, ESUTAMA_TITLE_MAX);
  const c = clampText(draft.content, ESUTAMA_CONTENT_MAX);
  const category = isEsutamaCategory(draft.categoryId) ? String(draft.categoryId) : ESUTAMA_DIARY_DEFAULT_CATEGORY;

  // ★ 実物のフォーム順。★ photo_data は空（画像なし・required でないことを実測で確認）
  const fields: Array<[string, string]> = [
    ['ctk', String(ctk ?? '')],
    ['photo_data', ''],
    ['title', t.text],
    ['category_id', category],
    ['content', c.text],
    ['published_date', ''],
    ['schedule_mode', 'now'],
  ];

  return {
    fields,
    titleDropped: t.dropped,
    contentDropped: c.dropped,
    // ★ 本文が空（空白だけ）なら送らない。★ 題名だけの記事を本人の名前で出さない
    empty: c.text.trim().length === 0,
  };
}
