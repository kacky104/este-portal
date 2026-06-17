// 新人マーク（NEWバッジ）の表示判定。
// is_new_face = true かつ new_face_since から 30 日以内のときだけ true を返す。

const NEW_FACE_WINDOW_DAYS = 30;
const NEW_FACE_WINDOW_MS = NEW_FACE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function isNewFaceActive(
  isNew: boolean | null | undefined,
  since: string | null | undefined
): boolean {
  if (!isNew || !since) return false;
  const sinceTime = new Date(since).getTime();
  if (Number.isNaN(sinceTime)) return false;
  return Date.now() - sinceTime <= NEW_FACE_WINDOW_MS;
}
