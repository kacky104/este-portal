// エステ魂の写メNote（【新】写メNote）をコネックエフから決めた間隔で投稿する（第1941便・2026-11-11・カッキーさん）。★ 純粋関数だけ。
//
// ★ ベンリーの「エステ魂【オプション】(【新】写メNote)」と同じ使い方:
//     投稿内容（タイトル・本文・画像3枚まで・カテゴリ・セラピスト）を何件か用意しておき、決めた間隔で1件ずつ順番に投稿する。
// ★ 写メNote はセラピスト本人のアカウントの持ち物 → 写メ日記転送と同じ「代理ログイン」の道で送る（lib/esutamaDiaryFlow.ts）。
//   ★ 流れは intent='diary_auto' に ctx.esutamaNote を載せたもの（魂セラピスト一覧を読んだあと、DB 側 planEsutamaNote が相手を決める）。
// ★★ 本人の了承（therapist_media_consent）は見ない（カッキーさんの決定 2026-11-11「了承は見ずに送る」・ベンリーと同じ）。
//     ただし、エステ魂で魂セラピストを始めていない人・名簿が結びついていない人には送れない（代理ログインできない）。
// ★★★ 投稿は【上書きではなく1件増える】。店舗側から消せない → 送り直さない。次の行へ進めるのは代理ログインに入る前（DB 側）。

import { ESUTAMA_DIARY_CATEGORIES, ESUTAMA_TITLE_MAX, ESUTAMA_CONTENT_MAX, isEsutamaCategory } from './esutamaDiaryPost';
import { ESUTAMA_DIARY_PHOTO_MAX } from './esutamaDiaryPhoto';

export const ESUTAMA_NOTE_CATEGORIES = ESUTAMA_DIARY_CATEGORIES;
export const ESUTAMA_NOTE_TITLE_MAX = ESUTAMA_TITLE_MAX;     // 30
export const ESUTAMA_NOTE_BODY_MAX = ESUTAMA_CONTENT_MAX;    // 2000
export const ESUTAMA_NOTE_IMAGE_MAX = ESUTAMA_DIARY_PHOTO_MAX; // 3
/** ★ 用意できる投稿内容の数（ベンリーは＋で足していく形。多すぎると保存が重いので50まで） */
export const ESUTAMA_NOTE_ITEMS_MAX = 50;
/** ★ 既定: 朝6時〜翌6時・90分おき（オイルクエスト様のベンリーの設定「1時間30分間隔」） */
export const ESUTAMA_NOTE_DEFAULT = { startMin: 360, endMin: 1800, intervalMin: 90 };

export type EsutamaNoteItem = {
  title: string;
  body: string;
  /** エステ魂のカテゴリ（1:日常 2:お知らせ 3:出勤情報 4:お礼 5:ブログ 6:イベント） */
  categoryId: string;
  /** フクエスのセラピストの番号（エステ魂の魂セラピストと名簿で結びついている人）。未選択は null */
  therapistId: number | null;
  /** 画像の置き場（salon-images/<店>/esutama_note_<時刻>.jpg）。3枚まで */
  images: string[];
};

/** コネックエフに上げた写メNote 用の画像の置き場だけ */
export function isEsutamaNoteImagePath(p: string): boolean {
  return /^\d{1,10}\/esutama_note_[A-Za-z0-9_-]{1,80}\.jpg$/.test(String(p ?? '')) && !String(p).includes('..');
}

const chars = (s: string) => [...s].length;

/** 表（jsonb）や画面から来たものを、決まった形にそろえる。★ 形の違うものは捨てる（落ちた数は呼び出し側で数えない＝画面の値をそのまま保存し直すだけ） */
export function normalizeEsutamaNoteItems(raw: unknown): EsutamaNoteItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: EsutamaNoteItem[] = [];
  for (const x of list.slice(0, ESUTAMA_NOTE_ITEMS_MAX)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const tid = Number(o.therapistId);
    out.push({
      title: String(o.title ?? ''),
      body: String(o.body ?? ''),
      categoryId: isEsutamaCategory(String(o.categoryId ?? '')) ? String(o.categoryId) : '1',
      therapistId: Number.isInteger(tid) && tid > 0 ? tid : null,
      images: (Array.isArray(o.images) ? o.images : []).map(String).filter(isEsutamaNoteImagePath).slice(0, ESUTAMA_NOTE_IMAGE_MAX),
    });
  }
  return out;
}

/** 1件ぶんの問題（無ければ null）。★ 画面の保存と、周の「送れる行か」の両方で使う */
export function esutamaNoteItemProblem(it: EsutamaNoteItem): string | null {
  if (it.title.trim() === '') return 'タイトルが空です';
  if (chars(it.title) > ESUTAMA_NOTE_TITLE_MAX) return `タイトルは${ESUTAMA_NOTE_TITLE_MAX}文字までです`;
  if (it.body.trim() === '') return '本文が空です';
  if (chars(it.body) > ESUTAMA_NOTE_BODY_MAX) return `本文は${ESUTAMA_NOTE_BODY_MAX}文字までです`;
  if (!it.therapistId) return 'セラピストを選んでください';
  return null;
}

/**
 * 次に送る1件を選ぶ。nextIndex から順に見て、送れる最初の行（問題の無い行）。
 * ★ 送れない行（未入力・セラピスト未選択）は飛ばす。全部だめなら null。
 * ★ 返す nextIndex は「その次に見る番号」（最後まで行ったら 0 に戻る）。
 */
export function pickEsutamaNoteItem(items: EsutamaNoteItem[], nextIndex: number): { index: number; item: EsutamaNoteItem; nextIndex: number } | null {
  const n = items.length;
  if (n === 0) return null;
  const start = ((Math.floor(Number(nextIndex) || 0) % n) + n) % n;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (esutamaNoteItemProblem(items[i]) === null) return { index: i, item: items[i], nextIndex: (i + 1) % n };
  }
  return null;
}

/** カテゴリの名前（画面・記録用） */
export function esutamaNoteCategoryLabel(id: string): string {
  return ESUTAMA_NOTE_CATEGORIES.find((c) => c.id === id)?.label ?? '日常';
}
