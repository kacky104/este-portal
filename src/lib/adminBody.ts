// 運営の口（/api/admin/...）が受け取る値の読み取り（第113便・2026-09-03）。★ 純粋関数。
//
// ★★★ なぜ要るか —— PowerShell から JSON を渡せない（2026-09-03 実測）
//   `-d '{"salonId":12}'` を PowerShell → ssh.exe → bash → curl と渡すと、
//   ★ PowerShell 5.1 がネイティブコマンドへ渡すときに **JSON の " を落とす**。
//   ★ bash には {salonId:12} が届き、`invalid json` になる。
//   ★ エスケープを足しても4段のどこかで必ず壊れる。★ 逃がし方で解決しようとしない。
//
// ★★ 第109便からの work-flow の口は `-d salonId=6 -d provider=esutama` の
//   **フォーム形式**で、これは実績がある。★ そちらに揃える。
//   ★ JSON も引き続き受ける（他から叩くときに使える）。★ 受ける側を広げるほうが安全。
//
// ★ クエリ文字列（?salonId=12）も受ける。★ 3つのうちどれで来ても同じ形にして返す。

/**
 * 本文とクエリ文字列から、名前と値の組を作る。
 * ★ 読めなかったときだけ null。★ 「空だった」と「読めなかった」を混ぜない（引き継ぎメモ 3-5）。
 * ★ 優先順は クエリ < 本文（本文のほうが後から上書きする）。
 */
export function parseAdminBody(rawBody: string, url: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};

  // ★ クエリ文字列。★ URL が壊れていても落ちない
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => { out[k] = v; });
  } catch {
    // ★ 読めなければクエリは無かったものとして進む（本文だけで足りることがある）
  }

  const t = String(rawBody ?? '').trim();
  if (t.length === 0) return out;

  // ★ JSON は '{' か '[' で始まる。★ それ以外はフォーム形式として読む
  //   ★★ '[' も見る（第113便の点検で見つけた）。★ 見ないと '[1,2]' が
  //     フォーム形式として読まれ、{'[1,2]': ''} という無意味な組が通ってしまう。
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const o = JSON.parse(t) as unknown;
      if (o === null || typeof o !== 'object' || Array.isArray(o)) return null;
      Object.assign(out, o as Record<string, unknown>);
      return out;
    } catch {
      // ★★ '{' で始まっているのに読めない＝JSONのつもりで壊れている。
      //   ★ フォーム形式として読み直さない（黙って別の意味に取らない）
      return null;
    }
  }

  new URLSearchParams(t).forEach((v, k) => { out[k] = v; });
  return out;
}

/**
 * ★★ フォーム形式では値が文字列で来る（apply=true が 'true'）。
 *   ★ JSON では真偽値で来る。★ どちらでも同じに読む。
 * ★ はっきり「はい」と書いてあるときだけ true。★ 分からない値は false（安全側）。
 */
export function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

/**
 * ★ 数として読む。★ 読めなければ null（0 と混ぜない）。
 *   ★ フォーム形式の '12' も JSON の 12 も同じに読む。
 */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
