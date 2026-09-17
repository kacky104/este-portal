// コネックエフの DB 側のロック（第407便・2026-09-17）の文言。★ 純関数だけ。
// ★ DB のトリガー（supabase/migrations/20260917_conecf_mypage_lock_db.sql）は 'CONECF_LOCKED: …' で断る。
// ★ /mypage の古いタブから保存したときに、「保存に失敗しました」ではなく理由を出すために使う。

export const CONECF_LOCKED_MARK = 'CONECF_LOCKED';

/** DB のロックで断られたなら、画面に出す文を返す。★ それ以外のエラーは null */
export function conecfLockMessage(err: { message?: string | null } | string | null | undefined): string | null {
  const msg = typeof err === 'string' ? err : err?.message ?? '';
  const i = msg.indexOf(CONECF_LOCKED_MARK);
  if (i < 0) return null;
  const rest = msg.slice(i + CONECF_LOCKED_MARK.length).replace(/^[:：\s]+/, '').trim();
  return (rest || 'この店舗はコネックエフで編集します') + '（画面が古い場合は再読み込みしてください）';
}
