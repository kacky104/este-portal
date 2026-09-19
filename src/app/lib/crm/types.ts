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
  // 料金と報酬（第2段階）
  items: CrmBookingItem[];
  priceAdjust: number;
  payAdjust: number;
  priceTotal: number | null;    // null＝まだ料金を入れていない
  payTotal: number | null;
  paymentMethod: string;
};

export type CrmScheduleTherapist = {
  id: number;
  name: string;
  profileImageUrl: string | null;
  /** 女子メモ（お店の内部メモ・crm_therapist_memos）。無ければ空 */
  memo: string;
  /** 出勤枠（ISO）。前日の夜跨ぎの尻尾も入る */
  schedules: Array<{ start: string; end: string; startISO: string; endISO: string }>;
};

export type CrmScheduleData = {
  date: string;                 // YYYY-MM-DD（営業日）
  therapists: CrmScheduleTherapist[];
  bookings: CrmScheduleBooking[];
  /** 受付フォームのコース候補（salons.booking_courses・予約ボードと同じ） */
  courses: Array<{ name: string; durationMin: number; price: string }>;
  /** 施術後インターバルの店舗設定（受付フォームの初期値） */
  defaultIntervalMin: number;
  /** 料金表（使うものだけ・並び順） */
  priceItems: CrmPriceItem[];
};

// ── 料金と報酬（第2段階・2026-09-19）────────────────────
export const CRM_PRICE_KINDS = ['course', 'nomination', 'extension', 'option', 'discount'] as const;
export type CrmPriceKind = (typeof CRM_PRICE_KINDS)[number];
export const CRM_PRICE_KIND_LABEL: Record<CrmPriceKind, string> = {
  course: 'コース',
  nomination: '指名',
  extension: '延長',
  option: 'オプション',
  discount: '割引',
};
/** コース・指名は1つだけ選ぶ。延長・オプション・割引はいくつでも */
export const CRM_PRICE_SINGLE: Record<CrmPriceKind, boolean> = {
  course: true, nomination: true, extension: false, option: false, discount: false,
};

export type CrmPriceItem = {
  id: number;
  kind: CrmPriceKind;
  name: string;
  minutes: number;
  price: number;  // 割引は「引く額」（正の数）
  pay: number;    // 割引は「報酬から引く額」
  sort: number;
  isActive: boolean;
};

/** 予約に写して持つ項目（料金表を直しても過去の予約は変わらない） */
export type CrmBookingItem = {
  kind: CrmPriceKind;
  name: string;
  minutes: number;
  price: number;
  pay: number;
  priceItemId?: number;
};

export const CRM_PAYMENT_METHODS = ['現金', 'カード', 'PayPay', 'その他'] as const;

/** 項目の合計（割引は引く）。補正は別に足す */
export function sumCrmItems(items: CrmBookingItem[]): { price: number; pay: number } {
  let price = 0;
  let pay = 0;
  for (const it of items) {
    const sign = it.kind === 'discount' ? -1 : 1;
    price += sign * (Number(it.price) || 0);
    pay += sign * (Number(it.pay) || 0);
  }
  return { price, pay };
}

export function yen(n: number | null | undefined): string {
  if (n == null) return '—';
  return `¥${Number(n).toLocaleString('ja-JP')}`;
}
