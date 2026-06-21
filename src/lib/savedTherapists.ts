// お気に入り（セラピスト保存）機能のクライアント専用ユーティリティ。
// savedSalons と対になるモジュール。ログイン不要・端末ごと・localStorage 保存。

export type SavedTherapist = { id: number; name: string; salonId: number };

const KEY = 'saved_therapists';

// 状態変更時に発火するカスタムイベント名（同一タブ内のライブ更新用）。
export const SAVED_THERAPISTS_EVENT = 'saved-therapists-changed';

/** 保存済みセラピストの一覧を取得（壊れたデータは除外）。 */
export function getSavedTherapists(): SavedTherapist[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SavedTherapist =>
        x != null &&
        typeof x.id === 'number' &&
        typeof x.name === 'string' &&
        typeof x.salonId === 'number'
    );
  } catch {
    return [];
  }
}

/** 指定セラピストが保存済みかどうか。 */
export function isTherapistSaved(id: number): boolean {
  if (typeof window === 'undefined') return false;
  return getSavedTherapists().some(t => t.id === id);
}

/** 保存件数。 */
export function getSavedTherapistCount(): number {
  return getSavedTherapists().length;
}

function persist(list: SavedTherapist[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 容量超過などは黙って無視（状態は呼び出し側に返す）。
  }
  window.dispatchEvent(new Event(SAVED_THERAPISTS_EVENT));
}

/**
 * 保存の追加・削除をトグルする。
 * 保存後、現在保存中かどうかの boolean を返す。
 */
export function toggleTherapist(therapist: SavedTherapist): boolean {
  if (typeof window === 'undefined') return false;
  const list = getSavedTherapists();
  const idx = list.findIndex(t => t.id === therapist.id);
  let nowSaved: boolean;
  if (idx >= 0) {
    list.splice(idx, 1);
    nowSaved = false;
  } else {
    list.push({ id: therapist.id, name: therapist.name, salonId: therapist.salonId });
    nowSaved = true;
  }
  persist(list);
  return nowSaved;
}

/** 指定セラピストを保存から削除する。 */
export function removeTherapist(id: number): void {
  if (typeof window === 'undefined') return;
  persist(getSavedTherapists().filter(t => t.id !== id));
}
