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
  /** 検索の言葉がメモ・要注意メモに当たったときの前後の文（第553便） */
  memoHit?: { kind: 'caution' | 'memo'; text: string };
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
  consentAt: string | null; // 同意書を了承した時刻（第574便）
};

export type CrmTherapist = { id: number; name: string; isActive: boolean };

export type CrmAccess =
  | { ok: true; salonId: number; salonName: string; crmUntil: string | null; active: boolean; isAdmin: boolean; termsOk: boolean }
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
  /** 受領：'' ＝ 未受領 ／ therapist ＝ 女子が受領 ／ shop ＝ お店が受領（第554便） */
  receivedBy: string;
  /** 同意書を了承した時刻（有効なもの・無ければ null）（第560便） */
  consentAt: string | null;
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
  unreceived: number;     // 未受領（キャンセル以外・料金あり・開始を過ぎた予約）（第554便）
  unsettled: string[];    // その日に動きがあって、残高が 0 でない人（名前）（第558便）
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
  /** 指名別（第644便）：key=hon / net / free / other / none */
  byNomination: CrmStatRow[];
  /** 新規／リピート（本数・第644便）：key=new / repeat / notel */
  byNewRepeat: CrmStatRow[];
};

// ── プレイ状況・指名のバッジ（第544便）────────────────
export const CRM_PLAY_STATUS = ['', 'address_sent', 'entered'] as const;
export type CrmPlayStatus = (typeof CRM_PLAY_STATUS)[number];
export const CRM_PLAY_LABEL: Record<CrmPlayStatus, string> = { '': '予約', address_sent: '住所送済', entered: '入室済' };

/** 受領（お金を受け取ったか・誰が受け取ったか）（第554便） */
export const CRM_RECEIVED = ['', 'therapist', 'shop'] as const;
export type CrmReceivedBy = (typeof CRM_RECEIVED)[number];
export const CRM_RECEIVED_LABEL: Record<CrmReceivedBy, string> = { '': '未受領', therapist: '女子が受領', shop: 'お店が受領' };
/** 未受領として数える予約か：キャンセル以外・料金が入っている・開始を過ぎた */
export function isUnreceived(b: { status: string; priceTotal: number | null; receivedBy: string; slotStartISO: string }, nowMs: number): boolean {
  return b.status !== 'cancelled' && b.priceTotal != null && !b.receivedBy && new Date(b.slotStartISO).getTime() <= nowMs;
}

/** 指名のバッジ：本指名＝本／フリー＝ﾌﾘｰ／ネット指名＝ﾈｯﾄ（第614便で追加）／それ以外（お店が足した指名）は出さない */
export type CrmNominationBadge = '本' | 'ﾌﾘｰ' | 'ﾈｯﾄ';
export function nominationBadge(items: CrmBookingItem[]): CrmNominationBadge | null {
  const n = items.find((i) => i.kind === 'nomination');
  if (!n) return null;
  if (n.name.includes('本')) return '本';
  if (/フリー|ﾌﾘｰ|free/i.test(n.name)) return 'ﾌﾘｰ';
  if (/ネット|ﾈｯﾄ|ねっと|net|web/i.test(n.name)) return 'ﾈｯﾄ';
  return null;
}
/** バッジの色（CRM・/cast で同じ見た目にする） */
export const CRM_NOMINATION_CLASS: Record<CrmNominationBadge, string> = {
  '本': 'bg-pink-200 text-pink-800',
  'ﾌﾘｰ': 'bg-slate-200 text-slate-700',
  'ﾈｯﾄ': 'bg-sky-200 text-sky-800',
};

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
  /** 部屋ごとのバッジの色（部屋名 → 色の名前・第552便） */
  roomColors: Record<string, string>;
  /** 予約アラーム（第559便） */
  alarms: CrmAlarm[];
  /** 来店時の同意書（第560便） */
  consentEnabled: boolean;
  consentTitle: string;
  consentBody: string;
  /** セラピストに /cast でスケジュール（本人の出勤と予約）を見せる（第599便で報酬明細から変更。列名 cast_pay_enabled は第572便のまま） */
  castPayEnabled: boolean;
  /** 自由に作れる出勤情報の項目（最大2つ・第597便）。例：掛け持ち出勤／A・B・C */
  customToggles: CrmToggle[];
};

/**
 * 出勤情報の自由項目（第597便）。★ id で値を持つので、題名を変えても選んだ値は残る。
 * ★ 選べるのは1つだけ（もう一度押すと外れる）。
 */
// ★ colors（第638便）: 選択肢ごとの予約ブロックの背景色。無い選択肢は「なし」（色を変えない）。
//   ★ custom_toggles は JSON なので列は足していない。★ 鍵は選択肢の文字（選択肢の文字を変えると色も付け直し）。
export type CrmToggleColor = 'yellow' | 'green';
export type CrmToggle = { id: string; title: string; options: string[]; colors?: Record<string, CrmToggleColor> };
/** ★ 予約ブロックの文字（黒・各バッジ）が読める淡い色だけにする。★ 出勤のピンク・予約の水色／ピンクと区別がつく色 */
export const CRM_TOGGLE_COLORS: Array<{ key: CrmToggleColor; label: string; bg: string; border: string }> = [
  { key: 'yellow', label: '黄', bg: '#fef3c7', border: '#f59e0b' },
  { key: 'green', label: '緑', bg: '#dcfce7', border: '#22c55e' },
];
export const CRM_TOGGLE_MAX = 2;
export const CRM_TOGGLE_OPTION_MAX = 10;
export const CRM_TOGGLE_TITLE_LEN = 20;
export const CRM_TOGGLE_OPTION_LEN = 10;
/** 保存された項目の形を整える（壊れた値・空の題名・空の選択肢は落とす） */
export function normalizeCrmToggles(raw: unknown): CrmToggle[] {
  if (!Array.isArray(raw)) return [];
  const out: CrmToggle[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const id = String(o.id ?? '').trim();
    const title = String(o.title ?? '').trim().slice(0, CRM_TOGGLE_TITLE_LEN);
    const options = [...new Set((Array.isArray(o.options) ? o.options : []).map((x) => String(x).trim().slice(0, CRM_TOGGLE_OPTION_LEN)).filter(Boolean))].slice(0, CRM_TOGGLE_OPTION_MAX);
    if (!/^[a-z0-9]{1,12}$/.test(id) || !title || options.length === 0) continue;
    if (out.some((t) => t.id === id)) continue;
    const colors: Record<string, CrmToggleColor> = {};
    const rawColors = o.colors && typeof o.colors === 'object' && !Array.isArray(o.colors) ? (o.colors as Record<string, unknown>) : {};
    for (const op of options) {
      const c = rawColors[op];
      if (c === 'yellow' || c === 'green') colors[op] = c;
    }
    out.push(Object.keys(colors).length ? { id, title, options, colors } : { id, title, options });
    if (out.length >= CRM_TOGGLE_MAX) break;
  }
  return out;
}
/** その日の選択を、いまの項目に合うものだけに絞る（消した項目・消した選択肢は出さない） */
export function pickCrmToggleValues(toggles: CrmToggle[], values: Record<string, string> | undefined): Array<{ title: string; value: string }> {
  const out: Array<{ title: string; value: string }> = [];
  for (const t of toggles) {
    const v = values?.[t.id];
    if (v && t.options.includes(v)) out.push({ title: t.title, value: v });
  }
  return out;
}

/** その日の選択から、予約ブロックの背景色を決める（第638便）。★ 色の付いた選択肢が無ければ null。★ 2つとも色付きなら上の項目を優先 */
export function crmToggleBookingColor(toggles: CrmToggle[], values: Record<string, string> | undefined): { bg: string; border: string } | null {
  for (const t of toggles) {
    const v = values?.[t.id];
    if (!v || !t.options.includes(v)) continue;
    const key = t.colors?.[v];
    const c = key ? CRM_TOGGLE_COLORS.find((x) => x.key === key) : undefined;
    if (c) return { bg: c.bg, border: c.border };
  }
  return null;
}

/** 予約アラーム（第559便・風俗CTIv2 の予約アラームにあたる）。on: 予約開始／予約終了・min 分前・sec 秒鳴らす・sound 音1〜4 */
export type CrmAlarm = { on: 'start' | 'end'; min: number; sec: number; sound: number };
export const CRM_ALARM_SOUNDS = [1, 2, 3, 4] as const;
export const CRM_DEFAULT_ALARMS: CrmAlarm[] = [
  { on: 'start', min: 5, sec: 30, sound: 2 },
  { on: 'end', min: 10, sec: 30, sound: 4 },
];
/** 保存されたアラームの形を整える（null・壊れた値 → 既定）。空配列は「アラームなし」 */
export function normalizeCrmAlarms(raw: unknown): CrmAlarm[] {
  if (!Array.isArray(raw)) return CRM_DEFAULT_ALARMS.map((a) => ({ ...a }));
  const out: CrmAlarm[] = [];
  for (const r of raw.slice(0, 10)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const min = Math.round(Number(o.min));
    const sec = Math.round(Number(o.sec));
    const sound = Math.round(Number(o.sound));
    if (!(min >= 0 && min <= 120) || !(sec >= 5 && sec <= 300)) continue;
    out.push({ on: o.on === 'end' ? 'end' : 'start', min, sec, sound: sound >= 1 && sound <= 4 ? sound : 1 });
  }
  return out;
}

export const CRM_DEFAULT_SETTINGS: CrmSettings = { dayStartMin: 600, dayEndMin: 1740, defaultEndType: 'finish', rooms: [], roomColors: {}, alarms: CRM_DEFAULT_ALARMS, consentEnabled: false, consentTitle: '', consentBody: '', castPayEnabled: false, customToggles: [] };

/** 同意書（第560便）：CRM で見る1件 */
export type CrmConsent = {
  id: number;
  createdAt: string;
  room: string;
  title: string;
  body: string;
  signaturePng: string;
  superseded: boolean;
  /** 紙でもらって、お店が手動で了承済にしたもの（第639便）。★ サインの画像は無い */
  manual: boolean;
  /** 手動の了承を押したのが運営（ADMIN）か */
  manualByAdmin: boolean;
};

/** 部屋のバッジの色（第552便）。無い・知らない名前は紺 */
export const CRM_ROOM_COLORS: Array<{ key: string; label: string; bg: string; fg: string }> = [
  { key: 'navy', label: '紺', bg: '#1e2a5a', fg: '#ffffff' },
  { key: 'blue', label: '青', bg: '#2563eb', fg: '#ffffff' },
  { key: 'sky', label: '水色', bg: '#7dd3fc', fg: '#0c4a6e' },
  { key: 'green', label: '緑', bg: '#15803d', fg: '#ffffff' },
  { key: 'lime', label: '黄緑', bg: '#a3e635', fg: '#1a2e05' },
  { key: 'yellow', label: '黄', bg: '#facc15', fg: '#422006' },
  { key: 'orange', label: 'オレンジ', bg: '#f97316', fg: '#ffffff' },
  { key: 'red', label: '赤', bg: '#dc2626', fg: '#ffffff' },
  { key: 'pink', label: 'ピンク', bg: '#f9a8d4', fg: '#831843' },
  { key: 'purple', label: '紫', bg: '#7e22ce', fg: '#ffffff' },
  { key: 'gray', label: '灰', bg: '#9ca3af', fg: '#111827' },
  { key: 'black', label: '黒', bg: '#111111', fg: '#ffffff' },
  // 第564便で8色追加
  { key: 'teal', label: '青緑', bg: '#0d9488', fg: '#ffffff' },
  { key: 'mint', label: 'ミント', bg: '#99f6e4', fg: '#134e4a' },
  { key: 'brown', label: '茶', bg: '#78350f', fg: '#ffffff' },
  { key: 'beige', label: 'ベージュ', bg: '#e7d3b1', fg: '#422006' },
  { key: 'gold', label: '金', bg: '#ca8a04', fg: '#ffffff' },
  { key: 'wine', label: 'ワイン', bg: '#881337', fg: '#ffffff' },
  { key: 'lavender', label: 'ラベンダー', bg: '#c4b5fd', fg: '#2e1065' },
  { key: 'white', label: '白', bg: '#ffffff', fg: '#111827' },
];
export function roomColor(key: string | undefined): { bg: string; fg: string } {
  return CRM_ROOM_COLORS.find((c) => c.key === key) ?? CRM_ROOM_COLORS[0];
}

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
  /** 自由項目の選択（項目の id → 選んだ選択肢・第597便） */
  toggles: Record<string, string>;
};
export const CRM_EMPTY_WORK_DAY: CrmWorkDay = { breakStartMin: null, breakEndMin: null, breakMemo: '', room: '', attendance: '', transport: 0, toggles: {} };

// ── 金銭授受（第558便・2026-09-20）────────────────────
// 女子の残高 ＝ 女子が受領した料金 − 女子の報酬 − 女子→お店に渡した額 ＋ お店→女子に払った額
// ＋ ならお店が受け取る側、− ならお店が払う側。0 で精算済み。
// 報酬は、報酬確定した日は確定の数字（手当込み）、まだの日は予約の報酬の合計（見込み）。
export const CRM_MONEY_DIRECTIONS = ['to_shop', 'to_therapist'] as const;
export type CrmMoneyDirection = (typeof CRM_MONEY_DIRECTIONS)[number];
export const CRM_MONEY_DIRECTION_LABEL: Record<CrmMoneyDirection, string> = { to_shop: '女子→お店', to_therapist: 'お店→女子' };
export const CRM_MONEY_CATEGORIES = ['settle', 'change', 'advance', 'other'] as const;
export type CrmMoneyCategory = (typeof CRM_MONEY_CATEGORIES)[number];
export const CRM_MONEY_CATEGORY_LABEL: Record<CrmMoneyCategory, string> = { settle: '精算', change: '釣銭', advance: '前借り', other: 'その他' };

export type CrmMoneyMove = {
  id: number;
  therapistId: number;
  therapistName: string;
  date: string;               // 営業日
  direction: CrmMoneyDirection;
  category: CrmMoneyCategory;
  amount: number;
  memo: string;
  createdAt: string;
  cancelledAt: string | null;
};

export type CrmMoneyBalance = {
  therapistId: number;
  name: string;
  received: number;     // 女子が受領した料金
  pay: number;          // 女子の報酬
  toShop: number;       // 女子→お店
  toTherapist: number;  // お店→女子
  balance: number;      // received − pay − toShop + toTherapist
};

/** 報酬確定の画面の「精算」欄：その日の分と、前日までの残高 */
export type CrmMoneyDay = {
  prior: number;        // 前日までの残高
  received: number;     // その日に女子が受領した料金
  pay: number;          // その日の報酬
  payConfirmed: boolean;
  moves: CrmMoneyMove[]; // その日の動き（取り消し含む）
  balance: number;      // その日の終わりの残高（prior ＋ received − pay − 渡した ＋ 払った）
};

export function moneyBalanceLabel(balance: number): string {
  if (balance > 0) return `お店が受け取る ${yen(balance)}`;
  if (balance < 0) return `お店が払う ${yen(-balance)}`;
  return '精算済み';
}

// ── 同意書の初期の文面（第562便）。★ ひな形。お店が自由に書き換える。「初期の文面に戻す」でここに戻る。
export const CRM_CONSENT_DEFAULT_TITLE = 'ご利用にあたっての注意事項';
export const CRM_CONSENT_DEFAULT_BODY = `当店をご利用いただく前に、以下の内容をお読みください。

1. 18歳未満の方（高校生を含む）はご利用いただけません。

2. 暴力団等の反社会的勢力に関係する方はご利用いただけません。

3. 飲酒により泥酔されている方、体調のすぐれない方、感染症・皮膚疾患のある方は、ご利用をお断りする場合があります。

4. 当店はリラクゼーションを目的としたマッサージ店です。性的なサービスは一切行っておりません。

5. セラピストへのわいせつな行為、体に触れる行為、しつこい誘い、暴言・暴力は禁止です。

6. 室内での撮影・録音・録画は禁止です。

7. セラピストへの連絡先の交換・店外での待ち合わせの誘い・引き抜き行為は禁止です。

8. 貴重品はお客様ご自身で管理してください。紛失・盗難について当店は責任を負いかねます。

9. 上記に反する行為があった場合は、その時点で施術を中止し、料金の返金はいたしません。悪質な場合は出入り禁止とし、損害賠償を請求することがあります。

10. お預かりした個人情報は、ご予約とご来店の管理のためにのみ使用します。

以上をご確認のうえ、下の「上記の内容をすべて了承します」に☑を入れ、サインをお願いします。`;

// ── 予約一覧・検索（第571便）───────────────────────────
export type CrmBookingSearch = {
  from: string;          // 営業日 YYYY-MM-DD
  to: string;
  therapistId: number | null; // null＝全員／0＝フリー（担当未定）
  status: 'all' | 'active' | 'unconfirmed' | 'cancelled' | 'bad';
  source: '' | 'web' | 'manual';
  q: string;             // 名前・電話番号の一部
};
export type CrmBookingListRow = {
  id: string;
  slotStartISO: string;
  slotEndISO: string;
  therapistName: string;
  courseName: string;
  customerName: string;
  customerTel: string;
  customerId: number | null;
  status: string;
  cancelBad: boolean;
  source: string;
  priceTotal: number | null;
  payTotal: number | null;
  receivedBy: string;
  consentAt: string | null; // 同意書を了承した時刻（第574便）
};
