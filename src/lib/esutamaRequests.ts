// エステ魂（estama.jp）へ投げる要求の組み立て（第109便・純粋関数）。
//
// ★★★ 中継の作りは駅ちか・エステラブと同じ（第38便／第77便）。
//   [Vercel] 要求を組む（ここ）→ [VPS] 中身を理解せず投げる → [Vercel] 応答を読む
//   ★ VPS 側に新しい実装は要らない。★ ただし **宛先の allowlist に estama.jp を足す**必要がある
//     （★ カッキーさんの作業。src/lib/relayJob.ts と scripts/relay.sh の両方）。
//
// ★★★ 実測でわかった形（設計メモ_エステ魂の出勤書き込み_2026-09-02 §2〜§4）:
//   ログイン画面  GET  /login/                      → HTML の中に #csrf_footer（32文字）
//   ログイン      POST /post/login_shop/            str[n][name]/str[n][value] の並び ＋ ctk
//                 応答 JSON  ['REDIRECT_OK', url] / ['OUT', {...}]
//   名簿          GET  /admin/schedule/list/        名前 → cast_id
//   出勤表        GET  /admin/schedule/<cast_id>/   14日分のフォーム ＋ #csrf_footer
//   出勤の保存    POST /admin/schedule/post_work_schedule/   平たい urlencoded ＋ ctk
//                 応答 JSON  ['OK'] / ['ERROR', …] / ['REDIRECT', url]
//
// ★★★ このファイルは【要求を組むだけ】。通信もDBも触らない。
// ★★★ CSRF（ctk）は **POST の直前に GET したページの値** を使う。古い値を持ち回らない。

import { encodePayload } from './ekichikaWorkParse';
import { RELAY_USER_AGENT } from './relayUserAgent';

export const ESUTAMA_ORIGIN = 'https://estama.jp';
export const ESUTAMA_LOGIN_PAGE_URL = 'https://estama.jp/login/';
export const ESUTAMA_LOGIN_POST_URL = 'https://estama.jp/post/login_shop/';
/** 名簿（セラピストの出勤設定）。★ 読むだけ。名前と cast_id が取れる */
export const ESUTAMA_ROSTER_URL = 'https://estama.jp/admin/schedule/list/';
/** 管理画面トップ。★ ログイン確認に使う（未ログインなら /login/ へ 302） */
export const ESUTAMA_ADMIN_URL = 'https://estama.jp/admin/';

/**
 * ★★★ セラピスト設定の一覧（第229便）。★ 出勤名簿（ESUTAMA_ROSTER_URL）とは別のページ。
 *   ★ 表示／非表示の状態は**ここにしか無い**（2026-09-09 実測）。
 */
export const ESUTAMA_CAST_LIST_URL = 'https://estama.jp/admin/cast/';

/**
 * ★★★ 非表示にする口（第229便）。★ **表示に戻す口は別（cast_enable）。トグルではない。**
 *   ★ 押し間違えても逆にならない、というのがこの作りの良いところ（2026-09-09 実測）。
 *   ★ こちらは【非表示にする】ためだけに使う。★ 表示に戻す口は作らない（要るときに足す）。
 */
export const ESUTAMA_CAST_DISABLE_URL = 'https://estama.jp/admin_post/cast_disabled';

/**
 * ★★★ セラピストの追加／編集フォーム（第231便）。★ **GET も POST も同じ場所**（自分自身へ送る）。
 *   ★ 新規は `/admin/cast_edit/`（hidden `cast_id=0`）／ 編集は `/admin/cast_edit/<cast_id>/`。
 *   ★ この便で使うのは **新規だけ**。★ 編集フォームは叩かない。
 */
export const ESUTAMA_CAST_EDIT_URL = 'https://estama.jp/admin/cast_edit/';
/** ★★ 出勤の保存先。**このファイルで唯一、相手を書き換える宛先。** */
export const ESUTAMA_WORK_SAVE_URL = 'https://estama.jp/admin/schedule/post_work_schedule/';

// ── 写メ日記（第129便・2026-09-04）─────────────────────────────────
//
// ★★★ エステ魂の写メ日記は【セラピスト本人のアカウント】の持ち物。
//   ★ 店舗の管理画面からは投稿できない（画面にそう書いてある）。
//   → 「本人の代わりにログイン」（代理ログイン）を通る。★ セラピストのパスワードは預からない。
//
// ★★★ 2026-09-04 に実物で確かめた往復（ラビリンス様の許可のもと・投稿はしていない）:
//   ① POST create_shop_token   body: cast_id=<数字> & ctk=<32文字>   ★ 店舗のセッションで
//      → {"success":true,"login_token":"<64文字>","login_url":"...","expires_at":"YYYY-MM-DD HH:MM:SS"}
//      ★★ 期限は約30分（発行 12:19 → 12:49 だった）
//   ② GET  /tamathera/login/shop_token/<login_token>   → 代理ログインのセッションが張られる
//   ③ GET  /tamathera/diary/post/                      → ctk（32文字）を拾う
//   ④ POST /tamathera/diary/post/                      → 7項目（esutamaDiaryPost.ts）
//   ⑤ GET  /tamathera/login/end_proxy/                 → 代理ログインを終える
//
// ★★★ login_token は【実質パスワード】。★ 保存しない・ログに出さない・監査にも書かない。
//   ★ 使うのはその場の②だけ。★ 期限が短いのは相手の設計。★ こちらで延ばそうとしない。

/** 魂セラピスト アカウント管理。★ 読むだけ。★ 利用中の人と cast_id が取れる */
export const ESUTAMA_THERAPIST_ADMIN_URL = 'https://estama.jp/admin/tamathera/therapist/';
/** ★★ 代理ログイン用のトークンを発行させる口。★ 相手に状態を作らせるので【読むだけ】ではない */
export const ESUTAMA_CREATE_SHOP_TOKEN_URL = 'https://estama.jp/admin/tamathera/therapist/create_shop_token';
/** 写メ日記の新規投稿（GET で ctk を拾い、POST で送る）。★ 唯一、日記を書き込む宛先 */
export const ESUTAMA_DIARY_POST_URL = 'https://estama.jp/tamathera/diary/post/';
/** ★★★ 代理ログインを終える。★ 送り終えたら【必ず】通る。★ 店舗のセッションへ戻す */
export const ESUTAMA_END_PROXY_URL = 'https://estama.jp/tamathera/login/end_proxy/';

/** 代理ログインのURL。★ token は相手が発行した値をそのまま使う。★ 形だけ確かめる */
export function esutamaProxyLoginUrl(token: string): string {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw new Error('エステ魂の代理ログイン用トークンの形が違います');
  return 'https://estama.jp/tamathera/login/shop_token/' + token;
}

/** 1人の出勤表のURL。★ cast_id は数字だけ（それ以外は組み立てない） */
export function esutamaWorkPageUrl(castId: string): string {
  if (!/^\d{1,12}$/.test(castId)) throw new Error('エステ魂の cast_id の形が違います（' + castId + '）');
  return 'https://estama.jp/admin/schedule/' + castId + '/';
}

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

/** JS 送信（$.ajax dataType:'json'）と同じ見た目にする。★ 応答が JSON で返る前提の段だけに付ける */
function ajaxHeaders(cookie: string, referer: string): Record<string, string> {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'application/json, text/javascript, */*; q=0.01',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest',
    referer,
    origin: ESUTAMA_ORIGIN,
    ...(cookie ? { cookie } : {}),
  };
}

/** ログイン画面を読む GET。★ ここで Cookie と csrf_footer を拾う。何も書き換えない。 */
export function buildEsutamaLoginPageRequest(): RelayRequest {
  return { method: 'GET', url: ESUTAMA_LOGIN_PAGE_URL, headers: baseHeaders() };
}

/**
 * ログイン。
 *
 * ★★★ 本文は jQuery が serializeArray() をそのまま data に入れた形（実測 §2）:
 *   str[0][name]=mail & str[0][value]=… & str[1][name]=password & str[1][value]=… & str[2][name]=r & str[2][value]= & ctk=…
 * ★ 並びも画面と同じ（mail → password → r）。★ r は hidden で空（未使用）。
 * ★ ctk は【直前に GET したログイン画面】の #csrf_footer。★ 空なら組み立てない。
 */
export function buildEsutamaLoginRequest(
  cred: { loginId: string; password: string },
  csrf: string,
  cookie: string,
): RelayRequest {
  if (!cred.loginId || !cred.password) {
    throw new Error('ログインに要る2点（メールアドレス / パスワード）のどちらかが空');
  }
  if (!isCsrfShape(csrf)) throw new Error('エステ魂の CSRF トークンが取れていません');
  const body = encodePayload([
    ['str[0][name]', 'mail'],
    ['str[0][value]', cred.loginId],
    ['str[1][name]', 'password'],
    ['str[1][value]', cred.password],
    ['str[2][name]', 'r'],
    ['str[2][value]', ''],
    ['ctk', csrf],
  ]);
  return {
    method: 'POST',
    url: ESUTAMA_LOGIN_POST_URL,
    headers: ajaxHeaders(cookie, ESUTAMA_LOGIN_PAGE_URL),
    body,
  };
}

/** 名簿を読む GET。★ 読むだけ。 */
export function buildEsutamaRosterRequest(cookie: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま名簿を読みに行かない');
  return {
    method: 'GET',
    url: ESUTAMA_ROSTER_URL,
    headers: { ...baseHeaders(), referer: ESUTAMA_ADMIN_URL, cookie },
  };
}

/** 1人の出勤表を読む GET。★ 読むだけ。★ 保存の直前にも必ずこれで読み直す（ctk と現状のため）。 */
export function buildEsutamaWorkReadRequest(cookie: string, castId: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま出勤表を読みに行かない');
  return {
    method: 'GET',
    url: esutamaWorkPageUrl(castId),
    headers: { ...baseHeaders(), referer: ESUTAMA_ROSTER_URL, cookie },
  };
}

/**
 * ★★★ 出勤の保存。**このファイルで唯一、相手を書き換える要求。**
 *
 * @param fields esutamaWorkParse.buildEsutamaPayload が作ったもの（ctk を含む）
 *
 * ★★ 中身が薄いなら投げない（例外にする）。
 *   ★ エステ魂は【14日分の丸ごと上書き】。項目が欠けたまま投げると、その日を消してしまう。
 *   ★ ここでは「cast_id / brws_shop_id / ctk がある」「period が1つ以上ある」だけ見る。
 *     日数の検査は parse 側（checkEsutamaWorkPage）が済ませている。
 */
export function buildEsutamaWorkSaveRequest(cookie: string, castId: string, fields: Array<[string, string]>): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま保存しない');
  const has = (k: string) => fields.some(([n, v]) => n === k && v.length > 0);
  if (!has('cast_id') || !has('brws_shop_id') || !has('ctk')) {
    throw new Error('保存に要る hidden（cast_id / brws_shop_id / ctk）が欠けています');
  }
  const cast = fields.find(([n]) => n === 'cast_id')?.[1] ?? '';
  if (cast !== castId) throw new Error('読んだ出勤表の cast_id と送り先が一致しません（' + cast + ' / ' + castId + '）');
  if (!fields.some(([n]) => /^column\[\d{4}-\d{2}-\d{2}\]\[period\]\[/.test(n))) {
    throw new Error('period が1つも無い出勤表は送らない');
  }
  return {
    method: 'POST',
    url: ESUTAMA_WORK_SAVE_URL,
    headers: ajaxHeaders(cookie, esutamaWorkPageUrl(castId)),
    body: encodePayload(fields),
  };
}

/** #csrf_footer の形（英数32文字）。★ 実測。違う形が来たら「取れていない」扱い */
/**
 * セラピスト設定の一覧を読む GET（第229便）。★ 読むだけ。
 * ★ ここで ctk（#csrf_footer）と、各人の表示／非表示を拾う。
 */
export function buildEsutamaCastListRequest(cookie: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いままセラピスト設定を読みに行かない');
  return { method: 'GET', url: ESUTAMA_CAST_LIST_URL, headers: { ...baseHeaders(), referer: ESUTAMA_ADMIN_URL, cookie } };
}

/**
 * ★★★ 非表示にする POST（第229便）。★ **相手を書き換える。**
 *   ★ 実物（my_post.js の .send-easy_confirm_post）と同じ形:
 *       POST /admin_post/cast_disabled   { post_data: <cast_id>, ctk: <#csrf_footer> }
 *   ★ jQuery の $.ajax と同じ x-www-form-urlencoded ＋ X-Requested-With。
 * ★★ 相手は【1人だけ】。★ 番号の形をここで確かめる（他人の番号を組み立てない）。
 */
export function buildEsutamaCastDisableRequest(cookie: string, castId: string, ctk: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま非表示にしない');
  if (!/^\d{1,12}$/.test(castId)) throw new Error('エステ魂の cast_id の形が違います（' + castId + '）');
  if (!ctk) throw new Error('ctk が無いまま非表示にしない');
  return {
    method: 'POST',
    url: ESUTAMA_CAST_DISABLE_URL,
    headers: ajaxHeaders(cookie, ESUTAMA_CAST_LIST_URL),
    body: encodePayload([['post_data', castId], ['ctk', ctk]]),
  };
}

// ───────── ★★★ セラピストの新規登録（第231便・2026-09-09）─────────
//
// ★★★ 段は2つ:  ① 追加フォームを **読む**（GET）  → ② 読んだ形に値を差し込んで **送る**（POST）
//   ★ 65部品の形をこちらで決め打ちしない（カッキーさん決定・2026-09-09）。
//   ★ 出勤・新着情報でもう使っている作法と同じ。★ 相手が項目を増やしても壊れない。

/** 追加フォームを読む GET。★ 読むだけ。★ ここで ctk と「実在する特徴タグ」を拾う */
export function buildEsutamaCastFormRequest(cookie: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま追加フォームを読みに行かない');
  return { method: 'GET', url: ESUTAMA_CAST_EDIT_URL, headers: { ...baseHeaders(), referer: ESUTAMA_CAST_LIST_URL, cookie } };
}

/** 送る値。★ 名前だけが必須。★ 空のものは【読んだフォームのまま】にする（＝触らない） */
export type EsutamaCastCreateValues = {
  /** ★ 全角10文字以内（相手の maxlength=10） */
  name: string;
  /** ★ 特徴タグ。★ 1つ以上4つ以内。★ 相手の画面に実在する番号だけ */
  typeIds: number[];
  age?: string | null;
  tall?: string | null;
  /** ★★ B が空だと **公開ページに出ない**（相手の画面の注記・2026-09-09 実測） */
  sizeB?: string | null;
  sizeW?: string | null;
  sizeH?: string | null;
  /** '秘密' または A〜L */
  sizeCup?: string | null;
  /** '0'未選択 / '2'スレンダー / '3'普通 / '4'グラマー / '5'少しぽっちゃり / '6'ぽっちゃり */
  bodyStyle?: string | null;
};

/**
 * ★ 差し替える欄（★ ここに無い欄は【読んだフォームのまま】返す）:
 *   name / age / tall / size_b / size_w / size_h / size_cup / body_style / type[]
 */

/**
 * ★★★ セラピストを1人 追加する POST。★ **相手に人を増やす。**
 *
 * @param form parseEsutamaCastForm が読んだもの（★ set_up_limit と file は既に外れている）
 *
 * ★★★ 止める条件（★ 迷ったら送らない）:
 *   ・名前が空 ／ 10文字を超える
 *   ・特徴タグが0個 ／ 4個を超える ／ **相手の画面に無い番号が混じっている**
 *   ・年齢・身長・3サイズが数字でない
 *   ・読んだフォームに ctk が無い
 *   ・★★★ **`set_up_limit` が混じっている**（「保存と同時に上位表示する」＝店舗様の残り回数を使う）
 *   ・cast_id が '0'（新規）でない ★ 既存の人を上書きしに行かないための止め
 */
export function buildEsutamaCastCreateRequest(
  cookie: string,
  form: { fields: Array<{ name: string; value: string }>; typeIds: string[]; castIdHidden: string | null },
  v: EsutamaCastCreateValues,
): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま登録しない');

  const name = String(v.name ?? '').trim();
  if (!name) throw new Error('名前が空のまま登録しない');
  if ([...name].length > 10) throw new Error('エステ魂の名前は10文字以内です（' + [...name].length + '文字）');

  const ids = Array.isArray(v.typeIds) ? v.typeIds.map((x) => String(x)) : [];
  if (ids.length === 0) throw new Error('特徴タグが1つも無いまま登録しない（相手の必須項目）');
  if (ids.length > 4) throw new Error('エステ魂の特徴タグは4つまでです（' + ids.length + '個）');
  // ★★★ 相手の画面に無い番号は送らない。★ 番号は通し番号ではない（第230便で踏んだ）
  const unknown = ids.filter((id) => !form.typeIds.includes(id));
  if (unknown.length > 0) throw new Error('エステ魂の画面に無い特徴タグの番号です（' + unknown.join(',') + '）');

  const num = (label: string, val: string | null | undefined, max: number): string | null => {
    if (val === null || val === undefined || val === '') return null;
    const t = String(val).trim();
    if (!new RegExp('^\\d{1,' + max + '}$').test(t)) throw new Error(label + 'は数字' + max + 'けたまでです（' + t + '）');
    return t;
  };
  const ov: Record<string, string> = { name };
  const age = num('年齢', v.age, 2); if (age !== null) ov.age = age;
  const tall = num('身長', v.tall, 3); if (tall !== null) ov.tall = tall;
  const b = num('バスト', v.sizeB, 3); if (b !== null) ov.size_b = b;
  const w = num('ウエスト', v.sizeW, 3); if (w !== null) ov.size_w = w;
  const h = num('ヒップ', v.sizeH, 3); if (h !== null) ov.size_h = h;
  if (v.sizeCup) ov.size_cup = String(v.sizeCup);
  if (v.bodyStyle) ov.body_style = String(v.bodyStyle);
  const fields = form.fields ?? [];
  if (fields.some((f) => f.name === 'set_up_limit')) {
    throw new Error('set_up_limit（保存と同時に上位表示する）が混じっています。★ 店舗様の残り回数を使うので送りません');
  }
  if (!fields.some((f) => f.name === 'ctk' && f.value)) throw new Error('ctk が無いまま登録しない');
  const castId = form.castIdHidden;
  if (castId !== null && castId !== '0') {
    throw new Error('新規の追加フォームではありません（cast_id=' + castId + '）。★ 既存の人を上書きしない');
  }

  const out: Array<[string, string]> = [];
  let typeDone = false;
  const used = new Set<string>();
  for (const f of fields) {
    if (f.name === 'type[]') {
      if (!typeDone) { typeDone = true; for (const id of ids) out.push(['type[]', id]); }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(ov, f.name)) { out.push([f.name, ov[f.name]]); used.add(f.name); continue; }
    out.push([f.name, f.value]);
  }
  // ★ 読んだフォームに無かった欄は、あとから足す（★ 黙って落とさない）
  for (const k of Object.keys(ov)) if (!used.has(k)) out.push([k, ov[k]]);
  if (!typeDone) for (const id of ids) out.push(['type[]', id]);

  return {
    method: 'POST',
    url: ESUTAMA_CAST_EDIT_URL,
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: ESUTAMA_CAST_EDIT_URL,
      origin: ESUTAMA_ORIGIN,
      cookie,
    },
    body: encodePayload(out),
  };
}

/** 魂セラピスト一覧を読む GET。★ 読むだけ。★ ここで ctk と「利用中の人」を拾う */
export function buildEsutamaTherapistAdminRequest(cookie: string): RelayRequest {
  return { method: 'GET', url: ESUTAMA_THERAPIST_ADMIN_URL, headers: { ...baseHeaders(), ...(cookie ? { cookie } : {}) } };
}

/**
 * ★★ 代理ログイン用トークンを発行させる POST（JSON が返る）。
 * ★ cast_id は数字だけ。★ 他人の番号を組み立てないよう、ここで形を確かめる。
 */
export function buildEsutamaCreateShopTokenRequest(cookie: string, castId: string, ctk: string): RelayRequest {
  if (!/^\d{1,12}$/.test(castId)) throw new Error('エステ魂の cast_id の形が違います（' + castId + '）');
  if (!isCsrfShape(ctk)) throw new Error('エステ魂の ctk の形が違います');
  return {
    method: 'POST',
    url: ESUTAMA_CREATE_SHOP_TOKEN_URL,
    headers: ajaxHeaders(cookie, ESUTAMA_THERAPIST_ADMIN_URL),
    body: encodePayload([['cast_id', castId], ['ctk', ctk]]),
  };
}

/**
 * ★★★ 代理ログインへ入る GET。★ ここから先は【本人のセッション】。
 * ★ token は保存しない。★ この1回に使うだけ。
 */
export function buildEsutamaProxyLoginRequest(cookie: string, token: string): RelayRequest {
  return {
    method: 'GET',
    url: esutamaProxyLoginUrl(token),
    headers: { ...baseHeaders(), ...(cookie ? { cookie } : {}), referer: ESUTAMA_THERAPIST_ADMIN_URL },
  };
}

/** 写メ日記の投稿ページを読む GET。★ ctk を拾うためだけ。★ 何も書き換えない */
export function buildEsutamaDiaryPageRequest(cookie: string): RelayRequest {
  return { method: 'GET', url: ESUTAMA_DIARY_POST_URL, headers: { ...baseHeaders(), ...(cookie ? { cookie } : {}) } };
}

/**
 * ★★★ 写メ日記を投稿する POST。★ このファイルで【日記を書き込む唯一の宛先】。
 * ★ enctype は application/x-www-form-urlencoded（実測）。★ multipart ではない。
 * ★★ 項目は呼び出し側（esutamaDiaryPost.buildEsutamaDiaryPost）が組み立てる。
 */
export function buildEsutamaDiaryPostRequest(cookie: string, fields: Array<[string, string]>): RelayRequest {
  return {
    method: 'POST',
    url: ESUTAMA_DIARY_POST_URL,
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
      referer: ESUTAMA_DIARY_POST_URL,
      origin: ESUTAMA_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: encodePayload(fields),
  };
}

/** ★★★ 代理ログインを終える GET。★ 送り終えたら必ず通る。★ 本人のセッションを残さない */
export function buildEsutamaEndProxyRequest(cookie: string): RelayRequest {
  return { method: 'GET', url: ESUTAMA_END_PROXY_URL, headers: { ...baseHeaders(), ...(cookie ? { cookie } : {}) } };
}

export function isCsrfShape(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9]{16,64}$/.test(v);
}

// ────────────────────── 即セラ（第143便・2026-09-04） ──────────────────────
//
// ★★★ 2026-09-04 20:00 に実物で確かめた（ラビリンス様・サラさんの許可のもと・GETと静的JSのみ）
//   GET  /tamathera/sokuthera/            … 「現在のステータス ON/OFF」と呼びかけが読める
//   POST /tamathera/sokuthera/ajax_start  … ONにする（★ 本文は message=… だけ）
//   ★★ ctk は要らない（main.min.js に "ctk" が1文字も無い）
//   ★★★ ajax_stop は【使わない】。★ 60分で相手が勝手にOFFにする。
//     ★ 業界の風習として、誰も手動でOFFを打たない（★ 流しっぱなしが好まれる）。
//     → **このファイルに ajax_stop の宛先を置かない。** ★ 置くと、いつか誰かが使う。

/** 即セラの設定ページ。★ 状態と呼びかけを読む。★ 読み返しにも同じURLを使う */
export const ESUTAMA_SOKUSERA_PAGE_URL = 'https://estama.jp/tamathera/sokuthera/';
/** ★★ 即セラをONにする唯一の宛先。★ OFFの宛先はここに置かない */
export const ESUTAMA_SOKUSERA_START_URL = 'https://estama.jp/tamathera/sokuthera/ajax_start';

/** 即セラの設定ページを読む GET。★ 状態・呼びかけ・本人確認をここで行う */
export function buildEsutamaSokuseraPageRequest(cookie: string): RelayRequest {
  return {
    method: 'GET',
    url: ESUTAMA_SOKUSERA_PAGE_URL,
    headers: { ...baseHeaders(), ...(cookie ? { cookie } : {}) },
  };
}

/**
 * ★★★ 即セラをONにする POST。
 * ★ 本文は message だけ（実測）。★ 呼びかけは**読んだ値をそのまま**渡すこと。
 *   ★★ 空で送ると本人の呼びかけが【消える】（2026-09-04 に事故で確認）。
 *   ★ 判断は esutamaSokuseraParse.decideSokuseraStart が持つ。★ ここは組み立てるだけ。
 *
 * ★★★ ヘッダは【必ず ajaxHeaders】。★ 第144便（2026-09-04 21:04）の実測:
 *   ふつうのページ取得と同じヘッダで送ったら **403** で断られた。
 *   ★ 相手の ajax_* の口は「ブラウザのJSから呼ばれた形」でないと通さない。
 *   → ★★ url に 'ajax' が入る口は、ここでヘッダを組み間違えないこと（自己点検あり）。
 */
export function buildEsutamaSokuseraStartRequest(cookie: string, body: string): RelayRequest {
  return {
    method: 'POST',
    url: ESUTAMA_SOKUSERA_START_URL,
    headers: ajaxHeaders(cookie, ESUTAMA_SOKUSERA_PAGE_URL),
    body,
  };
}
