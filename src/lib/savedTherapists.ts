// お気に入り（セラピスト保存）の公開API。
// 実体はハイブリッド保存ストア（saveStore）。未ログイン=localStorage / ログイン中=DB を内部で切替。
// 既存の呼び出し（SaveButton / /saved / ヘッダーバッジ）は変更不要。
import {
  getSavedTherapists as _getSavedTherapists,
  isTherapistSaved,
  therapistCount,
  toggleTherapist as _toggleTherapist,
  removeTherapist as _removeTherapist,
} from './saveStore';

export type { SavedTherapist } from './saveStore';
export { SAVED_THERAPISTS_EVENT } from './saveStore';

export const getSavedTherapists = _getSavedTherapists;
export { isTherapistSaved };
export const getSavedTherapistCount = therapistCount;
export const toggleTherapist = _toggleTherapist;
export const removeTherapist = _removeTherapist;
