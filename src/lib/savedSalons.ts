// お気に入り（サロン保存）機能のクライアント専用ユーティリティ。
// ログイン不要・端末ごと。localStorage に保存する簡易版で、DB は使わない。
// 将来の閲覧者登録ページで本実装予定。

export type SavedSalon = { id: number; name: string };

const KEY = 'saved_salons';

// 状態変更時に発火するカスタムイベント名。同一タブ内のライブ更新に使う
// （別タブは 'storage' イベントで購読する）。
export const SAVED_SALONS_EVENT = 'saved-salons-changed';

/** 保存済みサロンの一覧を取得（壊れたデータは除外）。 */
export function getSavedSalons(): SavedSalon[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SavedSalon =>
        x != null && typeof x.id === 'number' && typeof x.name === 'string'
    );
  } catch {
    return [];
  }
}

/** 指定サロンが保存済みかどうか。 */
export function isSaved(id: number): boolean {
  if (typeof window === 'undefined') return false;
  return getSavedSalons().some(s => s.id === id);
}

/** 保存件数。 */
export function getSavedCount(): number {
  return getSavedSalons().length;
}

function persist(list: SavedSalon[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 容量超過などは黙って無視（状態は呼び出し側に返す）。
  }
  window.dispatchEvent(new Event(SAVED_SALONS_EVENT));
}

/**
 * 保存の追加・削除をトグルする。
 * 保存後、現在保存中かどうかの boolean を返す。
 */
export function toggleSaved(salon: SavedSalon): boolean {
  if (typeof window === 'undefined') return false;
  const list = getSavedSalons();
  const idx = list.findIndex(s => s.id === salon.id);
  let nowSaved: boolean;
  if (idx >= 0) {
    list.splice(idx, 1);
    nowSaved = false;
  } else {
    list.push({ id: salon.id, name: salon.name });
    nowSaved = true;
  }
  persist(list);
  return nowSaved;
}

/** 指定サロンを保存から削除する（ヘッダーのドロップダウン用）。 */
export function removeSaved(id: number): void {
  if (typeof window === 'undefined') return;
  persist(getSavedSalons().filter(s => s.id !== id));
}
