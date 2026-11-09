// 駅ちか（駅ちか人気！風俗ランキング）の「店舗メイン／ランキング」の女の子の入れ替え（第1846便・2026-11-09・カッキーさん）。★ 純粋関数だけ。
//
// ★★ ベンリーと同じ使い方: ◯分おきに、決めた組（店舗メイン・ランキングの女の子）を順番に入れ替える
//   オイルクエスト様（枠B＝駅ちか枠2）: 60分おき・(りな・みあ)→(みみ・うる)→(まゆゆ・みかな)
// ★★★ 駅ちかの画面（11/9 21:2x・枠1 博多で読むだけで確かめた）:
//   GET /admin/girls/ の上に2つの枠
//     店舗メイン … <div id="setbox2"> の <input type="hidden" name="main_girl_id" value="<番号>">
//     ランキング … <div id="setbox3"> の <input type="hidden" name="ranking_girl_id" value="<番号>">
//   女の子をドラッグすると assets/js/admin/girls.js が
//     POST /admin/ajaxgirlinforegist/create.json （urlencoded・jQuery の $.ajax）
//       id     … 置く女の子の番号（＝一覧の girls_id・castId）
//       idname … 'setbox2'（店舗メイン）／ 'setbox3'（ランキング）
//       oldid  … いまその枠にいる女の子の番号
//     ★ CSRF のトークンは送っていない
//   ★ 注意書き:「ランキング画像は必ず設定してください」「反映までに2〜3分」。ベンリー:「画像未設定の女性は登録できません」

import { RELAY_USER_AGENT } from './relayUserAgent';

export const EKICHIKA_GIRLS_ADMIN_URL = 'https://ranking-deli.jp/admin/girls/';
export const EKICHIKA_GIRL_REGIST_URL = 'https://ranking-deli.jp/admin/ajaxgirlinforegist/create.json';
export const EKICHIKA_RANKIMG_PAIRS_MAX = 20;
/** ★ 選べる間隔（分）。ベンリーの選択肢に合わせて短すぎるものは置かない */
export const EKICHIKA_RANKIMG_INTERVALS = [30, 60, 90, 120, 180, 240, 360] as const;

export type RankImageTarget = 'main' | 'ranking';
export const RANKIMG_BOX: Record<RankImageTarget, string> = { main: 'setbox2', ranking: 'setbox3' };
export const RANKIMG_INPUT: Record<RankImageTarget, string> = { main: 'main_girl_id', ranking: 'ranking_girl_id' };
export const RANKIMG_LABEL: Record<RankImageTarget, string> = { main: '店舗メイン', ranking: 'ランキング' };

/** 1組（どちらかは空でもよい＝その枠は触らない） */
export type EkichikaRankImagePair = { main: string; ranking: string };

export const normRankName = (s: string) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');

export function normalizeRankImagePairs(v: unknown): EkichikaRankImagePair[] {
  return (Array.isArray(v) ? v : []).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return { main: String(o.main ?? '').trim().slice(0, 40), ranking: String(o.ranking ?? '').trim().slice(0, 40) };
  }).filter((p) => p.main || p.ranking).slice(0, EKICHIKA_RANKIMG_PAIRS_MAX);
}
export function normalizeRankImageInterval(v: unknown): number {
  const n = Number(v);
  return (EKICHIKA_RANKIMG_INTERVALS as readonly number[]).includes(n) ? n : 60;
}

/**
 * ★ いま入れ替えるか。★ 前に受け持った時刻（lastDueAt）から間隔が過ぎていれば入れ替える。
 *   周は5分おきなので、2分半の遊びを持たせる（60分おき＝60〜65分おき にならないように）
 */
export function shouldRotateRankImage(input: { now: Date; intervalMin: number; lastDueAt: string | null; pairCount: number }):
  { post: boolean; reason: string; dueAt: string } {
  const dueAt = input.now.toISOString();
  if (input.pairCount === 0) return { post: false, reason: 'no-pairs', dueAt };
  if (!input.lastDueAt) return { post: true, reason: 'ok', dueAt };
  const last = Date.parse(input.lastDueAt);
  if (!Number.isFinite(last)) return { post: true, reason: 'ok', dueAt };
  if (input.now.getTime() - last < input.intervalMin * 60000 - 150000) return { post: false, reason: 'not-yet', dueAt };
  return { post: true, reason: 'ok', dueAt };
}

/** 次の回の時刻（画面に出すだけ） */
export function nextRankImageAt(lastDueAt: string | null, intervalMin: number): string | null {
  if (!lastDueAt) return null;
  const t = Date.parse(lastDueAt);
  return Number.isFinite(t) ? new Date(t + intervalMin * 60000).toISOString() : null;
}

// ── 画面を読む ──
/** hidden の値（属性の並びに依らない）。★ 無ければ null・空なら '' */
export function readHiddenValue(html: string, name: string): string | null {
  const s = String(html ?? '');
  const re = new RegExp('<input\\b[^>]*\\bname=["\']' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>', 'i');
  const tag = re.exec(s)?.[0];
  if (!tag) return null;
  return (/\bvalue=["']([^"']*)["']/i.exec(tag)?.[1] ?? '').trim();
}
/** いま置かれている女の子の番号（読めなければ null） */
export function readRankImageCurrent(html: string): { main: string | null; ranking: string | null } {
  return { main: readHiddenValue(html, RANKIMG_INPUT.main), ranking: readHiddenValue(html, RANKIMG_INPUT.ranking) };
}
/** 女の子一覧の上の2つの枠があるか（＝この画面で入れ替えられる） */
export function looksLikeRankImagePage(html: string): boolean {
  const s = String(html ?? '');
  return /id=["']setbox2["']/.test(s) && /id=["']setbox3["']/.test(s) && readHiddenValue(s, RANKIMG_INPUT.main) !== null && readHiddenValue(s, RANKIMG_INPUT.ranking) !== null;
}

// ── 要求を組む ──
export function buildRankImageGirlsGet(cookie: string, referer = 'https://ranking-deli.jp/admin'): { method: 'GET'; url: string; headers: Record<string, string>; body: '' } {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return {
    method: 'GET', url: EKICHIKA_GIRLS_ADMIN_URL, body: '',
    headers: { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer, cookie },
  };
}
/** ★★ 入れ替え（相手を書き換える唯一の要求）。画面のドラッグと同じ3項目 */
export function buildRankImageSet(cookie: string, target: RankImageTarget, girlId: string, oldId: string): { method: 'POST'; url: string; headers: Record<string, string>; body: string } {
  if (!cookie) throw new Error('Cookie が無いまま入れ替えない');
  if (!/^\d+$/.test(girlId)) throw new Error('女の子の番号が不正です');
  const parts: Array<[string, string]> = [['id', girlId], ['idname', RANKIMG_BOX[target]], ['oldid', oldId]];
  return {
    method: 'POST', url: EKICHIKA_GIRL_REGIST_URL,
    headers: {
      'user-agent': RELAY_USER_AGENT, accept: 'application/json, text/javascript, */*; q=0.01', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      referer: EKICHIKA_GIRLS_ADMIN_URL, origin: 'https://ranking-deli.jp', cookie,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest',
    },
    body: parts.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'),
  };
}
