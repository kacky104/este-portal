// 外部APIのエラー本文から、人が読める一行を取り出す（第125便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ なぜ要るか（2026-09-04 朝・実際に30分止まった）
//   紹介文の一括生成が 400 で止まり、返事は「AIの呼び出しに失敗しました（400）」だけだった。
//   ★ Anthropic は【何が悪いか】を本文に書いて返している。★ こちらがそれを捨てていた。
//   ★★ 401/429/500 には専用の文言があるのに、400 だけ理由が消えていた。
//   → 写真のせいか／素材のせいか／残高のせいか、どれも確かめられず推測が続いた。
//
// ★★★ 捨てた理由は「本文にキーが混ざるといけない」だった。★ 心配は正しい。
//   → **消すのではなく、隠して出す。** ★ キーらしき文字列を伏せ字にしてから返す。
//   ★ 「見せない」と「隠して見せる」は違う。★ 前者は原因を追えなくする。

/** 伏せ字にする鍵の形。★ Anthropic（sk-ant-…）・OpenAI（sk-…）・Bearer トークン。 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /(?:api[_-]?key|token|secret)["'\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi,
];

/** 返す長さの上限。★ 運営の口の返事を読みやすく保つ。 */
export const MAX_ERROR_MESSAGE_LEN = 300;

/** 鍵らしき文字列を伏せ字にする。 */
export function maskSecrets(text: string): string {
  let out = String(text ?? '');
  for (const re of SECRET_PATTERNS) out = out.replace(re, '***');
  return out;
}

/**
 * APIのエラー本文（文字列）から message を取り出し、鍵を伏せて返す。
 *
 * ★ 受け取るのは【生の本文】。★ JSON なら error.message / message を拾う。
 * ★ JSON でなければ本文そのものを（短く切って）返す。★ 「読めなかった」を握りつぶさない。
 * ★★ 何も取れなければ null。★ 空文字と null を混ぜない（引き継ぎメモ 3-5）。
 */
export function sanitizeApiErrorMessage(rawBody: unknown): string | null {
  const raw = typeof rawBody === 'string' ? rawBody.trim() : '';
  if (raw.length === 0) return null;

  let picked: string | null = null;
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      const err = o?.error as Record<string, unknown> | undefined;
      const cands = [err?.message, o?.message, err?.type, o?.type];
      for (const c of cands) {
        if (typeof c === 'string' && c.trim().length > 0) { picked = c.trim(); break; }
      }
    } catch {
      // ★ JSON のつもりで壊れている。★ 本文そのものを見せる（黙って捨てない）
    }
  }
  const text = picked ?? raw;
  const masked = maskSecrets(text).replace(/\s+/g, ' ').trim();
  if (masked.length === 0) return null;
  return masked.length > MAX_ERROR_MESSAGE_LEN ? masked.slice(0, MAX_ERROR_MESSAGE_LEN) + '…' : masked;
}
