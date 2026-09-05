// 枠の状態を、店舗様の言葉にする（第158便・2026-09-05）。
//
// ★★★ このファイルは通信もDBも触らない。★ 判断だけ。
//
// ★★★ なぜ要るか（2026-09-05 の実弾で踏んだ穴）
//   駅ちかへ送れて、管理画面にも載ったのに、**公開ページには出なかった**。
//   ★ 枠そのものが「非表示」だったから。★ それは編集ページのどこにも書いていない。
//   → ★ 店舗様が登録する【前】に言う。★ 送ったあとに「出ていません」と言うのでは遅い。
//
// ★★ 3つを混ぜないこと（作法 3-5）
//   使える     … 記事があって、公開ページに出ている
//   出ない     … 記事はあるが、枠が非表示（★ 送っても公開ページには出ない）
//   カラ       … その枠にまだ記事が無い（★ 上書きするものが無い。新規の道はまだ無い）
//   分からない … 読めていない／読めたが状態が判定できない
//   ★★★ 「分からない」を「使える」にも「出ない」にも倒さない。

import { articleSlotLabel, isArticleSlot } from './ekichikaArticle';
import type { EkichikaArticleSlot } from './ekichikaArticle';

/** 写しに入っている1枠ぶん。★ 形は ekichikaArticle.EkichikaArticleRow と同じ */
export type ArticleSlotRow = {
  slot: number;
  label: string;
  hasArticle: boolean;
  visible: boolean | null;
  title: string;
  updatedAt: string;
};

/** ★ 4つ。★ 増やすときはここに足す（画面の分岐を散らさない） */
export type ArticleSlotState = 'usable' | 'hidden' | 'empty' | 'unknown';

// ★★★ 第163便（2026-09-05）で 'empty' の意味が変わった。
//   ★ 以前 … 「使えません。駅ちかの管理画面で1本作ってきてください」
//   ★ いま … 「**使えます。新しく作ります**」
//   ★★ 駅ちかの「新規」は編集ページと同じで id が空なだけ、と実測で分かったため。
//   ★★★ カッキーさんのご指摘が発端:
//     「私が理解しがたく操作が難しいのに、今から使ってもらう第三者が理解できるわけがない」
//     ★ 他媒体の管理画面へ行かせている時点で、フクエスリンクの負けだった。

export type ArticleSlotAdvice = {
  slot: EkichikaArticleSlot;
  label: string;
  state: ArticleSlotState;
  /** ★ 状態の見出し（短く） */
  headline: string;
  /**
   * ★★★ 一覧の脇に置く【いちばん短い言葉】（第167便）。
   *   ★ headline は「枠を選ぶ場面」の言葉、short は「もう選んである文章の脇」の言葉。
   *   ★★ 画面の中で言葉を作らないこと。★ 状態から言葉への変換は、このファイルだけの仕事。
   */
  short: string;
  /** ★ 店舗様が読む1行。★ 「なぜ」と「どうなるか」を書く */
  note: string;
  /** ★★★ ここを選んでよいか。★ 選べなくするのではなく、選んだ結果を先に見せる */
  canPost: boolean;
  /** いま入っている記事のタイトル（無ければ空） */
  currentTitle: string;
};

/**
 * ★★★ 1枠ぶんの見立て。
 * @param row 写しの行。★ 読めていなければ null（★ 「無い」ではなく【分からない】）
 */
export function articleSlotAdvice(slot: unknown, row: ArticleSlotRow | null | undefined): ArticleSlotAdvice {
  const s: EkichikaArticleSlot = isArticleSlot(slot) ? slot : 1;
  const label = row && typeof row.label === 'string' && row.label.length > 0 ? row.label : articleSlotLabel(s);
  const base = { slot: s, label, currentTitle: '' };

  // ★ 読めていない。★ ここで「使える」と言わない
  if (!row) {
    return {
      ...base,
      state: 'unknown',
      headline: 'まだ確かめていません',
      short: 'まだ確かめていません',
      note: '駅ちかの新着情報をまだ読み取っていないため、この枠がいまどうなっているか分かりません。「いまの状態を読む」を押すと確かめられます。',
      canPost: false,
    };
  }

  const currentTitle = typeof row.title === 'string' ? row.title : '';

  // ★★★ 記事が無い枠は【新しく作る】（第163便）。★ 使えないのではない
  if (!row.hasArticle) {
    return {
      ...base,
      state: 'empty',
      headline: '使えます（新しく作ります）',
      short: '空いています（新しく作ります）',
      note: 'この枠は駅ちかでまだ空いています。ここへ送ると、新しく記事を作ります。',
      canPost: true,
      currentTitle,
    };
  }

  // ★★★ 非表示の枠。★ 送れるが、公開ページには出ない。★ こちらで勝手に表示へ切り替えない
  if (row.visible === false) {
    return {
      ...base,
      state: 'hidden',
      headline: 'いま非表示です',
      short: '出しても公開ページに出ません',
      note: 'この枠は駅ちかで「非表示」になっています。送ることはできますが、公開ページには出ません。出したい場合は駅ちかの管理画面で「表示」に切り替えてください（フクエスからは切り替えません）。',
      canPost: true,
      currentTitle,
    };
  }

  // ★ 読めたが状態が判定できない（相手が文言を変えた等）。★ 「出ている」と言い切らない
  if (row.visible !== true) {
    return {
      ...base,
      state: 'unknown',
      headline: '公開されているか分かりません',
      short: '公開されているか分かりません',
      note: 'この枠が公開ページに出ているかどうかを、駅ちかの画面から読み取れませんでした。送ることはできますが、公開ページに出るかどうかはこちらでは分かりません。',
      canPost: true,
      currentTitle,
    };
  }

  return {
    ...base,
    state: 'usable',
    headline: '使えます',
    short: '出せます',
    note: currentTitle
      ? 'いま「' + currentTitle + '」が入っています。ここへ送ると、この記事は置き換わります。'
      : 'この枠は公開ページに出ています。ここへ送ると、いまの記事は置き換わります。',
    canPost: true,
    currentTitle,
  };
}

/** 5枠ぶんまとめて。★ 必ず 1〜5 の順で5つ返す（★ 読めた枠だけ返すと画面が枠を見失う） */
export function articleSlotAdviceAll(rows: readonly ArticleSlotRow[] | null | undefined): ArticleSlotAdvice[] {
  const list = Array.isArray(rows) ? rows : [];
  return ([1, 2, 3, 4, 5] as const).map((s) => articleSlotAdvice(s, list.find((r) => r.slot === s) ?? null));
}

/**
 * ★ 画面の上に出す1行。★ 「何ができるか」を先に言う。
 * ★★ 数だけでなく、**まだ読んでいない**ときに数を言わないこと（0と不明を混ぜない）。
 */
export function articleSlotSummary(rows: readonly ArticleSlotRow[] | null | undefined): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '駅ちかの新着情報をまだ読み取っていません。「いまの状態を読む」を押すと、どの枠が使えるか分かります。';
  }
  const all = articleSlotAdviceAll(rows);
  const usable = all.filter((a) => a.state === 'usable').length;
  const hidden = all.filter((a) => a.state === 'hidden').length;
  const empty = all.filter((a) => a.state === 'empty').length;
  // ★★ 第163便: 空の枠も【使える】。★ 数え方を変える
  const parts: string[] = ['いますぐ使える枠は ' + (usable + empty) + ' つです'];
  if (empty > 0) parts.push('うち ' + empty + ' つは空いているので、送ると新しく記事を作ります');
  if (hidden > 0) parts.push('非表示の枠が ' + hidden + ' つあります（送っても公開ページには出ません）');
  return parts.join('。') + '。';
}
