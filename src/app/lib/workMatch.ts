// フクエスワーク「求職マッチング」の共有定数・型（非serverモジュール）。
// サーバーアクション（app/actions/workMatch.ts＝'use server'）は async 関数以外を export できないため、
// フォーム（client）とアクション（server）で共用する固定値・型はここに集約する（lib/jobs.ts と同方針）。

import { AREA_ORDER, ALL_AREA } from '@/app/lib/areas';

// 経験の有無。
export const WORK_EXPERIENCE_VALUES = ['none', 'has'] as const;
export type WorkExperience = (typeof WORK_EXPERIENCE_VALUES)[number];
export const EXPERIENCE_LABEL: Record<WorkExperience, string> = { none: '未経験', has: '経験あり' };

// 送迎の希望。
export const WORK_PICKUP_VALUES = ['want', 'no', 'either'] as const;
export type WorkPickup = (typeof WORK_PICKUP_VALUES)[number];
export const PICKUP_LABEL: Record<WorkPickup, string> = {
  want: '送迎あり希望',
  no: '送迎は不要',
  either: 'どちらでも',
};

// 希望エリアの選択肢（AREA_ORDER から「福岡全域」を除いた実エリア。全域は“こだわらない”＝空配列で表現）。
export const WORK_AREA_CHOICES: readonly string[] = AREA_ORDER.filter((a) => a !== ALL_AREA);

// 文字数上限（フォームの maxLength とサーバー検証で共用）。
export const MAX_DISPLAY_NAME_LEN = 40;
export const MAX_CURRENT_JOB_LEN = 60;
export const MAX_CONTACT_LEN = 200;
export const MAX_NOTE_LEN = 1000;

// 公開フォーム → サーバーアクションの入力。
export type WorkMatchInput = {
  displayName: string;
  age: string | number;
  experience: string;
  currentJob: string;
  desiredAreas: string[];
  wantsPickup: string;
  desiredFeatures: string[];
  // 連絡先（ご紹介先のお店からの連絡に使う。最低どれか1つ必須）。
  contactPhone: string;
  contactLine: string;
  contactEmail: string;
  // 運営からのおすすめ店舗ピックアップ（メール案内）希望。true の場合 contactEmail 必須。
  wantsAdminPickup: boolean;
  note: string;
  website: string; // honeypot（人間は空のまま送る）
};

// 店舗ごとのフクエスワーク応募状況（fetchJobApplicationStats が返す行）。
// 掲載中（jobs_enabled）の店は応募0件でも必ず1行出す（“応募が少ない店”の把握が目的のため）。
export type SalonAppStat = {
  salonId: number;
  salonName: string;
  area: string;
  isHidden: boolean;      // salons.is_hidden（非表示中の掲載店の応募も見えるように含める）
  activeJobs: number;     // 公開中（is_active）の求人本数
  total: number;          // 応募件数（全期間）
  last30d: number;        // 応募件数（直近30日）
  newCount: number;       // 未対応（status='new'）の応募件数
  latestAt: string | null; // 最新応募日時（ISO・応募0件なら null）
};

// 運営の斡旋支援（suggestStoresForEntry）が返す候補店舗。
export type SuggestedStore = {
  salonId: number;
  salonName: string;
  area: string;
  jobId: number;
  jobTitle: string;
  appCount: number; // これまでの応募件数（少ないほど優先）
  overlap: number; // 希望条件との一致数（多いほど良い）
  matchedFeatures: string[]; // 一致した希望条件のラベル
};
