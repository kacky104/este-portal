// エステラブへ投げる要求の組み立て（第77便・純粋関数）。
//
// ★★★ 中継の作りは駅ちかと同じ（第38便）。
//   [Vercel] 要求を組む（ここ）→ [VPS] 中身を理解せず投げる → [Vercel] 応答を読む
//   ★ VPS 側に新しい実装は要らない。★ ただし **宛先の allowlist に eslove.jp を足す**必要がある
//     （★ カッキーさんの作業。VPS 側にしか無い）。
//
// ★★★ 実測でわかった形（追記48 §258 / 追記53 §286）:
//   ログイン   POST /admin/login        login_id / login_password / savelogin
//   一覧       GET  /admin/shop/therapist
//   出勤       POST /admin/shop/therapist_schedule/daily/edit
//              TherapistSchedules[n][id|shop_id|therapist_id|day|start_time|end_time]
//   ★ hidden の CSRF トークンは見当たらなかった（§262）。★ 「無い」と決めつけず、
//     403 で弾かれたら「フォームを1回GETしてトークンを拾う」段を足す。
//
// ★★★ このファイルは【要求を組むだけ】。通信もDBも触らない。
//   ★ 削除の要求は **作らない**。/admin/shop/therapist/delete/{id} は GETリンクで、
//     組み立てた時点で事故の種になる（追記46 §249）。★ この語をここに置かない。

import { encodePayload } from './ekichikaWorkParse';
import { RELAY_USER_AGENT } from './relayFlow';

export const ESULOVE_ORIGIN = 'https://eslove.jp';
export const ESULOVE_LOGIN_URL = 'https://eslove.jp/admin/login';
/** セラピスト一覧（管理画面）。★ 読むだけ。castId と名前が取れる（第76便） */
export const ESULOVE_THERAPIST_URL = 'https://eslove.jp/admin/shop/therapist';
/** 出勤（日別）の一覧。★ 読むだけ */
export const ESULOVE_WORK_URL = 'https://eslove.jp/admin/shop/therapist_schedule/daily';
/** ★★ 出勤の保存先。**このファイルで唯一、相手を書き換える宛先。** */
export const ESULOVE_WORK_SAVE_URL = 'https://eslove.jp/admin/shop/therapist_schedule/daily/edit';
/** セラピストの登録／更新。★ id 無しが新規、/{castId} が更新 */
export const ESULOVE_THERAPIST_SAVE_URL = 'https://eslove.jp/admin/shop/therapist/edit';

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

/**
 * ログイン。
 *
 * ★★★ savelogin は **送らない**（追記53 §287）。
 *   画面では既定でチェックが付いているが、こちらのセッションを長く生かす意味しかない。
 *   ★ 長く生きるほど、店舗が手で入ったときにぶつかる時間が延びる。
 *   ★ 中継のジョブは1回ずつ完結するので、居座る理由がない。
 *   ★ 「既定だから付けておく」をしないこと。
 */
export function buildEsuloveLoginRequest(cred: { loginId: string; password: string }): RelayRequest {
  if (!cred.loginId || !cred.password) {
    throw new Error('ログインに要る2点（ログインID / パスワード）のどちらかが空');
  }
  // ★ 並びも画面と同じにする（login_id → login_password）
  const body = encodePayload([
    ['login_id', cred.loginId],
    ['login_password', cred.password],
  ]);
  return {
    method: 'POST',
    url: ESULOVE_LOGIN_URL,
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
      referer: ESULOVE_LOGIN_URL,
      origin: ESULOVE_ORIGIN,
    },
    body,
  };
}

/** セラピスト一覧を読む GET。★ 読むだけ。ここまでは何も書き換えない。 */
export function buildEsuloveTherapistListRequest(cookie: string): RelayRequest {
  return {
    method: 'GET',
    url: ESULOVE_THERAPIST_URL,
    headers: { ...baseHeaders(), referer: ESULOVE_LOGIN_URL, cookie },
  };
}

/** 出勤（日別）を読む GET。★ 既存の出勤行のID を拾うために要る。 */
export function buildEsuloveWorkReadRequest(cookie: string, day?: string): RelayRequest {
  // ★ day は YYYYMMDD。★ 形が違うものは付けない（推測でURLを作らない）
  const q = day && /^\d{8}$/.test(day) ? '?day=' + day : '';
  return {
    method: 'GET',
    url: ESULOVE_WORK_URL + q,
    headers: { ...baseHeaders(), referer: ESULOVE_THERAPIST_URL, cookie },
  };
}

/**
 * ★★★ 出勤の保存。**このファイルで唯一、相手を書き換える要求。**
 *
 * @param body esuloveWork.ts の buildEsuloveWorkBody が作ったもの
 *
 * ★★ 中身が空なら投げない（例外にする）。
 *   ★ 空のまま投げると「全部消す」の意味になりかねない。★ 確かめていないことを試さない。
 * ★ 宛先はこちらで組み立てている（駅ちかは「読んだページの form action をそのまま使う」形だった）。
 *   ★ エステラブの action は番号を含まない固定URLだったので、この形でよい（実測・§258）。
 *   ★ もし将来 action に番号が入るようになったら、駅ちかと同じく【読んだ action を使う】へ変えること。
 */
export function buildEsuloveWorkSaveRequest(cookie: string, body: Record<string, string>): RelayRequest {
  const fields = Object.entries(body);
  if (fields.length === 0) {
    throw new Error('送る出勤が0件です（空のまま投げない）');
  }
  return {
    method: 'POST',
    url: ESULOVE_WORK_SAVE_URL,
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
      referer: ESULOVE_WORK_URL,
      origin: ESULOVE_ORIGIN,
      cookie,
    },
    body: encodePayload(fields),
  };
}

/**
 * セラピストの新規登録。★ 送るのは名前と表示設定だけ。
 *
 * ★★ 空で送れる項目を、こちらの推測で埋めない（追記48 §260）。
 *   年齢・身長・入店日などは店舗が入れるもの。★ 特に入店日は【設定後に変更できない】。
 * ★★ 呼ぶのは mediaMatch が 'absent'（向こうに居ない）と答えたときだけ。
 *   ★ 名簿を読まずにこれを呼ぶと、㉟ で見た「黙って2人」がそのまま起きる。
 */
export function buildEsuloveTherapistCreateRequest(
  cookie: string,
  input: { shopId: string; name: string; visible?: boolean },
): RelayRequest {
  const name = input.name.trim();
  if (!name) throw new Error('セラピスト名が空です');
  if (!input.shopId) throw new Error('店舗IDが空です');
  const body = encodePayload([
    ['shop_id', input.shopId],
    // ★ 実測の値: 表示=1 / 非表示=0
    ['status', input.visible === false ? '0' : '1'],
    ['name', name],
  ]);
  return {
    method: 'POST',
    url: ESULOVE_THERAPIST_SAVE_URL,
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
      referer: ESULOVE_THERAPIST_SAVE_URL,
      origin: ESULOVE_ORIGIN,
      cookie,
    },
    body,
  };
}

/**
 * ログインできたかを、応答から見分ける。
 * ★ ログイン画面が返ってきていたら失敗（エステラブは失敗しても200を返す作り）。
 * ★ 見分けがつかないときは null。★ 「たぶん成功」で先へ進めない。
 */
export function judgeEsuloveLogin(html: string): { ok: boolean } | null {
  if (typeof html !== 'string' || html.length === 0) return null;
  const looksLogin = /name=["']login_password["']/.test(html);
  const looksAdmin = /\/admin\/shop\/therapist/.test(html) || /\/admin\/logout/.test(html);
  if (looksLogin && !looksAdmin) return { ok: false };
  if (looksAdmin && !looksLogin) return { ok: true };
  return null;   // ★ 両方あった／どちらも無かった。決めつけない
}
