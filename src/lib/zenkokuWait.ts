// 全国エステランキングの「待機中」（第1810便・2026-11-09・カッキーさん「A」）。★ 純粋関数だけ。
//
// ★★ 決まり（A＝ベンリーの「自動待機」と同じ）: その日の出勤時間に入った方を【全員】待機中にする。
//   ★ 外すのは打たない（出勤時間が終わると、相手の画面からボタンごと消える）。
//
// ★★★ 実測（2026-11-09 10:2x・オイルクエスト様・しおんさんで許可を得て1回ずつ押した）:
//   画面: /shop/schedule/<営業日>/ の行 <tr data-girl-id="<gid>">。出勤時間に入った方の行にだけボタンが出る
//     待機していない: <button class="btn schedule-waiting w-start">待機開始</button>
//     待機中:         <button class="btn schedule-waiting w-cancel">待機終了</button>（＋ <span class="badge schedule-status-4">待機中</span>）
//   送る: POST /shop/schedule/wait/<gid>/  id=<その日の出勤の行の番号>&is_waiting=0 → 待機開始（★ 名前と逆。1 は待機終了）
//   応答: {"error":0,"gid":…,"elm":"<button class=\"btn schedule-waiting w-cancel\" …>"}（★ 開始できたら w-cancel のボタンが返る）
//   ★ CSRF のトークンは無かった（画面にも要求にも）

import { RELAY_USER_AGENT } from './relayUserAgent';
import { ZENKOKU_ORIGIN, zenkokuDayUrl, type RelayRequest } from './zenkokuRequests';

export type ZenkokuWaitRow = { gid: string; rowId: string; name: string; waiting: boolean };

/** 出勤時間に入っている方（ボタンがある行）と、いま待機中か */
export function parseZenkokuWaitRows(html: string): { rows: ZenkokuWaitRow[]; formSeen: boolean } {
  const src = String(html ?? '');
  const formSeen = /\[start_work\]/.test(src);
  const rows: ZenkokuWaitRow[] = [];
  const re = /<tr\b[^>]*\bdata-girl-id=["'](\d{1,12})["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const gid = m[1];
    const body = m[2];
    const btn = /<button\b[^>]*class=["'][^"']*\bschedule-waiting\b([^"']*)["'][^>]*>/i.exec(body);
    if (!btn) continue;
    const cls = btn[1];
    const waiting = /\bw-cancel\b/.test(cls);
    if (!waiting && !/\bw-start\b/.test(cls)) continue;
    const idm = new RegExp('name=["\']' + gid + '\\[id\\]["\'][^>]*value=["\'](\\d+)["\']|value=["\'](\\d+)["\'][^>]*name=["\']' + gid + '\\[id\\]["\']', 'i').exec(body);
    const rowId = idm ? (idm[1] ?? idm[2]) : '';
    if (!rowId || rowId === '0') continue;
    const name = (/<span\b[^>]*>([^<]+)<\/span>/i.exec(body)?.[1] ?? '').trim();
    rows.push({ gid, rowId, name, waiting });
  }
  return { rows, formSeen };
}

export function buildZenkokuWaitReadRequest(cookie: string, dateISO: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return {
    method: 'GET', url: zenkokuDayUrl(dateISO), body: '',
    headers: { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer: ZENKOKU_ORIGIN + '/shop/', cookie },
  };
}

/** ★★ 待機開始（is_waiting=0）。★ 待機終了は打たない */
export function buildZenkokuWaitStartRequest(cookie: string, dateISO: string, gid: string, rowId: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま押さない');
  if (!/^\d{1,12}$/.test(gid) || !/^\d{1,12}$/.test(rowId)) throw new Error('番号の形が違うまま押さない');
  return {
    method: 'POST',
    url: ZENKOKU_ORIGIN + '/shop/schedule/wait/' + gid + '/',
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: ZENKOKU_ORIGIN,
      referer: zenkokuDayUrl(dateISO),
      cookie,
    },
    body: 'id=' + encodeURIComponent(rowId) + '&is_waiting=0',
  };
}

/** 応答で待機開始できたか（error が 0 で、返ってきたボタンが w-cancel） */
export function zenkokuWaitStarted(body: string): boolean {
  try {
    const j = JSON.parse(String(body ?? '')) as { error?: unknown; elm?: unknown };
    return Number(j.error) === 0 && /w-cancel/.test(String(j.elm ?? ''));
  } catch {
    return false;
  }
}
