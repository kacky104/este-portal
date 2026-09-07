// 駅ちか管理画面「即ヒメ設定画面」(/admin/sokuiku/) の読み取り（第213便・2026-09-08・純粋関数）。
//
// ★★★ 何のために — フクエスの「今すぐ」を駅ちかの「即ヒメ」へ送る（設計メモ_今すぐを駅ちかの即ヒメへ_2026-09-07.md）。
//   ★ この便は【読むだけ】。1文字も書き換えない（第49便の作法「直す前に、まず見えることを作る」）。
//
// ★★★ 実物で確かめた形（2026-09-07 23:5x・カッキーさんの許可のもと Claude in Chrome で DOM を読んだ・掲載A shopid 37168）:
//   h1「即ヒメ設定画面」
//   「出勤中女の子一覧」 ★★★ 一覧に出るのは【いま出勤中の子だけ】
//     <ul id="girls-list-box" class="list">
//       <li id="5257770" class="girls-cell state-fast">      ← id = castId。state-fast=即ヒメ中／(state-now=出勤中と推定)
//         <p class="girl-name">かな</p>
//   凡例「※赤：即ヒメ!!設定中 ピンク：現在出勤中」
//   枠 <div id="girls-images-set" class="sokuiku sokuikuSetBoxList">
//     <div id="setbox4" class="image-set-box droparea sokuiku_set_box sokuikuSetBoxList-item"
//          data-girlid="5257770" data-sokuikuid="851371885">          ← 設定中
//        <p class="setboxTitle1">即ヒメ-設定中</p>
//        <p class="time_info sokuikuSetBoxList-item-timeInfo">[～ 00:12 迄]</p>
//        <p class="timer on sokuikuSetBoxList-item-timer is-countdown" data-expired-at="1788793939">残り28分26秒</p>
//        <p id="imgdel_toppriority" class="sokuikuDelBtn">[削除]</p>
//        <input id="form_toppriority_girl_id" class="girl_id" name="toppriority_girl_id" value="5257770">
//     <div id="setbox4" class="... sokuiku_set_box ..." data-sokuikuid="">   ← 未設定（×4）
//        <p class="setboxTitle1">即ヒメ-未設定</p>
//   ★ 枠は5つ（この店のプラン）。★ 枠の数＝同時に即ヒメにできる人数の上限。
//   ★ hidden: #hide_shop_id（5桁）・#girl_pic_num=8。#all_sokuiku_num / #preceding_flg は【この店には無い】（回数制のプランにだけある）。
//
// ★★ ui-droppable / ui-sortable-handle は JS が足すクラス。★ 生の HTML には無い前提で書く（頼らない）。
// ★★ 生の HTML はまだ突き合わせていない（トークンを含むため保存していない）。
//   ★ 実物の HTML を _fixtures/ekichika_sokuhime.html に置いたら、scripts/sokuhimeparse-selftest.js の末尾で突き合わせる。
//   ★ 突き合わせるまで【本番で書く側には使わない】（読むだけの写しにとどめる）。

import { textOf } from './ekichikaGirlsParse';

/** 即ヒメの枠1つぶん。 */
export type EkichikaSokuhimeBox = {
  /** 0始まりの枠の番号（girls.js の sokuikuSetIndex と同じ数え方） */
  index: number;
  /** 設定中の castId。★ 未設定は null */
  girlId: string | null;
  /** 駅ちか側の即ヒメID（data-sokuikuid）。★ 削除に要る。未設定は null */
  sokuikuId: string | null;
  /** 切れる時刻（unix 秒・data-expired-at）。★ 読めなければ null */
  expiresAtUnix: number | null;
  /** 「[～ 00:12 迄]」の中の HH:MM。★ 表示用。無ければ null */
  untilLabel: string | null;
};

/** 出勤中の子1人ぶん（一覧）。 */
export type EkichikaSokuhimeGirl = {
  castId: string;
  name: string;
  /** state-fast（即ヒメ中）か */
  isSokuhime: boolean;
  /** state-XXX の生の文字列（知らない値をあとから読めるように） */
  raw: string | null;
};

export type EkichikaSokuhimePage = {
  boxes: EkichikaSokuhimeBox[];
  /** 出勤中の子（一覧）。★ 0人は普通に起きる（深夜など） */
  working: EkichikaSokuhimeGirl[];
  /** 回数制のプランか（#all_sokuiku_num があるか）。★ 無い＝回数制でない（実物がそうだった） */
  countedPlan: boolean;
  /** 回数制のとき、残り回数。★ 回数制でなければ null */
  remainingCount: number | null;
  /** ★★★ 読めたが信用できない理由。空でなければ使わせない */
  problems: string[];
};

const BOX_HEAD = /<div\b[^>]*\bclass="[^"]*\bsokuiku_set_box\b[^"]*"[^>]*>/gi;
const CELL_HEAD = /<li\b([^>]*\bclass="[^"]*\bgirls-cell\b[^"]*"[^>]*)>/gi;

function attr(tag: string, name: string): string | null {
  const m = new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(tag);
  return m ? m[1] : null;
}

export function parseEkichikaSokuhime(html: string): EkichikaSokuhimePage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const boxes: EkichikaSokuhimeBox[] = [];
  const working: EkichikaSokuhimeGirl[] = [];

  // ★ ログイン画面や別ページを「枠0・出勤0」と読まない。★ 見出しで即ヒメの画面であることを確かめる
  if (!/即ヒメ設定/.test(src)) {
    problems.push('「即ヒメ設定」の見出しが無い。ログイン画面か別のページを疑うこと');
    return { boxes, working, countedPlan: false, remainingCount: null, problems };
  }

  // 1. 枠。★ 隣どうしで切る（</div> の対応を数えない・girls の parser と同じ作法）
  const heads: Array<{ index: number; end: number; tag: string }> = [];
  BOX_HEAD.lastIndex = 0;
  for (let m = BOX_HEAD.exec(src); m !== null; m = BOX_HEAD.exec(src)) {
    heads.push({ index: m.index, end: m.index + m[0].length, tag: m[0] });
  }
  if (heads.length === 0) {
    problems.push('即ヒメの枠（sokuiku_set_box）が1つも見つからない。レイアウト変更を疑うこと');
  }
  for (let i = 0; i < heads.length; i++) {
    const tag = heads[i].tag;
    const chunk = src.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].index : src.length);
    const girlAttr = attr(tag, 'data-girlid');
    const sokuikuAttr = attr(tag, 'data-sokuikuid');
    const hiddenGirl = /name="toppriority_girl_id"[^>]*\bvalue="(\d+)"/i.exec(chunk)?.[1]
      ?? /\bvalue="(\d+)"[^>]*name="toppriority_girl_id"/i.exec(chunk)?.[1] ?? null;
    const girlId = (girlAttr && /^\d+$/.test(girlAttr)) ? girlAttr : (hiddenGirl ?? null);
    if (girlAttr && hiddenGirl && girlAttr !== hiddenGirl) {
      // ★★★ 番号が食い違う枠は使わない（削除に使うと別人を外す）
      problems.push('枠' + (i + 1) + 'の data-girlid(' + girlAttr + ') と hidden(' + hiddenGirl + ') が食い違う');
      continue;
    }
    const sokuikuId = sokuikuAttr && /^\d+$/.test(sokuikuAttr) ? sokuikuAttr : null;
    const exp = /data-expired-at="(\d+)"/i.exec(chunk)?.[1] ?? null;
    const until = /\[\s*[～〜~]\s*(\d{1,2}:\d{2})\s*迄\s*\]/.exec(chunk)?.[1] ?? null;
    const isSet = /即ヒメ-設定中/.test(chunk);
    if (isSet && !girlId) problems.push('枠' + (i + 1) + 'は「設定中」なのに castId が読めない');
    if (!isSet && girlId) problems.push('枠' + (i + 1) + 'は「未設定」なのに castId(' + girlId + ')が入っている');
    boxes.push({
      index: i,
      girlId: isSet ? girlId : null,
      sokuikuId: isSet ? sokuikuId : null,
      expiresAtUnix: isSet && exp ? Number(exp) : null,
      untilLabel: isSet ? until : null,
    });
  }

  // 2. 出勤中の一覧。★ 0人は普通（problem にしない）
  CELL_HEAD.lastIndex = 0;
  const cells: Array<{ index: number; end: number; attrs: string }> = [];
  for (let m = CELL_HEAD.exec(src); m !== null; m = CELL_HEAD.exec(src)) {
    cells.push({ index: m.index, end: m.index + m[0].length, attrs: m[1] });
  }
  const seen = new Set<string>();
  for (let i = 0; i < cells.length; i++) {
    const chunk = src.slice(cells[i].end, i + 1 < cells.length ? cells[i + 1].index : src.length);
    const castId = attr('<li ' + cells[i].attrs + '>', 'id');
    if (!castId || !/^\d+$/.test(castId)) { problems.push('出勤中の一覧の' + (i + 1) + '件目に id が無い'); continue; }
    if (seen.has(castId)) { problems.push('castId ' + castId + ' が一覧に2回出てくる'); continue; }
    seen.add(castId);
    const nameHtml = /<p\b[^>]*\bclass="[^"]*\bgirl-name\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk)?.[1] ?? '';
    const name = textOf(nameHtml);
    if (!name) { problems.push('castId ' + castId + ' の名前が読めない'); continue; }
    const cls = attr('<li ' + cells[i].attrs + '>', 'class') ?? '';
    const st = /\bstate-([a-z]+)\b/i.exec(cls)?.[1] ?? null;
    working.push({ castId, name, isSokuhime: st === 'fast', raw: st });
  }

  // 3. 回数制のプランか
  const countM = /id="all_sokuiku_num"[^>]*\bvalue="(\d+)"/i.exec(src) ?? /\bvalue="(\d+)"[^>]*id="all_sokuiku_num"/i.exec(src);
  const countedPlan = countM !== null;
  const remainingCount = countM ? Number(countM[1]) : null;

  // 4. 突き合わせ: 枠に居る子は一覧でも state-fast のはず（★ 一覧が0人のときは見ない）
  for (const b of boxes) {
    if (!b.girlId) continue;
    const g = working.find((w) => w.castId === b.girlId);
    if (g && !g.isSokuhime) problems.push('castId ' + b.girlId + ' は枠に居るのに一覧では即ヒメ中になっていない');
  }

  return { boxes, working, countedPlan, remainingCount, problems };
}

/** 読み取り結果を使ってよいか。★ problems が空で、枠が1つ以上読めていること */
export function sokuhimePageUsable(page: EkichikaSokuhimePage): boolean {
  return page.problems.length === 0 && page.boxes.length > 0;
}

/** ★ 使っている枠の数（設定中）。 */
export function sokuhimeUsed(page: { boxes: ReadonlyArray<{ girlId: string | null }> }): number {
  return page.boxes.filter((b) => b.girlId !== null).length;
}

/** ★ 空いている枠の番号（小さい順）。 */
export function sokuhimeFreeSlots(page: { boxes: ReadonlyArray<{ index: number; girlId: string | null }> }): number[] {
  return page.boxes.filter((b) => b.girlId === null).map((b) => b.index);
}

/**
 * ★ 切れている枠（expired_at が now より前）。★ 駅ちか側が消し忘れている／再読み込み前の写し、のどちらか。
 * ★ 押し直しの対象（設計メモ §12-2）。★ now は引数で受ける（このファイルは時計を持たない）
 */
export function sokuhimeExpired(page: { boxes: ReadonlyArray<EkichikaSokuhimeBox> }, nowUnix: number): EkichikaSokuhimeBox[] {
  return page.boxes.filter((b) => b.girlId !== null && b.expiresAtUnix !== null && b.expiresAtUnix <= nowUnix);
}

/** 店舗様に出す1行。「即ヒメ枠 1/5（残り4）」 */
export function sokuhimeSummaryLabel(page: { boxes: ReadonlyArray<{ girlId: string | null }> }): string {
  const used = sokuhimeUsed(page);
  const total = page.boxes.length;
  return `即ヒメ枠 ${used}/${total}（空き${Math.max(0, total - used)}）`;
}

/** ★ 画面に渡す写し（第213便）。★ 'use server' のファイルは型を export できないのでここに置く */
export type SokuhimeSnapshotView = {
  readAtISO: string;
  slotCount: number;
  used: number;
  countedPlan: boolean;
  remainingCount: number | null;
  boxes: Array<EkichikaSokuhimeBox & { name: string | null }>;
  working: Array<{ castId: string; name: string; isSokuhime: boolean }>;
};
