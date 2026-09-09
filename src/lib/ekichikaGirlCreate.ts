// ───────── ★★★ 駅ちかにセラピストを1人 登録する（第233便・2026-09-09）─────────
//
// ★★★ 実物で確かめた形（第227便・2026-09-09 の実弾調査／設計メモ §2）:
//   新規登録 `POST https://ranking-deli.jp/admin/girls/create/`（**110部品**）
//   ★ 必須は2つ … `name` と **`genre[N]` を最低1つ**
//     ★ 足りないと赤字で「ジャンルは最低１つ選択してください。」が出て、DBには入らない
//   ★ `required` 属性は1つも無い。★ 検証はすべてサーバ側 → **こちらで確かめてから送る**
//   ★ 送れる欄: name / cup / catchcopy / age / tall / bust / waist / hip / bloodtype /
//     constellation / girl_comments / title / comments / options / questions[1..10] /
//     answers[1..10] / genre[N]（19まで） / p_genre[N]（3まで）
//   ★ hidden: fuel_csrf_token / p_genre_max_num / girls_genre_max_num
//   ★ **写真の欄は無い**（`input[type=file]` ゼロ）。★ 写真は登録のあと別の口で送る（第107便）
//
// ★★★★ `rookie_flg`（新人）は **HTML に欄が無いが、送れば通る**（§2-7b・実弾で確認）:
//   新規登録の POST に `rookie_flg=1` を混ぜると、その場で新人マークが付き、
//   **写真が1枚も無くても**公開ページのカードに「新人」が出た（castId 5809639 で確認）。
//   ★ 30日で自動的に消える。★ `2`（体験入店＋新人）は**月10人の枠を消費する**ので使わない。
//   ★ 教訓: 「HTMLに欄が無い」と「サーバが受け付けない」は別。★ ただし**確かめてから**混ぜること。
//
// ★★ 保存に成功すると `/admin/girls/edit/<castId>` へリダイレクトする（§2-4）。
//   ★ それでも **castId はリダイレクトから取らない**。★ 一覧を読み直して裏取りする
//     （第46便 §35「書き込みの成否を書き込みの応答で判定しない」）。
//
// ★ このファイルは通信も DB も触らない。

import { parseHtmlForm, optionValueByLabel, type HtmlFormParse } from './htmlForm';
import { RELAY_USER_AGENT } from './relayUserAgent';
import { EKICHIKA_MAX_GENRES } from './mediaBadgeMap';

export const EKICHIKA_ORIGIN = 'https://ranking-deli.jp';
export const EKICHIKA_GIRL_CREATE_URL = 'https://ranking-deli.jp/admin/girls/create/';
export const EKICHIKA_GIRLS_LIST_URL = 'https://ranking-deli.jp/admin/girls/';

/**
 * ★★★ 新人マークの値。`1`＝新人（30日で自動的に消える）。
 *   ★★ `2`（体験入店＋新人）は **月10人の枠を消費する**（ラビリンス様は調査当日 2/10 使用済みだった）。
 *     ★ こちらから枠を減らしてはいけない。★ **この値は 1 だけ。**
 */
export const EKICHIKA_ROOKIE_FLG = '1';

/**
 * ★★★ 登録フォームを見分ける目印。
 *   ★ 「1ページに form は1つ」と決めつけない（検索窓やログアウトが混ざる画面が在る）。
 *   ★ `catchcopy` は女の子の登録フォームにしか無い欄（§2-3）。
 */
export const EKICHIKA_GIRL_FORM_MARKERS = ['fuel_csrf_token', 'catchcopy'] as const;

export type RelayRequest = {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
};

function baseHeaders(): Record<string, string> {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
  };
}

export type EkichikaGirlFormParse = HtmlFormParse & {
  /** 使い捨てトークン。★ 無ければ null */
  csrfToken: string | null;
  /** ★ 画面に在るジャンルの番号（`genre[<id>]` の id）。★ 相手に無い番号を送らないために使う */
  genreIds: string[];
};

/** 登録フォームを読む。★ `catchcopy` と `fuel_csrf_token` を持つ form を選ぶ */
export function parseEkichikaGirlForm(html: string): EkichikaGirlFormParse {
  const f = parseHtmlForm(html, { containsNames: EKICHIKA_GIRL_FORM_MARKERS });
  const csrfToken = f.fields.find((x) => x.name === 'fuel_csrf_token')?.value ?? null;
  const genreIds: string[] = [];
  for (const n of f.names) {
    const m = /^genre\[(\d+)\]$/.exec(n);
    if (m) genreIds.push(m[1]);
  }
  const warnings = [...f.warnings];
  if (f.fields.length > 0) {
    if (!csrfToken) warnings.push('fuel_csrf_token が見つからない');
    if (!f.names.includes('name')) warnings.push('name の欄が見つからない');
    if (genreIds.length === 0) warnings.push('ジャンル（genre[N]）が1つも見つからない');
  }
  return { ...f, warnings, csrfToken, genreIds };
}

/** 送る値。★ 名前とジャンルだけが必須。★ 空のものは【読んだフォームのまま】にする */
export type EkichikaGirlCreateValues = {
  name: string;
  /** ★ ジャンル。★ 1つ以上。★ 相手の画面に実在する番号だけ（`genre[<id>]=1` で送る） */
  genreIds: number[];
  age?: string | null;
  tall?: string | null;
  bust?: string | null;
  waist?: string | null;
  hip?: string | null;
  /**
   * ★★★ カップは **1文字（A〜）** で渡す。★ 番号はこちらで決め打ちしない。
   *   ★ 読んだフォームの選択肢から「Dカップ」のような**ラベルで引き当てる**。
   *   ★★ 第230便で「27種だから番号は1〜27」と決めつけて転んだ。★ 数と番号は別物。
   */
  cup?: string | null;
};

/** ★ 数字だけ・けた数まで確かめる。★ 通らなければ例外（＝送らない） */
function num(label: string, val: string | null | undefined, max: number): string | null {
  if (val === null || val === undefined || val === '') return null;
  const t = String(val).trim();
  if (!new RegExp('^\\d{1,' + max + '}$').test(t)) throw new Error(label + 'は数字' + max + 'けたまでです（' + t + '）');
  return t;
}

/**
 * ★★★ セラピストを1人 登録する POST。★ **相手に人を増やす。**
 *
 * @param form parseEkichikaGirlForm が読んだもの
 *
 * ★★★ 止める条件（★ 迷ったら送らない）:
 *   ・名前が空 ／ 画面の maxlength を超える（★ 上限はこちらに書き写さず、読んだ値で見る）
 *   ・ジャンルが0個 ／ 19個を超える ／ **相手の画面に無い番号が混じっている**
 *   ・年齢・身長・3サイズが数字でない
 *   ・`fuel_csrf_token` が無い
 *   ・★★ **優先タグ（`p_genre[...]`）が混じっている**（§6-1 の4「上位表示は店の運用。機械が決めない」）
 */
export function buildEkichikaGirlCreateRequest(
  cookie: string,
  form: EkichikaGirlFormParse,
  v: EkichikaGirlCreateValues,
): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま登録しない');

  const name = String(v.name ?? '').trim();
  if (!name) throw new Error('名前が空のまま登録しない');
  // ★★ 上限は【画面に書いてあるもの】を使う。★ こちらに書き写して古くなるのを避ける
  const nameMax = form.maxLengths['name'];
  if (typeof nameMax === 'number' && nameMax > 0 && [...name].length > nameMax) {
    throw new Error('駅ちかの名前は' + nameMax + '文字以内です（' + [...name].length + '文字）');
  }

  const ids = Array.isArray(v.genreIds) ? v.genreIds.map((x) => String(x)) : [];
  if (ids.length === 0) throw new Error('ジャンルが1つも無いまま登録しない（相手の必須項目）');
  if (ids.length > EKICHIKA_MAX_GENRES) throw new Error('駅ちかのジャンルは' + EKICHIKA_MAX_GENRES + 'つまでです（' + ids.length + '個）');
  const unknown = ids.filter((id) => !form.genreIds.includes(id));
  if (unknown.length > 0) throw new Error('駅ちかの画面に無いジャンルの番号です（' + unknown.join(',') + '）');

  const ov: Record<string, string> = { name };
  const age = num('年齢', v.age, 2); if (age !== null) ov.age = age;
  const tall = num('身長', v.tall, 3); if (tall !== null) ov.tall = tall;
  const b = num('バスト', v.bust, 3); if (b !== null) ov.bust = b;
  const w = num('ウエスト', v.waist, 3); if (w !== null) ov.waist = w;
  const h = num('ヒップ', v.hip, 3); if (h !== null) ov.hip = h;

  // ★★★ カップは**ラベルで引く**。★ 引けなければ**送らない**（読んだフォームのまま）
  const cupLetter = String(v.cup ?? '').trim().toUpperCase();
  if (cupLetter) {
    const found = optionValueByLabel(form.selectOptions['cup'], cupLetter + 'カップ');
    if (found !== null) ov.cup = found;
  }

  if (!form.csrfToken) throw new Error('fuel_csrf_token が無いまま登録しない');

  const fields = form.fields ?? [];
  // ★★★ 優先タグは送らない。★ 読んだフォームに混ざっていたら止める（二重の見張り）
  if (fields.some((f) => /^p_genre\[/.test(f.name))) {
    throw new Error('優先タグ（p_genre）が混じっています。★ 上位表示は店舗様の運用なので送りません');
  }

  const out: Array<[string, string]> = [];
  const used = new Set<string>();
  for (const f of fields) {
    // ★ ジャンルは【こちらが選んだものだけ】にする。読んだ側のチェックは持ち越さない
    if (/^genre\[\d+\]$/.test(f.name)) continue;
    if (Object.prototype.hasOwnProperty.call(ov, f.name)) { out.push([f.name, ov[f.name]]); used.add(f.name); continue; }
    out.push([f.name, f.value]);
  }
  for (const k of Object.keys(ov)) if (!used.has(k)) out.push([k, ov[k]]);
  for (const id of ids) out.push(['genre[' + id + ']', '1']);
  // ★★★★ 画面に無い欄をあえて足す（§2-7b）。★ 実弾で通ることを確かめてある
  out.push(['rookie_flg', EKICHIKA_ROOKIE_FLG]);

  const body = out
    .map(([k, val]) => encodeURIComponent(k) + '=' + encodeURIComponent(val))
    .join('&');

  return {
    method: 'POST',
    url: EKICHIKA_GIRL_CREATE_URL,
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
      referer: EKICHIKA_GIRL_CREATE_URL,
      origin: EKICHIKA_ORIGIN,
      cookie,
    },
    body,
  };
}

/** 登録フォームを読む GET。★ 読むだけ */
export function buildEkichikaGirlFormRequest(cookie: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま登録フォームを読みに行かない');
  return {
    method: 'GET',
    url: EKICHIKA_GIRL_CREATE_URL,
    headers: { ...baseHeaders(), referer: EKICHIKA_GIRLS_LIST_URL, cookie },
  };
}
