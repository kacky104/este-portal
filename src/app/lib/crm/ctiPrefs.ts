// フクエスCRM 着信ポップ：このブラウザだけの設定（第1686便・2026-10-28）。
// ★ DB には持たない（受付の端末ごとに「音は要らない」「この画面には出さない」を選べるように）。
// ★ 画面の部品（CrmIncomingCalls・設定タブ）からだけ使う。サーバーでは呼ばない。

const K_POP = 'crm_cti_pop';     // '0' = 出さない（既定: 出す）
const K_SOUND = 'crm_cti_sound'; // '0' = 鳴らさない（既定: 鳴らす・カッキーさん決定②）
const K_LAST = 'crm_cti_last_id:'; // + salonId → 最後に見た着信の id

export type CtiPrefs = { pop: boolean; sound: boolean };

function get(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function set(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* 何もしない */ }
}

export function ctiPrefs(): CtiPrefs {
  return { pop: get(K_POP) !== '0', sound: get(K_SOUND) !== '0' };
}
export function setCtiPrefs(p: Partial<CtiPrefs>): void {
  if (p.pop != null) set(K_POP, p.pop ? '1' : '0');
  if (p.sound != null) set(K_SOUND, p.sound ? '1' : '0');
}
export function ctiLastId(salonId: number): number | null {
  const v = Number(get(K_LAST + salonId) ?? '');
  return Number.isInteger(v) && v > 0 ? v : null;
}
export function setCtiLastId(salonId: number, id: number): void {
  const cur = ctiLastId(salonId);
  if (cur == null || id > cur) set(K_LAST + salonId, String(id));
}
