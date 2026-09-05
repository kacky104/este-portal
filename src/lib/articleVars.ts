// 新着情報の差し込み（第169便・2026-09-05）。
//
// ★★★ このファイルは通信もDBも触らない。★ 日付すら引数で受ける（dayKey）。
//   ★ articleRotation / announceAuto と同じ理由:【判断は、固定して見返せる形に置く】。
//
// ★★★ なぜ要るか
//   1日2回、同じ文章を出し続けると、駅ちかで「使い回し」に見える。
//   ★ 日付と名前が入るだけで、同じ1本が毎回ちがう記事になる。
//   ★★ ベンリーにも同じ仕組みがある（★ 乗り換えていただくのに要る）。
//
// ★★★ 決めごと（★ ここを崩さない）
//   ① **置き換えは【70字を数える前】。** ★ 数えてから置き換えると、駅ちかで断られる
//   ② 日付は **営業日（朝6時区切り）**（★ カッキーさんの判断・2026-09-05）
//      ★ 深夜 03:42 に出る記事は「9月5日(土)」。★ 10:00〜翌5:00 の営業のうちなので
//   ③ **知らない差し込みは触らない。** ★ 店舗様が書いた文字を、こちらで消さない
//   ④ 埋められないときは **送らない**。★ 「{セラピスト}」のまま駅ちかへ出さない

/** ★ 使える差し込み。★ 増やすときはここに足す（★ 画面の説明もここから作る） */
export const ARTICLE_VARS = ['{月}', '{日}', '{曜日}', '{セラピスト}'] as const;

/**
 * ★ 長さの検査に使う「いちばん長くなる日」。
 *   ★★ 月＝12・日＝31 が最長（★ 曜日は必ず1文字）。
 *   ★ 保存のときにこれで数えておけば、★ どの日でも駅ちかに断られない。
 */
export const ARTICLE_VAR_WORST_DAY = '2027-12-31';

export type ArticleVarContext = {
  /**
   * 営業日（YYYY-MM-DD）。★ dayKeyJST の結果をそのまま渡す。
   * ★★ null は【分からない】。★ 「今日ではない」と混ぜない
   */
  dayKey: string | null;
  /** 誰の紹介か。★ '' / null は【選ばれていない】 */
  therapistName: string | null;
};

export type ArticleVarFill =
  | { ok: true; text: string; used: string[] }
  | { ok: false; reason: 'no_day' | 'no_therapist'; message: string; used: string[] };

const WEEK = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** YYYY-MM-DD →「月・日・曜日」。★ 実在しない日は null（★ 2月31日を通さない） */
function partsOfDay(dayKey: string): { month: string; day: string; week: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(Date.UTC(y, mo - 1, da));
  // ★ 丸め込まれていないことを確かめる（★ 2026-02-31 → 3/3 になるのを弾く）
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
  // ★ 0を付けない（★ 「09月05日」ではなく「9月5日」）
  return { month: String(mo), day: String(da), week: WEEK[d.getUTCDay()] };
}

/** その文にどの差し込みが入っているか。★ 出た順ではなく ARTICLE_VARS の順で返す（★ 並びを固定する） */
export function usedArticleVars(text: unknown): string[] {
  const t = typeof text === 'string' ? text : '';
  return ARTICLE_VARS.filter((v) => t.includes(v));
}

/** 差し込みが1つでも入っているか */
export function hasArticleVar(text: unknown): boolean {
  return usedArticleVars(text).length > 0;
}

/**
 * ★★★ 差し込みを埋める。
 *
 * ★ 埋められないときは **埋めずに理由を返す**（★ 半端に埋めない）。
 * ★★ 知らない差し込み（例「{お客様}」）は **そのまま残す**。★ 消さない。
 */
export function fillArticleVars(text: unknown, ctx: ArticleVarContext): ArticleVarFill {
  const t = typeof text === 'string' ? text : '';
  const used = usedArticleVars(t);
  if (used.length === 0) return { ok: true, text: t, used };

  const wantsDay = used.some((v) => v === '{月}' || v === '{日}' || v === '{曜日}');
  const wantsName = used.includes('{セラピスト}');

  let parts: { month: string; day: string; week: string } | null = null;
  if (wantsDay) {
    // ★★ 日付が分からないときに「今日」を作らない。★ 送らずに止める
    parts = ctx.dayKey === null ? null : partsOfDay(ctx.dayKey);
    if (parts === null) {
      return {
        ok: false, reason: 'no_day', used,
        message: '日付を入れられませんでした。時間をおいてお試しください',
      };
    }
  }

  const name = typeof ctx.therapistName === 'string' ? ctx.therapistName.trim() : '';
  if (wantsName && name.length === 0) {
    return {
      ok: false, reason: 'no_therapist', used,
      message: '{セラピスト} を使うときは、写真の欄で誰かを選んでください（選んだ方のお名前が入ります）',
    };
  }

  let out = t;
  if (parts !== null) {
    out = out.split('{月}').join(parts.month);
    out = out.split('{日}').join(parts.day);
    out = out.split('{曜日}').join(parts.week);
  }
  if (wantsName) out = out.split('{セラピスト}').join(name);
  return { ok: true, text: out, used };
}

/**
 * ★ 画面に出す説明。★ 文言をここで作る（★ 画面で作らない・第167便で直した作法）。
 */
export function articleVarHelp(): string {
  return '{月} {日} {曜日} {セラピスト} と書くと、出すときに置き換わります（例：9 / 5 / 土 / サクラ）。'
    + '日付は営業日（朝6時区切り）です。';
}
