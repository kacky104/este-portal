// お気に入り（サロン保存）の公開API。
// 実体はハイブリッド保存ストア（saveStore）。未ログイン=localStorage / ログイン中=DB を内部で切替。
// 既存の呼び出し（SaveButton / /saved / ヘッダーバッジ）は変更不要。
import {
  getSavedSalons as _getSavedSalons,
  isSalonSaved,
  salonCount,
  toggleSalon,
  removeSalon,
} from './saveStore';

export type { SavedSalon } from './saveStore';
export { SAVED_SALONS_EVENT } from './saveStore';

export const getSavedSalons = _getSavedSalons;
export const isSaved = isSalonSaved;
export const getSavedCount = salonCount;
export const toggleSaved = toggleSalon;
export const removeSaved = removeSalon;
