// ★ 第1557便（2026-10-18・カッキーさん・ラビリンス様の依頼）: コネックエフのセラピストの並びを、駅ちか・エステ魂へ送る。★ 純粋関数だけ。
//
// ★★ 調べたこと（2026-10-18・ラビリンス様の管理画面で実測。並びは変えずに保存して確かめた）
//   駅ちか   : 女の子一覧（/admin/girls/）のフォーム #form-girls-list を POST。
//              fuel_csrf_token ＋ girls_id[<番号>]=<番号> を【上から順に】＋ girls_list_btn=並び替え更新。確認ダイアログは無い。
//   エステ魂 : セラピストの表示順（/admin/cast_sort/）の「保存する」＝ POST /admin_post/cast_sort_edit。
//              cast_id[]=<番号> と cast_sort[]=1,2,3… を【上から順に】＋ ctk（#csrf_footer）。画面は FormData（ここでは同じ項目を urlencoded で送る）。
//
// ★★ 並べ方（planSiteOrder）
//   ・want … コネックエフの並び（上から順の、そのサイトの番号）。★ 呼び出し側が therapist_media_ids で引いて渡す
//   ・サイトの一覧にある番号だけを want の順に上へ。★ サイトにしかいない方は【今の順のまま後ろ】に残す
//   ・サイトに無い番号（want にだけある）は無視する（★ こちらから人を増やさない）
import { encodePayload } from './ekichikaWorkParse';
import { RELAY_USER_AGENT } from './relayUserAgent';
import { readEsutamaCsrf } from './esutamaParse';

export const ESUTAMA_CAST_SORT_URL = 'https://estama.jp/admin/cast_sort/';
export const ESUTAMA_CAST_SORT_POST_URL = 'https://estama.jp/admin_post/cast_sort_edit';
export const EKICHIKA_SORT_BUTTON_VALUE = '並び替え更新';

/** サイトの今の並び（site）を、コネックエフの並び（want）に合わせた並びを返す */
export function planSiteOrder(site: readonly string[], want: readonly string[]): { order: string[]; changed: boolean; matched: number } {
  const siteSet = new Set(site);
  const seen = new Set<string>();
  const head: string[] = [];
  for (const id of want) {
    const k = String(id);
    if (!siteSet.has(k) || seen.has(k)) continue;
    seen.add(k);
    head.push(k);
  }
  const tail = site.filter((id) => !seen.has(id));
  const order = [...head, ...tail];
  const changed = order.length !== site.length || order.some((id, i) => id !== site[i]);
  return { order, changed, matched: head.length };
}

/** 並び（a）が want の順に揃っているか（★ サイトにいる want の方の前後関係だけを見る） */
export function orderFollowsWant(a: readonly string[], want: readonly string[]): boolean {
  const p = planSiteOrder(a, want);
  return !p.changed;
}

// ────────── 駅ちか ──────────

/** 女の子一覧の並び替え更新の本文（★ フォームの項目と同じ並び） */
export function buildEkichikaSortBody(csrf: string, order: readonly string[]): string {
  if (!csrf) throw new Error('fuel_csrf_token が無いまま並び替えを送らない');
  if (order.length === 0 || order.some((id) => !/^\d{1,12}$/.test(id))) throw new Error('女の子の番号の形が違うまま並び替えを送らない');
  // ★ ブラウザの送信と同じ項目（一括操作の選択 girls_list_action は空のまま＝削除は選ばない）
  const fields: Array<[string, string]> = [['fuel_csrf_token', csrf], ['girls_list_btn', EKICHIKA_SORT_BUTTON_VALUE], ['girls_list_action', '']];
  for (const id of order) fields.push(['girls_id[' + id + ']', id]);
  return encodePayload(fields);
}

// ────────── エステ魂 ──────────

export type EsutamaCastSortPage = { castIds: string[]; ctk: string | null; problems: string[] };

/** セラピストの表示順の画面を読む（cast_id[] の並び と ctk） */
export function parseEsutamaCastSort(html: string): EsutamaCastSortPage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const castIds: string[] = [];
  const re = /<input\b[^>]*\bname=["']cast_id\[\]["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const v = /\bvalue=["'](\d{1,12})["']/i.exec(m[0])?.[1];
    if (v) castIds.push(v);
    else problems.push('cast_id[] の値が読めない行がある');
  }
  if (castIds.length === 0) problems.push('表示順の一覧（cast_id[]）が見つからない');
  if (new Set(castIds).size !== castIds.length) problems.push('同じ番号が一覧に2回出てくる');
  const ctk = readEsutamaCsrf(src);
  if (!ctk) problems.push('ctk（#csrf_footer）が見つからない');
  return { castIds, ctk, problems };
}

type Req = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: string };

/** 表示順の画面を読む GET。★ 読むだけ */
export function buildEsutamaCastSortPageRequest(cookie: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま表示順の画面を読みに行かない');
  return {
    method: 'GET',
    url: ESUTAMA_CAST_SORT_URL,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      referer: 'https://estama.jp/admin/',
      cookie,
    },
    body: '',
  };
}

/** ★★ 表示順を保存する POST（相手の並びを書き換える） */
export function buildEsutamaCastSortSaveRequest(cookie: string, ctk: string, order: readonly string[]): Req {
  if (!cookie) throw new Error('Cookie が無いまま表示順を保存しない');
  if (!/^[A-Za-z0-9]{16,64}$/.test(ctk)) throw new Error('ctk の形が違うまま表示順を保存しない');
  if (order.length === 0 || order.some((id) => !/^\d{1,12}$/.test(id))) throw new Error('セラピストの番号の形が違うまま表示順を保存しない');
  const fields: Array<[string, string]> = [];
  order.forEach((id, i) => { fields.push(['cast_id[]', id]); fields.push(['cast_sort[]', String(i + 1)]); });
  fields.push(['ctk', ctk]);
  return {
    method: 'POST',
    url: ESUTAMA_CAST_SORT_POST_URL,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: ESUTAMA_CAST_SORT_URL,
      origin: 'https://estama.jp',
      cookie,
    },
    body: encodePayload(fields),
  };
}
