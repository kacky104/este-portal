// フクエスワーク（求人サイト）の店舗保存の公開API。
// 実体はハイブリッド保存ストア（saveStore）。未ログイン=localStorage / ログイン中=DB を内部で切替。
// 本体の salon 保存（savedSalons.ts）とは item_type='job_salon' / キー / イベントで完全分離。
export type { SavedJobSalon } from './saveStore';
export {
  SAVED_JOB_SALONS_EVENT,
  getSavedJobSalons,
  isJobSalonSaved,
  toggleJobSalon,
  removeJobSalon,
  jobSalonCount as getJobSavedCount,
} from './saveStore';
