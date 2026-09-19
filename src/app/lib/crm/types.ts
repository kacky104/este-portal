// フクエスCRM（有料）で画面とサーバーが共有する型・定数（2026-09-19）。

export const CRM_CATEGORIES = ['general', 'member', 'regular', 'vip', 'ng'] as const;
export type CrmCategory = (typeof CRM_CATEGORIES)[number];

export const CRM_CATEGORY_LABEL: Record<CrmCategory, string> = {
  general: '一般',
  member: '会員',
  regular: '常連',
  vip: 'VIP',
  ng: 'NG',
};

/** 分類バッジの色（Tailwind のクラス） */
export const CRM_CATEGORY_CLASS: Record<CrmCategory, string> = {
  general: 'bg-slate-100 text-slate-600 border-slate-200',
  member: 'bg-sky-50 text-sky-700 border-sky-200',
  regular: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vip: 'bg-amber-50 text-amber-700 border-amber-300',
  ng: 'bg-rose-600 text-white border-rose-600',
};

export function toCrmCategory(v: unknown): CrmCategory {
  return (CRM_CATEGORIES as readonly string[]).includes(String(v)) ? (v as CrmCategory) : 'general';
}

/** 予約から数えた利用状況 */
export type CrmStats = {
  visits: number;       // 利用（キャンセル以外・開始時刻が過ぎたもの）
  upcoming: number;     // これからの予約（キャンセル以外・開始前）
  cancels: number;      // キャンセル（悪質を含む）
  badCancels: number;   // うち悪質
  lastVisitISO: string | null;
};

export type CrmCustomerRow = {
  id: number;
  name: string;
  nameKana: string;
  category: CrmCategory;
  memberNo: string;
  phones: string[];
  cautionMemo: string;
  stats: CrmStats;
};

export type CrmCustomerDetail = CrmCustomerRow & {
  memo: string;
  ngTherapistIds: number[];
  createdAt: string;
};

export type CrmBookingRow = {
  id: string;
  slotStartISO: string;
  slotEndISO: string;
  courseName: string;
  courseMin: number;
  therapistId: number | null;
  therapistName: string;   // フリー客は「フリー」
  status: string;          // new / confirmed / cancelled
  cancelBad: boolean;
  source: string;          // web / manual
  note: string;
  customerName: string;    // 予約に書かれた名前（台帳の名前と違うことがある）
};

export type CrmTherapist = { id: number; name: string; isActive: boolean };

export type CrmAccess =
  | { ok: true; salonId: number; salonName: string; crmUntil: string | null; active: boolean; isAdmin: boolean }
  | { ok: false; error: string; needLogin?: boolean };

// ── 本日スケジュール（CRM版・2026-09-19）────────────────
/** 予約に重ねるお客様の情報（台帳にひも付いている予約だけ） */
export type CrmScheduleCustomer = {
  id: number;
  name: string;
  category: CrmCategory;
  cautionMemo: string;
  ngTherapistIds: number[];
  stats: CrmStats;
};

export type CrmScheduleBooking = {
  id: string;
  therapistId: number | null;   // null＝フリー客
  slotStartISO: string;
  slotEndISO: string;
  courseName: string;
  courseMin: number;
  customerName: string;         // 予約に書かれた名前
  customerTel: string;
  note: string;
  status: string;               // new / confirmed / cancelled
  cancelBad: boolean;
  source: string;               // web / manual
  customer: CrmScheduleCustomer | null;
};

export type CrmScheduleTherapist = {
  id: number;
  name: string;
  profileImageUrl: string | null;
  /** 出勤枠（ISO）。前日の夜跨ぎの尻尾も入る */
  schedules: Array<{ start: string; end: string; startISO: string; endISO: string }>;
};

export type CrmScheduleData = {
  date: string;                 // YYYY-MM-DD（営業日）
  therapists: CrmScheduleTherapist[];
  bookings: CrmScheduleBooking[];
};
