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
  /** プレイ状況：'' ＝ 予約だけ ／ address_sent ＝ 住所送済 ／ entered ＝ 入室済（第544便） */
  playStatus: string;
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
  /** 報酬確定（この営業日） */
  confirms: CrmPayConfirm[];
  /** 日報（締め済みなら） */
  report: CrmDailyReport | null;
  /** 店の設定（第548便） */
  settings: CrmSettings;
  /** その日の「受まで／上がり」（セラピストID → 種類）。無い人は settings.defaultEndType */
  workEnds: Record<number, CrmEndType>;
  /** その日の出勤情報（セラピストID → 情報・第550便） */
  workDays: Record<number, CrmWorkDay>;
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

// ── 報酬確定と締め（第538便）────────────────────────
export type CrmPayConfirm = {
  therapistId: number;
  bookingCount: number;
  payTotal: number;     // 確定したときの予約の報酬合計
  allowance: number;    // 手当・交通費など（±）
  note: string;
  confirmedAt: string;
};

export type CrmDailyReport = {
  date: string;
  bookingCount: number;
  cancelCount: number;
  workingCount: number;
  sales: number;
  cashSales: number;
  pay: number;
  expense: number;
  profit: number;
  memo: string;
  closedAt: string;
};

export type CrmDaySummary = {
  date: string;
  bookingCount: number;
  cancelCount: number;
  workingCount: number;
  sales: number;
  cashSales: number;
  pay: number;          // 予約の報酬＋確定の手当
  allowance: number;
  freeUnassigned: number; // 担当未定のままの予約
  unconfirmed: string[];  // まだ報酬を確定していない人の名前
  report: CrmDailyReport | null;
};

/** 営業日（朝6時区切り）の予約か：その日 0:00 からの分で 6:00〜翌6:00 に始まる */
export function inBusinessDay(startMinOfDay: number): boolean {
  return startMinOfDay >= 6 * 60 && startMinOfDay < 30 * 60;
}

// ── レポート（第540便）────────────────────────────────
export type CrmStatRow = { key: string; label: string; count: number; cancels: number; sales: number; pay: number };
export type CrmMonthStats = {
  ym: string;
  total: { count: number; cancels: number; badCancels: number; sales: number; pay: number; allowance: number; unpriced: number };
  customers: { people: number; newPeople: number; repeatPeople: number; noTel: number };
  byDay: CrmStatRow[];        // key=YYYY-MM-DD
  byTherapist: CrmStatRow[];  // key=therapistId か 'free'
  bySource: CrmStatRow[];     // key=web / manual
  byHour: CrmStatRow[];       // key=開始の時（6〜29）
};

// ── プレイ状況・指名のバッジ（第544便）────────────────
export const CRM_PLAY_STATUS = ['', 'address_sent', 'entered'] as const;
export type CrmPlayStatus = (typeof CRM_PLAY_STATUS)[number];
export const CRM_PLAY_LABEL: Record<CrmPlayStatus, string> = { '': '予約', address_sent: '住所送済', entered: '入室済' };

/** 指名のバッジ：「本」が入る指名＝本（本指名）／フリー＝ﾌﾘｰ／それ以外（ネット指名など）は出さない */
export function nominationBadge(items: CrmBookingItem[]): '本' | 'ﾌﾘｰ' | null {
  const n = items.find((i) => i.kind === 'nomination');
  if (!n) return null;
  if (n.name.includes('本')) return '本';
  if (/フリー|ﾌﾘｰ|free/i.test(n.name)) return 'ﾌﾘｰ';
  return null;
}

/** 最初から用意する指名（名前は変えられない・消せない。要らなければ「使う」を外す）（第546便） */
export const CRM_FIXED_NOMINATIONS = ['フリー', 'ネット指名', '本指名'] as const;
export function isFixedNomination(kind: string, name: string): boolean {
  return kind === 'nomination' && (CRM_FIXED_NOMINATIONS as readonly string[]).includes(name);
}

// ── 設定と「受まで／上がり」（第548便）────────────────
export type CrmEndType = 'accept' | 'finish';
export const CRM_END_LABEL: Record<CrmEndType, string> = { accept: '受まで', finish: '上がり' };
export type CrmSettings = {
  dayStartMin: number;   // 時間軸の始まり（その日 0:00 からの分・6:00〜）
  dayEndMin: number;     // 時間軸の終わり（〜翌7:00＝1860）
  defaultEndType: CrmEndType;
  /** 待機場所（部屋）の一覧（第550便） */
  rooms: string[];
};
export const CRM_DEFAULT_SETTINGS: CrmSettings = { dayStartMin: 600, dayEndMin: 1740, defaultEndType: 'finish', rooms: [] };

// ── 出勤情報（第550便）──────────────────────────────
export const CRM_ATTENDANCE = ['', 'late', 'absent', 'sent_home'] as const;
export type CrmAttendance = (typeof CRM_ATTENDANCE)[number];
export const CRM_ATTENDANCE_LABEL: Record<CrmAttendance, string> = { '': '—', late: '遅刻', absent: '当欠', sent_home: '休ませた' };
export type CrmWorkDay = {
  breakStartMin: number | null; // その日 0:00 からの分
  breakEndMin: number | null;
  breakMemo: string;
  room: string;
  attendance: CrmAttendance;
  transport: number;
};
export const CRM_EMPTY_WORK_DAY: CrmWorkDay = { breakStartMin: null, breakEndMin: null, breakMemo: '', room: '', attendance: '', transport: 0 };
