'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import { getLinkedXProfileForSalon } from '@/app/lib/xLink';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { SALON_THEMES, type ThemeKey } from '@/app/lib/themes';
import { COUPON_COLORS, getCouponColor, DEFAULT_COUPON_COLOR_KEY, type CouponColorKey } from '@/app/lib/couponColors';
import { VipLetterForm } from '@/app/components/VipLetterForm';
import { JobsTab } from '@/app/mypage/JobsTab';
import { SupportTab } from '@/app/mypage/SupportTab';
import { getBusinessDateJST, getBusinessDateRangeJST } from '@/lib/dutyStatus';
import { isCastLiveRow } from '@/lib/imasugu';
import { MyDiaryList } from './MyDiaryList';
import { inviteCast, resendCastInvite, unlinkCast, cancelCastInvite } from '@/app/actions/castInvite';
import { deleteTherapistWithCleanup } from '@/app/actions/therapistAdmin';
import { PAYMENT_CARD_OPTIONS } from '@/app/lib/paymentCards';
import { PAYMENT_METHOD_OPTIONS } from '@/app/lib/paymentMethods';
import { getSalonBookings, updateBookingStatus, deleteBooking, type OwnerBooking } from '@/app/actions/booking';
import { callbackPrefLabel } from '@/app/lib/booking/callbackPref';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { useToast } from '@/app/components/useToast';

const supabase = createClient();

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 「今すぐ」が現時点で有効か（公開サイトのバッジ表示と同じ時刻ベース判定）。
// is_available_now=true かつ available_until が未来のときのみ true。
// 期限切れ（available_until が過去 / NULL）は cron の実行を待たず false 扱いにする。
function isAvailableNowLive(t: { is_available_now?: boolean | null; available_until?: string | null }): boolean {
  return Boolean(t.is_available_now) && t.available_until != null && new Date(t.available_until) > new Date();
}

async function fetchTherapistList(salonId: string): Promise<Therapist[]> {
  const { data, error } = await supabase
    .from('therapists')
    .select('id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text, is_available_now, available_until, is_available_now_cast, available_until_cast, user_id, invited_email')
    .eq('salon_id', salonId);
  if (!error) return (data ?? []) as Therapist[];
  console.warn('[mypage] クエリ失敗（カラム未作成の可能性）:', error.message);
  const { data: fb } = await supabase
    .from('therapists')
    .select('id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text')
    .eq('salon_id', salonId);
  return (fb ?? []).map(t => ({ ...(t as Omit<Therapist, 'is_available_now' | 'available_until' | 'is_available_now_cast' | 'available_until_cast' | 'user_id' | 'invited_email'>), is_available_now: false, available_until: null, is_available_now_cast: false, available_until_cast: null, user_id: null, invited_email: null }));
}

type Coupon = {
  id: string;
  title: string;
  discount: string;
  conditions: string | null;
  valid_until: string | null;
  is_published: boolean;
  sort_order: number;
  color: string;
};

async function fetchCouponList(salonId: number): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, title, discount, conditions, valid_until, is_published, sort_order, color')
    .eq('salon_id', salonId)
    .order('sort_order', { ascending: true });
  if (error) console.warn('[mypage] クーポン取得失敗:', error.message);
  return (data ?? []) as Coupon[];
}

type Announcement = {
  id: string;
  title: string;
  content: string | null;
  is_published: boolean;
  published_at: string;
  image_url: string | null;
};

async function fetchAnnouncementList(salonId: number): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, is_published, published_at, image_url')
    .eq('salon_id', salonId)
    .order('published_at', { ascending: false });
  if (error) console.warn('[mypage] お知らせ取得失敗:', error.message);
  return (data ?? []) as Announcement[];
}

// タブのアイコン（既存サイトと同系統の tabler/lucide 風アウトラインアイコン）。
function tabIcon(key: 'salon' | 'schedule' | 'available' | 'profile' | 'diary' | 'coupon' | 'news' | 'vipletter' | 'booking' | 'jobs' | 'popup' | 'support') {
  const common = {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0',
  };
  switch (key) {
    case 'salon': // 店舗（building-store）
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M4 7l1.5 -3h13l1.5 3" />
          <path d="M4 7v3a2 2 0 0 0 4 0a2 2 0 0 0 4 0a2 2 0 0 0 4 0a2 2 0 0 0 4 0v-3" />
          <path d="M5 21v-9" />
          <path d="M19 21v-9" />
          <path d="M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4" />
        </svg>
      );
    case 'schedule': // 出勤（calendar）
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'booking': // ネット予約（calendar-check）
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <path d="M9 15l2 2l4 -4" />
        </svg>
      );
    case 'jobs': // 求人（briefcase）
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 13h18" />
        </svg>
      );
    case 'support': // 運営から（mail）
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      );
    case 'popup': // ポップアップ（megaphone）
      return (
        <svg {...common}>
          <path d="M3 11l14 -5v12l-14 -5v-2z" />
          <path d="M11.6 16.8a3 3 0 1 1 -5.8 -1.6" />
        </svg>
      );
    case 'available': // 今すぐ（clock）
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
    case 'profile': // セラピスト（users group）
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0 -4 -4H5a4 4 0 0 0 -4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0 -3 -3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'diary': // 日記（photo）
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5 -5L5 21" />
        </svg>
      );
    case 'coupon': // クーポン（ticket）
      return (
        <svg {...common}>
          <path d="M15 5l0 2" />
          <path d="M15 11l0 2" />
          <path d="M15 17l0 2" />
          <path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2" />
        </svg>
      );
    case 'news': // お知らせ（bell）
      return (
        <svg {...common}>
          <path d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
          <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
        </svg>
      );
    case 'vipletter': // VIPレター（mail）
      return (
        <svg {...common}>
          <path d="M3 5m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
          <path d="M3 7l9 6l9 -6" />
        </svg>
      );
    default:
      return null;
  }
}

// 公開日時の表示整形（JST・"2026年6月20日 19:12"）。
function formatPublishedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

// 予約枠（UTC timestamptz）を JST の "M/D(曜) HH:MM〜HH:MM" に整形する。
function formatBookingSlot(startISO: string, endISO: string): string {
  const parts = (iso: string) => {
    const d = new Date(iso);
    const md = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(d);
    const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return { md, wd, hm };
  };
  const s = parts(startISO);
  const e = parts(endISO);
  return `${s.md}(${s.wd}) ${s.hm}〜${e.hm}`;
}

// 予約ステータスの表示ラベル（フェーズ2aは 'new' のみ入る想定）。
function bookingStatusLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case 'new': return { label: '新規リクエスト', cls: 'bg-pink-100 text-pink-700' };
    case 'confirmed': return { label: '確定', cls: 'bg-emerald-100 text-emerald-700' };
    case 'cancelled': return { label: 'キャンセル', cls: 'bg-slate-100 text-slate-500' };
    default: return { label: status, cls: 'bg-slate-100 text-slate-500' };
  }
}

function toPickerValue(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const prefix = (eh * 60 + em) < (sh * 60 + sm) ? '翌' : '';
  return `${sh}:${pad(sm)}〜${prefix}${eh}:${pad(em)}`;
}

function fromPickerValue(value: string): { start: string | null; end: string | null } {
  if (!value) return { start: null, end: null };
  const clean = value.replace(/翌/g, '');
  const parts = clean.split('〜');
  if (parts.length < 2) return { start: null, end: null };
  const norm = (t: string) => {
    const [h, m] = t.trim().split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(isNaN(m) ? 0 : m).padStart(2, '0')}`;
  };
  return { start: norm(parts[0]), end: norm(parts[1]) };
}

type CourseItem  = { duration: string; price: string };
type CourseGroup = { name: string; items: CourseItem[] };
type OtherItem   = { label: string; price: string };
// ネット予約専用コース（料金ページの courses とは独立。salons.booking_courses に保存）。
// 入力中は duration_min を空文字許容し、保存時に数値化する。
type BookingCourseForm = { name: string; duration_min: number | ''; price: string };

// salons.booking_courses(JSON) → フォーム用に整形（既存店で null/未定義なら空配列）。
function parseBookingCourses(raw: unknown): BookingCourseForm[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((c) => {
    const n = Number(c.duration_min);
    return {
      name: String(c.name ?? ''),
      duration_min: Number.isFinite(n) && n > 0 ? n : '',
      price: String(c.price ?? ''),
    };
  });
}

function parseCourseGroups(raw: unknown): CourseGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) return [{ name: '', items: [{ duration: '', price: '' }] }];
  const map = new Map<string, CourseItem[]>();
  for (const entry of raw as Record<string, string>[]) {
    if (entry.name === 'その他') continue;
    const name       = String(entry.name ?? '');
    const durMatch   = String(entry.duration ?? '').match(/(\d+)/);
    const priceMatch = String(entry.price    ?? '').match(/([\d,]+)/);
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push({
      duration: durMatch?.[1]   ?? '',
      price:    priceMatch?.[1]?.replace(/,/g, '') ?? '',
    });
  }
  const result = Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  return result.length > 0 ? result : [{ name: '', items: [{ duration: '', price: '' }] }];
}

function parseOtherItems(raw: unknown): OtherItem[] {
  if (!Array.isArray(raw)) return [{ label: '', price: '' }];
  const items = (raw as Record<string, string>[])
    .filter(e => e.name === 'その他')
    .map(e => ({
      label: String(e.duration ?? ''),
      price: String(e.price ?? '').replace(/[^\d]/g, ''),
    }));
  return items.length > 0 ? items : [{ label: '', price: '' }];
}

function buildCoursesJson(
  groups: CourseGroup[],
  otherItems: OtherItem[]
): Array<{ name: string; duration: string; price: string; duration_min: number | null }> {
  // ネット予約の枠計算用にコース時間を数値(分)でも保持する。
  // item.duration はフォーム内で数字化済み（"60"）。数字が取れなければ null（"その他"や表記揺れ）。
  const toDurationMin = (raw: string): number | null => {
    const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? null : n;
  };
  const result: Array<{ name: string; duration: string; price: string; duration_min: number | null }> = [];
  for (const g of groups) {
    for (const item of g.items) {
      const priceNum = parseInt(item.price.replace(/[^\d]/g, ''), 10);
      const priceStr = isNaN(priceNum) ? item.price : `¥${priceNum.toLocaleString('ja-JP')}`;
      result.push({
        name: g.name,
        duration: item.duration ? `${item.duration}分` : '',
        price: priceStr,
        duration_min: toDurationMin(item.duration),
      });
    }
  }
  for (const item of otherItems) {
    if (!item.label && !item.price) continue;
    const priceNum = parseInt(item.price.replace(/[^\d]/g, ''), 10);
    const priceStr = isNaN(priceNum) ? item.price : `¥${priceNum.toLocaleString('ja-JP')}`;
    // 「その他」は時間ではないラベル（指名料等）なので常に null。
    result.push({ name: 'その他', duration: item.label, price: priceStr, duration_min: null });
  }
  return result;
}

function buildRepresentativePrice(groups: CourseGroup[]): string {
  const item = groups[0]?.items[0];
  if (!item?.duration && !item?.price) return '';
  const priceNum = parseInt((item.price ?? '').replace(/[^\d]/g, ''), 10);
  const priceStr = isNaN(priceNum) ? '' : `¥${priceNum.toLocaleString('ja-JP')}`;
  const parts: string[] = [];
  if (item.duration) parts.push(`${item.duration}分`);
  if (priceStr)      parts.push(priceStr);
  return parts.join(' ');
}

type SalonImage = {
  id:               string;
  image_url:        string;
  mobile_image_url: string | null;
  display_order:    number;
};

type Salon = {
  id: string;
  name: string;
  rating: number | null;
  review_count: number | null;
  tags: string[] | null;
  price: string | null;
  area: string | null;
  hours: string | null;
  description: string | null;
  appeal: string | null;
  catchphrase: string | null;
  therapist_count: number | null;
  therapist_types: string[] | null;
  therapist_profile: string | null;
  phone: string | null;
  address: string | null;
  access: string | null;
  closed_days: string | null;
  courses: unknown;
  theme: string | null;
  official_url: string | null;
  fukux_url: string | null;
  payment_url: string | null;
  payment_cards: string[] | null;
  payment_methods: string[] | null;
  booking_enabled: boolean | null;
  booking_email: string | null;
  booking_courses: unknown;
  jobs_enabled: boolean | null;
  popup_image_url: string | null;
  popup_link: string | null;
  popup_image_url2: string | null;
  popup_link2: string | null;
  popup_image_url3: string | null;
  popup_link3: string | null;
  popup_enabled: boolean | null;
};

type Therapist = {
  id: string;
  name: string | null;
  work_hours: string | null;
  area: string | null;
  comment: string | null;
  profile_image_url: string | null;
  age: string | null;
  body_type: string | null;
  profile_text: string | null;
  is_available_now: boolean;
  available_until: string | null;
  is_available_now_cast: boolean;
  available_until_cast: string | null;
  user_id: string | null;
  invited_email: string | null;
};

type DaySchedule = {
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
};

// ポップアップ画像スロット（最大3枚）→ salons の列名の対応。
const POPUP_COLS = [
  { img: 'popup_image_url',  link: 'popup_link'  },
  { img: 'popup_image_url2', link: 'popup_link2' },
  { img: 'popup_image_url3', link: 'popup_link3' },
] as const;

// ポップアップのリンク先候補。自分のサロン内のページ＋自店セラピストの個別ページのみ（外部URLは選べない）。
// value は保存される実パス。'' は「リンクなし」。
function popupLinkOptions(
  salonId: string | number,
  therapists: { id: string; name: string | null }[] = [],
): { label: string; value: string }[] {
  const base = `/salon/${salonId}`;
  const pages = [
    { label: 'リンクなし',       value: '' },
    { label: '店舗TOP',        value: base },
    { label: '料金',             value: `${base}/price` },
    { label: 'クーポン',         value: `${base}/coupon` },
    { label: '口コミ',           value: `${base}/reviews` },
    { label: '写メ日記',         value: `${base}/diary` },
    { label: 'お知らせ',         value: `${base}/news` },
    { label: 'セラピスト一覧',   value: `${base}/therapists` },
    { label: '店舗情報',         value: `${base}/info` },
    { label: '出勤表',           value: `${base}/schedule` },
    { label: 'ネット予約',       value: `${base}/book` },
  ];
  // 自店セラピストの個別ページ（/therapist/[id]）。
  const therapistPages = therapists
    .filter((t) => t.id != null && String(t.id).trim() !== '')
    .map((t) => ({ label: `セラピスト：${t.name ?? '（名前未設定）'}`, value: `/therapist/${t.id}` }));
  return [...pages, ...therapistPages];
}

export default function MyPage() {
  const router = useRouter();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [salonForm, setSalonForm] = useState<Partial<Salon>>({});
  const [therapistForms, setTherapistForms] = useState<Record<string, Partial<Therapist>>>({});
  const [schedules, setSchedules] = useState<Record<string, Record<string, DaySchedule>>>({});
  const [loadError, setLoadError] = useState('');
  // トーストは共通フックで一元管理（タイマー直書きは連続表示・unmount後setStateのバグ源）。
  const { toast, showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'salon' | 'schedule' | 'profile' | 'available' | 'diary' | 'coupon' | 'news' | 'vipletter' | 'booking' | 'jobs' | 'popup' | 'support'>('salon');
  // 「運営から」タブの未読お知らせ件数（SupportTab が読み込み時に通知・タブバッジ表示用）。
  const [supportUnread, setSupportUnread] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [newTherapistName, setNewTherapistName] = useState('');
  const [newTherapistIsNew, setNewTherapistIsNew] = useState(false);
  const [addingTherapist, setAddingTherapist] = useState(false);
  const [addError, setAddError] = useState('');
  const [deletingTherapist, setDeletingTherapist] = useState<string | null>(null);
  // キャスト招待：行ごとの入力メール・処理中ID
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [courseGroups, setCourseGroups] = useState<CourseGroup[]>([{ name: '', items: [{ duration: '', price: '' }] }]);
  const [otherItems,   setOtherItems]   = useState<OtherItem[]>([{ label: '', price: '' }]);
  const [bookingCourses, setBookingCourses] = useState<BookingCourseForm[]>([]);
  // ネット予約の受付一覧（service_role でサーバー取得・表示のみ）。
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState('');
  const [bookingBusyId, setBookingBusyId] = useState<string | null>(null);
  const [salonImages,    setSalonImages]    = useState<SalonImage[]>([]);
  // ポップアップ画像タブ（サロン詳細で左下から出る画像。最大3枚・各画像に個別リンク・リロード毎に1枚ランダム表示）
  const [popupImages,  setPopupImages]  = useState<(string | null)[]>([null, null, null]);
  const [popupLinks,   setPopupLinks]   = useState<string[]>(['', '', '']);
  const [popupEnabled, setPopupEnabled] = useState(false);
  const [uploadingPopupSlot, setUploadingPopupSlot] = useState<number | null>(null);
  const [savingPopup,  setSavingPopup]  = useState(false);
  const [savingTheme, setSavingTheme] = useState(false); // テーマ（店舗装飾タブ）保存中
  const [uploadingNewSlot,  setUploadingNewSlot]  = useState(false);
  const [uploadingPcId,     setUploadingPcId]     = useState<string | null>(null);
  const [uploadingMobileId, setUploadingMobileId] = useState<string | null>(null);
  const [availableNow, setAvailableNow] = useState<Record<string, boolean>>({});
  const [savingAvailable, setSavingAvailable] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [themeWallpapers, setThemeWallpapers] = useState<Record<string, string>>({});
  // 写メ日記タブ
  const [diaryTherapistId, setDiaryTherapistId] = useState<string | null>(null);
  const [diaryImage, setDiaryImage] = useState<string | null>(null);
  const [diaryTitle, setDiaryTitle] = useState('');
  const [diaryBody, setDiaryBody] = useState('');
  const [diaryUploading, setDiaryUploading] = useState(false);
  const [diaryPosting, setDiaryPosting] = useState(false);
  const [diaryReload, setDiaryReload] = useState(0);
  // クーポン管理タブ
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponForms, setCouponForms] = useState<Record<string, Partial<Coupon>>>({});
  const [newCoupon, setNewCoupon] = useState<{ title: string; discount: string; conditions: string; valid_until: string; is_published: boolean; color: CouponColorKey }>({ title: '', discount: '', conditions: '', valid_until: '', is_published: true, color: DEFAULT_COUPON_COLOR_KEY });
  const [addingCoupon, setAddingCoupon] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState<string | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<string | null>(null);
  // お知らせ管理タブ
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementForms, setAnnouncementForms] = useState<Record<string, Partial<Announcement>>>({});
  const [newAnnouncement, setNewAnnouncement] = useState<{ title: string; content: string; is_published: boolean; image_url: string | null }>({ title: '', content: '', is_published: true, image_url: null });
  const [addingAnnouncement, setAddingAnnouncement] = useState(false);
  const [savingAnnouncement, setSavingAnnouncement] = useState<string | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<string | null>(null);
  const [repostingAnnouncement, setRepostingAnnouncement] = useState<string | null>(null);
  const [uploadingNewAnnouncementImage, setUploadingNewAnnouncementImage] = useState(false);
  const [uploadingAnnouncementImageId, setUploadingAnnouncementImageId] = useState<string | null>(null);
  // お知らせ→fukuX 同時投稿。サロンオーナーの連携fukuX店舗プロフィール（kind='shop'・approved）id。
  // 未連携なら null（＝チェックは disabled 表示＋注記）。日記側 xProfileId と同じ役割。
  const [xShopProfileId, setXShopProfileId] = useState<string | null>(null);
  // 新規フォーム用の同時投稿チェック（default OFF・投稿後リセット・都度オプトイン）。
  const [newAnnCrosspostX, setNewAnnCrosspostX] = useState(false);
  const [newAnnCrosspostNoReplies, setNewAnnCrosspostNoReplies] = useState(false);
  // 再投稿カスタム確認モーダル（対象id）＋そのモーダル内の同時投稿チェック（毎回選び直し・記憶しない）。
  const [repostModalId, setRepostModalId] = useState<string | null>(null);
  const [repostCrosspostX, setRepostCrosspostX] = useState(false);
  const [repostCrosspostNoReplies, setRepostCrosspostNoReplies] = useState(false);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // 営業日基準（午前6時始まり）の7日間。
  // 0:00〜5:59 は前日を1日目、6:00以降は当日を1日目として表示する。
  const sevenDays = useMemo(() => getBusinessDateRangeJST(7), []);

  // 本日出勤中のセラピスト（営業日基準・深夜跨ぎ対応）。
  // 「今すぐ」は出勤中のセラピストにしか付けられないため、表示・保存の両方で参照する。
  const onDutyTherapists = useMemo(() => {
    const todayStr = getBusinessDateJST();
    const jstH = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(now));
    const jstM = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', minute: '2-digit' }).format(now));
    const nowMin = jstH * 60 + jstM;
    return therapists.filter(t => {
      const sched = schedules[String(t.id)]?.[todayStr];
      if (!sched?.is_active || !sched.start_time || !sched.end_time) return false;
      const [sh, sm] = sched.start_time.split(':').map(Number);
      const [eh, em] = sched.end_time.split(':').map(Number);
      const startMin = sh * 60 + (sm || 0);
      const endMin   = eh * 60 + (em || 0);
      return endMin < startMin
        ? nowMin >= startMin || nowMin <= endMin
        : nowMin >= startMin && nowMin <= endMin;
    });
  }, [therapists, schedules, now]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .select('id, name, rating, review_count, tags, price, area, hours, description, appeal, catchphrase, therapist_count, therapist_types, therapist_profile, phone, address, access, closed_days, courses, theme, official_url, fukux_url, payment_url, payment_cards, payment_methods, booking_enabled, booking_email, booking_courses, jobs_enabled, popup_image_url, popup_link, popup_image_url2, popup_link2, popup_image_url3, popup_link3, popup_enabled')
        .eq('owner_id', user.id)
        .single();

      if (salonError || !salonData) {
        setLoadError('店舗情報が見つかりません');
        return;
      }

      setSalon(salonData);
      setSalonForm(salonData);
      // お知らせ→fukuX 同時投稿用：オーナーの連携fukuX店舗プロフィール（kind='shop'・approved）を解決。
      // best-effort（未連携/失敗は null＝チェックは無効表示）。日記の xProfileId 解決と同型。
      getLinkedXProfileForSalon(user.id)
        .then((p) => setXShopProfileId(p?.profileId ?? null))
        .catch(() => setXShopProfileId(null));
      setCourseGroups(parseCourseGroups(salonData.courses));
      setOtherItems(parseOtherItems(salonData.courses));
      setBookingCourses(parseBookingCourses(salonData.booking_courses));
      // ポップアップ画像の設定を初期化（最大3枚・各リンク）
      setPopupImages([
        salonData.popup_image_url  ?? null,
        salonData.popup_image_url2 ?? null,
        salonData.popup_image_url3 ?? null,
      ]);
      setPopupLinks([
        salonData.popup_link  ?? '',
        salonData.popup_link2 ?? '',
        salonData.popup_link3 ?? '',
      ]);
      setPopupEnabled(Boolean(salonData.popup_enabled));

      // ネット予約の受付一覧を取得（オーナー検証＋service_role はサーバーアクション側）。
      // 失敗時はエラーを握り潰さず表示する（silent 0件を防ぐ）。
      setBookingsLoading(true);
      setBookingsError('');
      getSalonBookings(Number(salonData.id))
        .then((res) => {
          if (res.ok) setBookings(res.bookings);
          else setBookingsError(res.error);
        })
        .catch((e) => setBookingsError(e instanceof Error ? e.message : String(e)))
        .finally(() => setBookingsLoading(false));

      const { data: imageData } = await supabase
        .from('salon_images')
        .select('id, image_url, mobile_image_url, display_order')
        .eq('salon_id', salonData.id)
        .order('display_order', { ascending: true });
      setSalonImages(imageData ?? []);

      const couponList = await fetchCouponList(Number(salonData.id));
      setCoupons(couponList);
      const couponFormMap: Record<string, Partial<Coupon>> = {};
      couponList.forEach(c => {
        couponFormMap[c.id] = {
          title: c.title, discount: c.discount, conditions: c.conditions,
          valid_until: c.valid_until, is_published: c.is_published, color: c.color,
        };
      });
      setCouponForms(couponFormMap);

      const announcementList = await fetchAnnouncementList(Number(salonData.id));
      setAnnouncements(announcementList);
      const announcementFormMap: Record<string, Partial<Announcement>> = {};
      announcementList.forEach(a => {
        announcementFormMap[a.id] = { title: a.title, content: a.content, is_published: a.is_published, image_url: a.image_url };
      });
      setAnnouncementForms(announcementFormMap);

      const { data: wallpaperData } = await supabase
        .from('theme_wallpapers')
        .select('theme_key, image_url');
      const wpMap: Record<string, string> = {};
      (wallpaperData ?? []).forEach((w: { theme_key: string; image_url: string }) => { wpMap[w.theme_key] = w.image_url; });
      setThemeWallpapers(wpMap);

      const list = await fetchTherapistList(String(salonData.id));
      setTherapists(list);
      const initAvail: Record<string, boolean> = {};
      list.forEach(t => { initAvail[String(t.id)] = isAvailableNowLive(t); });
      setAvailableNow(initAvail);

      const forms: Record<string, Partial<Therapist>> = {};
      list.forEach((t) => {
        forms[t.id] = {
          comment: t.comment,
          profile_image_url: t.profile_image_url,
          age: t.age,
          body_type: t.body_type,
          profile_text: t.profile_text,
        };
      });
      setTherapistForms(forms);

      if (list.length > 0) {
        const todayStr = sevenDays[0];
        const lastStr  = sevenDays[sevenDays.length - 1];

        const { data: schedData } = await supabase
          .from('therapist_schedules')
          .select('therapist_id, schedule_date, is_active, start_time, end_time')
          .in('therapist_id', list.map(t => t.id))
          .gte('schedule_date', todayStr)
          .lte('schedule_date', lastStr);

        const schedMap: Record<string, Record<string, DaySchedule>> = {};
        list.forEach(t => { schedMap[t.id] = {}; });
        (schedData ?? []).forEach(row => {
          const tid = String(row.therapist_id);
          if (schedMap[tid]) {
            schedMap[tid][row.schedule_date as string] = {
              is_active: Boolean(row.is_active),
              start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
              end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
            };
          }
        });
        setSchedules(schedMap);
      }
    })();
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const updateDay = (therapistId: string, dateStr: string, patch: Partial<DaySchedule>) => {
    setSchedules(prev => {
      const current: DaySchedule = prev[therapistId]?.[dateStr] ?? {
        is_active: false,
        start_time: null,
        end_time: null,
      };
      return {
        ...prev,
        [therapistId]: {
          ...prev[therapistId],
          [dateStr]: {
            ...current,
            ...patch,
          },
        },
      };
    });
  };

  const storageRemove = (url: string) => {
    const marker = '/salon-images/';
    const idx = url.indexOf(marker);
    if (idx !== -1) supabase.storage.from('salon-images').remove([url.slice(idx + marker.length)]);
  };

  // announcement-images の public URL → バケット内パス（{salon_id}/{ts}.{ext}）。対象外URLは null。
  const announcementStoragePath = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const marker = '/announcement-images/';
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  };

  // 不要になったお知らせ画像を掃除（2026-07-12）。従来は削除・差し替えで旧画像が残置され
  // URL 直打ちで見え続けた。掃除は best-effort（失敗しても本体操作は成立・ログのみ）。
  const removeAnnouncementImage = async (url: string | null | undefined) => {
    const path = announcementStoragePath(url);
    if (!path) return;
    const { error } = await supabase.storage.from('announcement-images').remove([path]);
    if (error) console.error('[announcements] 旧画像の削除に失敗:', path, error.message);
  };

  const validateImageFile = (file: File): string | null => {
    if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
    return null;
  };

  // ─── ポップアップ画像（サロン詳細で左下・最大3枚・各画像に個別リンク・リロード毎に1枚ランダム表示）───
  // salon-images バケットを流用し、path を popup{n}_ プレフィックスで区別。URLは salons.popup_image_url / _2 / _3 に保存。
  const handlePopupImageUpload = async (slot: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }

    setUploadingPopupSlot(slot);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Number(salon.id)}/popup${slot + 1}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    if (uploadError) {
      showToast(`アップロードに失敗しました: ${uploadError.message}`);
      setUploadingPopupSlot(null); e.target.value = ''; return;
    }

    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('salons').update({ [POPUP_COLS[slot].img]: publicUrl }).eq('id', salon.id);

    setUploadingPopupSlot(null); e.target.value = '';
    if (dbErr) {
      showToast(`保存に失敗しました: ${dbErr.message}`);
      await supabase.storage.from('salon-images').remove([path]); return;
    }
    const oldUrl = popupImages[slot];
    setPopupImages(prev => prev.map((u, i) => (i === slot ? publicUrl : u)));
    if (oldUrl) storageRemove(oldUrl); // 旧画像を掃除（best-effort）
    revalidateSalon(salon.id);
    showToast('ポップアップ画像をアップロードしました');
  };

  const handlePopupImageDelete = async (slot: number) => {
    if (!salon) return;
    const url = popupImages[slot];
    if (!url) return;
    if (!window.confirm('この画像を削除しますか？')) return;
    const { error } = await supabase.from('salons').update({ [POPUP_COLS[slot].img]: null }).eq('id', salon.id);
    if (error) { showToast(`削除に失敗しました: ${error.message}`); return; }
    storageRemove(url);
    setPopupImages(prev => prev.map((u, i) => (i === slot ? null : u)));
    revalidateSalon(salon.id);
    showToast('画像を削除しました');
  };

  // テーマ（背景壁紙）だけを保存（店舗装飾タブ）。salons.theme を更新して即時反映。
  const handleThemeSave = async () => {
    if (!salon) return;
    setSavingTheme(true);
    const { error } = await supabase.from('salons').update({ theme: salonForm.theme ?? 'white' }).eq('id', salon.id);
    setSavingTheme(false);
    if (error) { showToast(`保存に失敗しました: ${error.message}`); return; }
    revalidateSalon(salon.id);
    showToast('テーマを保存しました');
  };

  const handlePopupSave = async () => {
    if (!salon) return;
    const anyImage = popupImages.some(Boolean);
    if (popupEnabled && !anyImage) { showToast('先に画像を1枚以上アップロードしてください'); return; }
    setSavingPopup(true);
    const update: Record<string, unknown> = { popup_enabled: popupEnabled };
    POPUP_COLS.forEach((c, i) => { update[c.link] = popupLinks[i].trim() || null; });
    const { error } = await supabase.from('salons').update(update).eq('id', salon.id);
    setSavingPopup(false);
    if (error) { showToast(`保存に失敗しました: ${error.message}`); return; }
    revalidateSalon(salon.id);
    showToast('保存しました');
  };

  // 新スロット追加（PC用画像）
  const handleAddSlot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }

    setUploadingNewSlot(true);
    const ext    = file.name.split('.').pop() ?? 'jpg';
    const path   = `${Number(salon.id)}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    if (uploadError) {
      showToast(`アップロードに失敗しました: ${uploadError.message}`);
      setUploadingNewSlot(false); e.target.value = ''; return;
    }

    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    const nextOrder = salonImages.length > 0 ? Math.max(...salonImages.map(i => i.display_order)) + 1 : 0;

    const { data: inserted, error: dbErr } = await supabase
      .from('salon_images')
      .insert({ salon_id: Number(salon.id), image_url: publicUrl, display_order: nextOrder })
      .select('id, image_url, mobile_image_url, display_order')
      .single();

    setUploadingNewSlot(false); e.target.value = '';
    if (dbErr || !inserted) {
      showToast(`DB保存に失敗しました: ${dbErr?.message ?? '不明なエラー'}`);
      await supabase.storage.from('salon-images').remove([path]); return;
    }
    setSalonImages(prev => [...prev, { ...inserted as SalonImage, mobile_image_url: null }]);
    if (salon) revalidateSalon(salon.id); // 成功時：トップのISRを即時更新
    showToast('画像スロットを追加しました');
  };

  // PC用画像を差し替え
  const handlePcImageReplace = async (imgId: string, oldUrl: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }

    setUploadingPcId(imgId);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Number(salon.id)}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    if (uploadError) {
      showToast(`アップロードに失敗しました: ${uploadError.message}`);
      setUploadingPcId(null); e.target.value = ''; return;
    }

    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('salon_images').update({ image_url: publicUrl }).eq('id', imgId);

    setUploadingPcId(null); e.target.value = '';
    if (dbErr) {
      showToast(`DB保存に失敗しました: ${dbErr.message}`);
      await supabase.storage.from('salon-images').remove([path]); return;
    }
    storageRemove(oldUrl);
    setSalonImages(prev => prev.map(img => img.id === imgId ? { ...img, image_url: publicUrl } : img));
    if (salon) revalidateSalon(salon.id);
    showToast('PC用画像を変更しました');
  };

  // スマホ用画像を追加/差し替え
  const handleMobileImageUpload = async (imgId: string, oldMobileUrl: string | null, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }

    setUploadingMobileId(imgId);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Number(salon.id)}/mobile_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    if (uploadError) {
      showToast(`アップロードに失敗しました: ${uploadError.message}`);
      setUploadingMobileId(null); e.target.value = ''; return;
    }

    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('salon_images').update({ mobile_image_url: publicUrl }).eq('id', imgId);

    setUploadingMobileId(null); e.target.value = '';
    if (dbErr) {
      showToast(`DB保存に失敗しました: ${dbErr.message}`);
      await supabase.storage.from('salon-images').remove([path]); return;
    }
    if (oldMobileUrl) storageRemove(oldMobileUrl);
    setSalonImages(prev => prev.map(img => img.id === imgId ? { ...img, mobile_image_url: publicUrl } : img));
    if (salon) revalidateSalon(salon.id);
    showToast('スマホ用画像をアップロードしました');
  };

  // スマホ用画像を削除
  const handleMobileImageDelete = async (imgId: string, mobileUrl: string) => {
    if (!window.confirm('スマホ用画像を削除しますか？')) return;
    storageRemove(mobileUrl);
    await supabase.from('salon_images').update({ mobile_image_url: null }).eq('id', imgId);
    setSalonImages(prev => prev.map(img => img.id === imgId ? { ...img, mobile_image_url: null } : img));
    if (salon) revalidateSalon(salon.id);
    showToast('スマホ用画像を削除しました');
  };

  // スロットごと削除（PC + スマホ両方）
  const handleImageDelete = async (id: string, imageUrl: string, mobileImageUrl: string | null) => {
    if (!window.confirm('この画像スロットを削除しますか？')) return;
    storageRemove(imageUrl);
    if (mobileImageUrl) storageRemove(mobileImageUrl);
    await supabase.from('salon_images').delete().eq('id', id);
    setSalonImages(prev => prev.filter(img => img.id !== id));
    if (salon) revalidateSalon(salon.id);
    showToast('画像スロットを削除しました');
  };

  const handleImageMove = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= salonImages.length) return;

    const reordered = [...salonImages];
    [reordered[index], reordered[swapIdx]] = [reordered[swapIdx], reordered[index]];
    const updated = reordered.map((img, i) => ({ ...img, display_order: i }));
    setSalonImages(updated);

    await Promise.all(
      updated.map(img =>
        supabase.from('salon_images').update({ display_order: img.display_order }).eq('id', img.id)
      )
    );
    if (salon) revalidateSalon(salon.id);
  };

  // クレジットカード決済：対応カードのチェックをトグル（payment_cards 配列で管理）。
  const togglePaymentCard = (slug: string) => {
    setSalonForm((p) => {
      const current = p.payment_cards ?? [];
      return {
        ...p,
        payment_cards: current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
      };
    });
  };

  // 支払い方法（店舗基本情報）：現金・クレカ・QR・電子マネーのチェックをトグル（payment_methods 配列で管理）。
  const togglePaymentMethod = (slug: string) => {
    setSalonForm((p) => {
      const current = p.payment_methods ?? [];
      return {
        ...p,
        payment_methods: current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
      };
    });
  };

  // 予約コース：行の追加・削除・各フィールド編集。
  const addBookingCourse = () => setBookingCourses((prev) => [...prev, { name: '', duration_min: '', price: '' }]);
  const removeBookingCourse = (index: number) => setBookingCourses((prev) => prev.filter((_, i) => i !== index));
  const updateBookingCourse = (index: number, patch: Partial<BookingCourseForm>) =>
    setBookingCourses((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  // 予約管理：ステータス変更（確定/キャンセル/新規に戻す）。成功時はローカルstateを書き換え。
  const handleBookingStatus = async (bookingId: string, nextStatus: 'new' | 'confirmed' | 'cancelled') => {
    setBookingBusyId(bookingId);
    const res = await updateBookingStatus(bookingId, nextStatus);
    setBookingBusyId(null);
    if (!res.ok) { showToast(res.error ?? 'ステータス変更に失敗しました'); return; }
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: nextStatus } : b)));
    showToast(nextStatus === 'confirmed' ? '予約を確定にしました' : nextStatus === 'cancelled' ? '予約をキャンセルにしました' : '予約を新規に戻しました');
  };

  // 予約管理：レコード削除（枠も解放される・取り消せないので確認）。成功時は一覧から除去。
  const handleBookingDelete = async (bookingId: string) => {
    if (!window.confirm('この予約を削除しますか？\nこの操作は取り消せません。')) return;
    setBookingBusyId(bookingId);
    const res = await deleteBooking(bookingId);
    setBookingBusyId(null);
    if (!res.ok) { showToast(res.error ?? '削除に失敗しました'); return; }
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    showToast('予約を削除しました');
  };

  const handleSalonSave = async () => {
    if (!salon) return;
    setSaving(true);

    // 公式サイトURLの検証・正規化：空欄は null。入力ありは http/https のみ許可（new URL でパース）。
    const raw = (salonForm.official_url ?? '').trim();
    let officialUrl: string | null = null;
    if (raw) {
      try {
        const u = new URL(raw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
        officialUrl = raw;
      } catch {
        setSaving(false);
        showToast('正しいURL（https://〜）を入力してください');
        return;
      }
    }

    // fukuX URL の検証・正規化：公式サイトURLと同じ扱い（空欄は null、http/https のみ許可）。
    const fukuxRaw = (salonForm.fukux_url ?? '').trim();
    let fukuxUrl: string | null = null;
    if (fukuxRaw) {
      try {
        const u = new URL(fukuxRaw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
        fukuxUrl = fukuxRaw;
      } catch {
        setSaving(false);
        showToast('正しいURL（https://〜）を入力してください');
        return;
      }
    }

    // クレカ決済URL：空欄は null。入力ありは http(s):// 始まりのみ許可（外部リンクなので簡易検証）。
    const payRaw = (salonForm.payment_url ?? '').trim();
    let paymentUrl: string | null = null;
    if (payRaw) {
      if (!/^https?:\/\//i.test(payRaw)) {
        setSaving(false);
        showToast('決済URLは http:// または https:// から始めてください');
        return;
      }
      paymentUrl = payRaw;
    }

    // ネット予約：受付ON時は通知先メール必須（簡易チェック＝@を含む程度）。空欄は null。
    const bookingEnabled = Boolean(salonForm.booking_enabled);
    const bookingEmail = (salonForm.booking_email ?? '').trim() || null;
    if (bookingEnabled) {
      if (!bookingEmail || !bookingEmail.includes('@')) {
        setSaving(false);
        showToast('ネット予約を受け付けるには、通知先メールアドレスを入力してください');
        return;
      }
    }

    // 予約コース：完全空行（名前も時間も空）は除外。登録意図のある行は name 必須＋所要時間=正の整数。
    const bookingCoursesClean: { name: string; duration_min: number; price: string }[] = [];
    for (const c of bookingCourses) {
      const name = c.name.trim();
      const durEmpty = c.duration_min === '' || c.duration_min === null;
      if (!name && durEmpty) continue; // 空行は無視
      if (!name) {
        setSaving(false);
        showToast('予約コース名を入力してください');
        return;
      }
      const dur = Number(c.duration_min);
      if (!Number.isInteger(dur) || dur <= 0) {
        setSaving(false);
        showToast(`予約コース「${name}」の所要時間は正の整数（分）で入力してください`);
        return;
      }
      bookingCoursesClean.push({ name, duration_min: dur, price: c.price.trim() });
    }

    const { error } = await supabase
      .from('salons')
      .update({
        courses: buildCoursesJson(courseGroups, otherItems),
        price: buildRepresentativePrice(courseGroups),
        hours: salonForm.hours,
        description: salonForm.description,
        appeal: salonForm.appeal,
        catchphrase: (salonForm.catchphrase ?? '').trim().slice(0, 30) || null,
        phone: salonForm.phone,
        address: salonForm.address,
        access: salonForm.access,
        closed_days: salonForm.closed_days,
        theme: salonForm.theme ?? 'white',
        official_url: officialUrl,
        fukux_url: fukuxUrl,
        payment_url: paymentUrl,
        payment_cards: salonForm.payment_cards ?? [],
        payment_methods: salonForm.payment_methods ?? [],
        booking_enabled: bookingEnabled,
        booking_email: bookingEmail,
        booking_courses: bookingCoursesClean,
      })
      .eq('id', salon.id);
    setSaving(false);
    if (!error && salon) revalidateSalon(salon.id); // 成功時：トップのISRを即時更新
    showToast(error ? '保存に失敗しました' : '保存しました');
  };

  const handleScheduleSave = async (therapistId: string) => {
    setSavingSchedule(therapistId);
    const rows = sevenDays.map(dateStr => {
      const s = schedules[therapistId]?.[dateStr] ?? { is_active: false, start_time: null, end_time: null };
      return {
        therapist_id: therapistId,
        schedule_date: dateStr,
        is_active: s.is_active,
        start_time: s.is_active ? s.start_time : null,
        end_time: s.is_active ? s.end_time : null,
      };
    });
    const { error } = await supabase
      .from('therapist_schedules')
      .upsert(rows, { onConflict: 'therapist_id,schedule_date' });
    setSavingSchedule(null);
    if (!error) {
      // 店舗ページ＋トップ（既存）に加え、当該セラピストの公開ページ /therapist/[id] も即時再検証。
      // これが無いと出勤表は revalidate=600 の時間経過まで古いキャッシュのまま固着する。
      if (salon) revalidateSalon(salon.id);
      revalidateTherapist(therapistId);
    }
    showToast(error ? '保存に失敗しました' : 'スケジュールを保存しました');
  };

  const handleTherapistAdd = async () => {
    if (!salon || !newTherapistName.trim()) return;
    setAddingTherapist(true);
    setAddError('');

    const { error } = await supabase.from('therapists').insert({
      salon_id:          salon.id,
      name:              newTherapistName.trim(),
      area:              salon.area ?? null,
      work_hours:        null,
      comment:           null,
      profile_image_url: null,
      profile_text:      null,
      age:               null,
      body_type:         null,
      is_new_face:       newTherapistIsNew,
      new_face_since:    newTherapistIsNew ? new Date().toISOString() : null,
    });

    if (error) {
      setAddError(
        error.code === '42501'
          ? 'RLSポリシーにより追加が拒否されました。Supabase ダッシュボードで therapists テーブルへの INSERT ポリシーを確認してください。'
          : `追加に失敗しました: ${error.message}`
      );
      setAddingTherapist(false);
      return;
    }

    // 一覧を再取得（既存フォームの未保存データは保持）
    const list = await fetchTherapistList(String(salon.id));
    setTherapists(list);

    const existingIds = new Set(Object.keys(therapistForms));
    const newForms: Record<string, Partial<Therapist>> = {};
    list.forEach((t) => {
      if (!existingIds.has(String(t.id))) {
        newForms[t.id] = {
          comment: t.comment,
          profile_image_url: t.profile_image_url, age: t.age,
          body_type: t.body_type, profile_text: t.profile_text,
        };
      }
    });
    setTherapistForms(prev => ({ ...prev, ...newForms }));

    setNewTherapistName('');
    setNewTherapistIsNew(false);
    setAddingTherapist(false);
    if (salon) revalidateSalon(salon.id);
    showToast('セラピストを追加しました');
  };

  const handleTherapistDelete = async (id: string, name: string | null) => {
    const displayName = name ?? 'このセラピスト';
    if (!window.confirm(`「${displayName}」を削除しますか？\nこの操作は取り消せません。`)) return;
    if (!salon) return;

    // 2026-07-12: クライアント直 delete → server action 化。
    // 直 delete では therapist-photos / diary-images の画像が残置され URL 直打ちで
    // 見え続けるため、行削除成功後に storage も掃除する（fukuX の運営削除と同方針）。
    setDeletingTherapist(id);
    let res: Awaited<ReturnType<typeof deleteTherapistWithCleanup>>;
    try {
      res = await deleteTherapistWithCleanup({ therapistId: id, salonId: Number(salon.id) });
    } catch {
      res = { ok: false, error: '通信に失敗しました。時間をおいて再度お試しください' };
    } finally {
      setDeletingTherapist(null);
    }

    if (!res.ok) {
      console.error('[delete] error:', res.error);
      showToast(`削除に失敗しました: ${res.error}`);
      return;
    }

    // 削除後にDBから再フェッチして確実にUI反映
    if (salon) {
      const refreshed = await fetchTherapistList(String(salon.id));
      console.log('[delete] refreshed list length=', refreshed.length);
      setTherapists(refreshed);
    }

    const sid = String(id);
    setTherapistForms(prev => { const n = { ...prev }; delete n[sid]; return n; });
    setSchedules(prev => { const n = { ...prev }; delete n[sid]; return n; });
    setExpandedSections(prev => {
      const n = new Set(prev);
      n.delete(`${sid}-schedule`);
      return n;
    });
    if (salon) revalidateSalon(salon.id);
    showToast('セラピストを削除しました');
  };

  // ── キャスト招待（本人化） ──
  const refreshTherapists = async () => {
    if (!salon) return;
    setTherapists(await fetchTherapistList(String(salon.id)));
  };

  const handleInviteCast = async (therapistId: string) => {
    if (!salon) return;
    const email = (inviteEmails[therapistId] ?? '').trim();
    if (!email) { showToast('招待先のメールアドレスを入力してください'); return; }
    setInviteBusyId(therapistId);
    const res = await inviteCast({ therapistId, salonId: Number(salon.id), email });
    setInviteBusyId(null);
    if (!res.ok) { showToast(res.error); return; }
    setInviteEmails(prev => ({ ...prev, [therapistId]: '' }));
    await refreshTherapists();
    showToast(res.warning ?? '招待メールを送信しました');
  };

  const handleResendInvite = async (therapistId: string) => {
    if (!salon) return;
    setInviteBusyId(therapistId);
    const res = await resendCastInvite({ therapistId, salonId: Number(salon.id) });
    setInviteBusyId(null);
    if (!res.ok) { showToast(res.error); return; }
    showToast(res.warning ?? '招待メールを再送しました');
  };

  const handleCancelInvite = async (therapistId: string, email: string) => {
    if (!salon) return;
    if (!window.confirm(`招待を取り消します（${email}）。本人未ログインの仮登録は削除されますが、fukuX 利用中のアカウントは保持されます。\nよろしいですか？`)) return;
    setInviteBusyId(therapistId);
    const res = await cancelCastInvite({ therapistId, salonId: Number(salon.id) });
    setInviteBusyId(null);
    if (!res.ok) { showToast(res.error); return; }
    await refreshTherapists();
    showToast(res.warning ?? '招待を取り消しました');
  };

  const handleUnlinkCast = async (therapistId: string) => {
    if (!salon) return;
    if (!window.confirm('このセラピストの本人ログイン紐付けを解除しますか？\n（Authアカウント自体は削除されません。在籍状態にも影響しません）')) return;
    setInviteBusyId(therapistId);
    const res = await unlinkCast({ therapistId, salonId: Number(salon.id) });
    setInviteBusyId(null);
    if (!res.ok) { showToast(res.error); return; }
    await refreshTherapists();
    showToast('本人ログインの紐付けを解除しました');
  };

  const handleAvailableNowSave = async () => {
    setSavingAvailable(true);
    // 「今すぐ」を付けられるのは「本日出勤中」かつ「チェック済み」のセラピストのみ。最大3名。
    // 出勤外・期限切れの古いフラグはここで確実にfalseへリセットする（3名制限の抜け穴対策）。
    // 排他制御：キャスト枠がライブのセラピストはオーナーが選べない（UIで無効化済み）。
    // 念のためここでも liveIds から除外し、かつ一括リセットの対象からも外して
    // オーナー枠（is_available_now / available_until）を一切触らない（キャスト枠列には絶対書き込まない）。
    const now = new Date();
    const liveIds = new Set(
      onDutyTherapists
        .filter(t => !isCastLiveRow(t))
        .map(t => String(t.id))
        .filter(sid => availableNow[sid])
        .slice(0, 3)
    );
    const availableUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    for (const t of therapists) {
      // キャスト本人が受付中の枠は触らない（オーナーは相手の枠を上書き・解除しない）。
      if (isCastLiveRow(t, now)) continue;
      const sid = String(t.id);
      const isLive = liveIds.has(sid);
      // 既にオーナー枠がライブだった子は available_until を維持（保存のたびの巻き戻し防止）。
      // 新規にオンにする子だけ now+30分。保存前の判定は state（t）の値で行う。
      const until = isLive
        ? (isAvailableNowLive(t) && t.available_until ? t.available_until : availableUntil)
        : null;
      await supabase
        .from('therapists')
        .update({
          is_available_now: isLive,
          available_until: until,
        })
        .eq('id', t.id);
    }
    if (salon) {
      const refreshed = await fetchTherapistList(String(salon.id));
      setTherapists(refreshed);
      // ローカルのチェック状態もDBに合わせて同期（出勤外・期限切れの取りこぼしを解除）
      const sync: Record<string, boolean> = {};
      refreshed.forEach(t => { sync[String(t.id)] = isAvailableNowLive(t); });
      setAvailableNow(sync);
    }
    setSavingAvailable(false);
    if (salon) revalidateSalon(salon.id);
    showToast('「今すぐ」設定を保存しました');
  };

  // 写メ日記：投稿セラピストを選択（フォームをリセット）
  const selectDiaryTherapist = (id: string) => {
    setDiaryTherapistId(id);
    setDiaryImage(null);
    setDiaryTitle('');
    setDiaryBody('');
  };

  // 写メ日記：画像アップロード（1枚・diary-images バケット）
  const handleDiaryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !diaryTherapistId) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }

    setDiaryUploading(true);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${diaryTherapistId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('diary-images').upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    if (error) {
      showToast(`アップロードに失敗しました: ${error.message}`);
      setDiaryUploading(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('diary-images').getPublicUrl(path);
    setDiaryImage(publicUrl);
    setDiaryUploading(false); e.target.value = '';
  };

  // 写メ日記：投稿
  const handleDiaryPost = async () => {
    if (!diaryTherapistId || !salon) return;
    if (!diaryImage && !diaryTitle.trim() && !diaryBody.trim()) {
      showToast('画像・タイトル・本文のいずれかを入力してください');
      return;
    }
    setDiaryPosting(true);
    const { error } = await supabase.from('diary_posts').insert({
      therapist_id: Number(diaryTherapistId),
      salon_id:     Number(salon.id),
      images:       diaryImage ? [diaryImage] : [],
      title:        diaryTitle.trim() || null,
      content:      diaryBody.trim() || null,
    });
    setDiaryPosting(false);
    if (error) {
      showToast(`投稿に失敗しました: ${error.message}`);
      return;
    }
    setDiaryImage(null);
    setDiaryTitle('');
    setDiaryBody('');
    setDiaryReload((n) => n + 1);
    if (salon) revalidateSalon(salon.id);
    showToast('写メ日記を投稿しました');
  };

  // クーポン：フォーム再構築（一覧取得後の同期用）
  const rebuildCouponForms = (list: Coupon[]) => {
    const map: Record<string, Partial<Coupon>> = {};
    list.forEach(c => {
      map[c.id] = {
        title: c.title, discount: c.discount, conditions: c.conditions,
        valid_until: c.valid_until, is_published: c.is_published, color: c.color,
      };
    });
    setCouponForms(map);
  };

  // クーポン：新規追加（sort_order は既存最大+1で自動採番）
  const handleCouponAdd = async () => {
    if (!salon || !newCoupon.title.trim() || !newCoupon.discount.trim()) return;
    setAddingCoupon(true);
    const nextOrder = coupons.length > 0 ? Math.max(...coupons.map(c => c.sort_order)) + 1 : 0;
    const { error } = await supabase.from('coupons').insert({
      salon_id:     Number(salon.id),
      title:        newCoupon.title.trim(),
      discount:     newCoupon.discount.trim(),
      conditions:   newCoupon.conditions.trim() || null,
      valid_until:  newCoupon.valid_until || null,
      is_published: newCoupon.is_published,
      color:        newCoupon.color,
      sort_order:   nextOrder,
    });
    if (error) {
      setAddingCoupon(false);
      showToast(
        error.code === '42501'
          ? 'RLSポリシーにより追加が拒否されました。Supabaseでcouponsのオーナー用INSERTポリシーを確認してください。'
          : `追加に失敗しました: ${error.message}`
      );
      return;
    }
    const list = await fetchCouponList(Number(salon.id));
    setCoupons(list);
    rebuildCouponForms(list);
    setNewCoupon({ title: '', discount: '', conditions: '', valid_until: '', is_published: true, color: DEFAULT_COUPON_COLOR_KEY });
    setAddingCoupon(false);
    if (salon) revalidateSalon(salon.id);
    showToast('クーポンを追加しました');
  };

  // クーポン：編集内容を保存
  const handleCouponSave = async (id: string) => {
    const form = couponForms[id];
    if (!form) return;
    if (!form.title?.trim() || !form.discount?.trim()) {
      showToast('タイトルと割引内容は必須です');
      return;
    }
    setSavingCoupon(id);
    const conditions = ((form.conditions ?? '') as string).trim() || null;
    const valid_until = form.valid_until || null;
    const is_published = form.is_published ?? true;
    const color = (form.color as string) || DEFAULT_COUPON_COLOR_KEY;
    const { error } = await supabase.from('coupons').update({
      title:        form.title.trim(),
      discount:     form.discount.trim(),
      conditions,
      valid_until,
      is_published,
      color,
    }).eq('id', id);
    setSavingCoupon(null);
    if (error) { showToast(`保存に失敗しました: ${error.message}`); return; }
    setCoupons(prev => prev.map(c => c.id === id
      ? { ...c, title: form.title!.trim(), discount: form.discount!.trim(), conditions, valid_until, is_published, color }
      : c));
    if (salon) revalidateSalon(salon.id);
    showToast('クーポンを保存しました');
  };

  // クーポン：公開/非公開のワンタップ切替（即時保存）
  const handleCouponTogglePublish = async (id: string) => {
    const target = coupons.find(c => c.id === id);
    if (!target) return;
    const next = !target.is_published;
    const { error } = await supabase.from('coupons').update({ is_published: next }).eq('id', id);
    if (error) { showToast(`変更に失敗しました: ${error.message}`); return; }
    setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_published: next } : c));
    setCouponForms(prev => ({ ...prev, [id]: { ...prev[id], is_published: next } }));
    if (salon) revalidateSalon(salon.id);
    showToast(next ? '公開にしました' : '非公開にしました');
  };

  // クーポン：削除（確認あり）
  const handleCouponDelete = async (id: string) => {
    if (!window.confirm('このクーポンを削除しますか？\nこの操作は取り消せません。')) return;
    setDeletingCoupon(id);
    const { data: deleted, error } = await supabase.from('coupons').delete().eq('id', id).select('id');
    setDeletingCoupon(null);
    if (error) { showToast(`削除に失敗しました: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) {
      showToast('削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    setCoupons(prev => prev.filter(c => c.id !== id));
    setCouponForms(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (salon) revalidateSalon(salon.id);
    showToast('クーポンを削除しました');
  };

  // お知らせ：画像アップロード（新規フォーム用。announcement-images バケット・1枚）
  const handleNewAnnouncementImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }
    setUploadingNewAnnouncementImage(true);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Number(salon.id)}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('announcement-images').upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    if (error) {
      showToast(`アップロードに失敗しました: ${error.message}`);
      setUploadingNewAnnouncementImage(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('announcement-images').getPublicUrl(path);
    // 選び直し：直前にアップロード済みの未保存画像（フォーム内のみ参照）は掃除してから差し替える。
    const prevUnsavedUrl = newAnnouncement.image_url ?? null;
    if (prevUnsavedUrl) removeAnnouncementImage(prevUnsavedUrl);
    setNewAnnouncement(p => ({ ...p, image_url: publicUrl }));
    setUploadingNewAnnouncementImage(false); e.target.value = '';
  };

  // お知らせ：画像アップロード（編集フォーム用。保存ボタンで image_url が確定保存される）
  const handleAnnouncementImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }
    setUploadingAnnouncementImageId(id);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Number(salon.id)}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('announcement-images').upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    if (error) {
      showToast(`アップロードに失敗しました: ${error.message}`);
      setUploadingAnnouncementImageId(null); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('announcement-images').getPublicUrl(path);
    // 選び直し：フォーム内の画像が DB 未保存のセッション内アップロードなら掃除してから差し替える
    // （DB 保存済みの画像は保存成功時に handleAnnouncementSave 側で掃除する）。
    const prevFormUrl = (announcementForms[id]?.image_url as string | null) ?? null;
    const dbUrl = announcements.find(a => a.id === id)?.image_url ?? null;
    if (prevFormUrl && prevFormUrl !== dbUrl) removeAnnouncementImage(prevFormUrl);
    setAnnouncementForms(prev => ({ ...prev, [id]: { ...prev[id], image_url: publicUrl } }));
    setUploadingAnnouncementImageId(null); e.target.value = '';
  };

  // お知らせ：フォーム再構築（一覧取得後の同期用）
  const rebuildAnnouncementForms = (list: Announcement[]) => {
    const map: Record<string, Partial<Announcement>> = {};
    list.forEach(a => {
      map[a.id] = { title: a.title, content: a.content, is_published: a.is_published, image_url: a.image_url };
    });
    setAnnouncementForms(map);
  };

  // お知らせ→fukuX 同時投稿（best-effort）。日記クロスポスト（CastDiary.handleDiaryPost）と同一の
  // 本文整形・INSERTカラム（author_profile_id/body/images/replies_disabled）を踏襲。
  // 戻り値: 投稿しなかった（チェックOFF/未連携/中身空）or 成功 → true、送信を試みて失敗 → false。
  // 呼び出し側はこの真偽で最終トーストを合成し、失敗してもお知らせ本体は巻き戻さない。
  const maybeCrosspostAnnouncementToX = async (
    enabled: boolean,
    noReplies: boolean,
    title: string,
    content: string | null,
    imageUrl: string | null,
  ): Promise<boolean> => {
    if (!enabled || !xShopProfileId) return true; // 同時投稿しない＝成功扱い
    const titlePart = (title ?? '').trim();
    const contentPart = (content ?? '').trim();
    // body = タイトル + 空行 + 本文（片方のみ・両方空も許容）。日記側と同一ルール。
    const body = titlePart && contentPart ? `${titlePart}\n\n${contentPart}` : (titlePart || contentPart);
    const xImages = imageUrl ? [imageUrl] : [];
    if (body.length === 0 && xImages.length === 0) return true; // 投稿する中身が無い
    // お知らせ経路のみ：fukuX本文上限(500字)を超える場合は先頭497字＋「…」(1字)=計498字にクランプ。
    // 500字ちょうどはそのまま／501字以上で切り詰め（日記経路は従来どおりクランプ無し・不変）。
    const X_BODY_MAX = 500;
    const clampedBody = body.length > X_BODY_MAX ? `${body.slice(0, X_BODY_MAX - 3)}…` : body;
    // 同じ認証クライアントで insert＝x_posts の INSERT ポリシー(author_profile_id = x_my_profile_id())を
    // 正規に通る（オーナー唯一のプロフィール＝shop プロフィール）。service_role 不使用。
    const { error: xErr } = await supabase.from('x_posts').insert({
      author_profile_id: xShopProfileId,
      body: clampedBody || null,
      images: xImages,
      replies_disabled: noReplies,
    });
    if (xErr) {
      console.error('crosspost announcement to x_posts failed:', xErr); // 握りつぶさずログ
      return false;
    }
    return true;
  };

  // お知らせ：新規追加（published_at は DB の default now() で自動設定）
  const handleAnnouncementAdd = async () => {
    if (!salon || !newAnnouncement.title.trim() || !newAnnouncement.content.trim()) return;
    setAddingAnnouncement(true);
    // 同時投稿用に確定値を控える（保存後に state をリセットするため）。
    const title = newAnnouncement.title.trim();
    const content = newAnnouncement.content.trim();
    const imageUrl = newAnnouncement.image_url || null;
    const { error } = await supabase.from('announcements').insert({
      salon_id:     Number(salon.id),
      title,
      content,
      is_published: newAnnouncement.is_published,
      image_url:    imageUrl,
    });
    if (error) {
      setAddingAnnouncement(false);
      showToast(
        error.code === '42501'
          ? 'RLSポリシーにより追加が拒否されました。Supabaseでannouncementsのオーナー用INSERTポリシーを確認してください。'
          : `追加に失敗しました: ${error.message}`
      );
      return;
    }
    const list = await fetchAnnouncementList(Number(salon.id));
    setAnnouncements(list);
    rebuildAnnouncementForms(list);
    // お知らせ保存成功後のみ fukuX 同時投稿（新規投稿時）。失敗しても本体は成功のまま。
    const xOk = await maybeCrosspostAnnouncementToX(newAnnCrosspostX, newAnnCrosspostNoReplies, title, content, imageUrl);
    setNewAnnouncement({ title: '', content: '', is_published: true, image_url: null });
    setNewAnnCrosspostX(false);
    setNewAnnCrosspostNoReplies(false);
    setAddingAnnouncement(false);
    if (salon) revalidateSalon(salon.id);
    showToast(xOk ? 'お知らせを追加しました' : 'お知らせを追加しました（fukuX投稿は失敗しました）');
  };

  // お知らせ：編集内容を保存
  const handleAnnouncementSave = async (id: string) => {
    const form = announcementForms[id];
    if (!form) return;
    if (!form.title?.trim() || !((form.content ?? '') as string).trim()) {
      showToast('タイトルと本文は必須です');
      return;
    }
    setSavingAnnouncement(id);
    const content = ((form.content ?? '') as string).trim();
    const is_published = form.is_published ?? true;
    const image_url = (form.image_url as string | null) ?? null;
    const { error } = await supabase.from('announcements').update({
      title: form.title.trim(),
      content,
      is_published,
      image_url,
    }).eq('id', id);
    setSavingAnnouncement(null);
    if (error) { showToast(`保存に失敗しました: ${error.message}`); return; }
    // 差し替え・画像なしへの変更で不要になった旧画像を掃除（保存成功後・best-effort）。
    const prevImageUrl = announcements.find(a => a.id === id)?.image_url ?? null;
    if (prevImageUrl && prevImageUrl !== image_url) removeAnnouncementImage(prevImageUrl);
    setAnnouncements(prev => prev.map(a => a.id === id
      ? { ...a, title: form.title!.trim(), content, is_published, image_url }
      : a));
    if (salon) revalidateSalon(salon.id);
    showToast('お知らせを保存しました');
  };

  // お知らせ：公開/非公開のワンタップ切替（即時保存）
  const handleAnnouncementTogglePublish = async (id: string) => {
    const target = announcements.find(a => a.id === id);
    if (!target) return;
    const next = !target.is_published;
    const { error } = await supabase.from('announcements').update({ is_published: next }).eq('id', id);
    if (error) { showToast(`変更に失敗しました: ${error.message}`); return; }
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_published: next } : a));
    setAnnouncementForms(prev => ({ ...prev, [id]: { ...prev[id], is_published: next } }));
    if (salon) revalidateSalon(salon.id);
    showToast(next ? '公開にしました' : '非公開にしました');
  };

  // お知らせ：再投稿ボタン → カスタム確認モーダルを開く（チェックは毎回OFFから）。
  // 標準 confirm() ではチェックを置けないため、モーダルで確認＋同時投稿オプションを提示する。
  const handleAnnouncementRepost = (id: string) => {
    setRepostCrosspostX(false);
    setRepostCrosspostNoReplies(false);
    setRepostModalId(id);
  };

  // お知らせ：再投稿の実行（モーダルのOK）。published_at を現在時刻に更新し一覧の先頭へ。
  // 元の投稿日時は上書きされ、新しい投稿として扱われる。再投稿時のみ fukuX 同時投稿（best-effort）。
  const confirmAnnouncementRepost = async () => {
    const id = repostModalId;
    if (!id) return;
    const target = announcements.find(a => a.id === id);
    setRepostingAnnouncement(id);
    const newIso = new Date().toISOString();
    const { error } = await supabase.from('announcements').update({ published_at: newIso }).eq('id', id);
    if (error) { setRepostingAnnouncement(null); showToast(`再投稿に失敗しました: ${error.message}`); return; }
    // 同じ行の published_at を更新し、新しい順で再ソート（元の古い投稿は残らない）
    setAnnouncements(prev =>
      prev
        .map(a => a.id === id ? { ...a, published_at: newIso } : a)
        .sort((x, y) => new Date(y.published_at).getTime() - new Date(x.published_at).getTime())
    );
    // 再投稿成功後のみ fukuX 同時投稿。失敗しても再投稿は成功のまま。
    const xOk = target
      ? await maybeCrosspostAnnouncementToX(repostCrosspostX, repostCrosspostNoReplies, target.title, target.content, target.image_url)
      : true;
    setRepostingAnnouncement(null);
    setRepostModalId(null);
    if (salon) revalidateSalon(salon.id);
    showToast(xOk ? '再投稿しました' : '再投稿しました（fukuX投稿は失敗しました）');
  };

  // お知らせ→fukuX 同時投稿チェックの共通UI（新規フォーム・再投稿モーダルで共用）。
  // 連携済み（xShopProfileId あり）: 「fukuX にも投稿する」活性。ON時のみ「リプライできないようにする」を表示。
  // 未連携: チェックを disabled＋opacity-50 で薄表示し、下に連携を促す注記を添える（日記側の条件レンダリング準拠）。
  const renderCrosspostChecks = (
    enabled: boolean,
    setEnabled: (v: boolean) => void,
    noReplies: boolean,
    setNoReplies: (v: boolean) => void,
  ) => (
    <div className="space-y-2 pt-0.5">
      <label className={`flex items-center gap-2 select-none ${xShopProfileId ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
        <input
          type="checkbox"
          disabled={!xShopProfileId}
          checked={enabled}
          onChange={(e) => { const on = e.target.checked; setEnabled(on); if (!on) setNoReplies(false); }}
          className="w-4 h-4 accent-pink-500 flex-shrink-0"
        />
        <span className="text-xs font-bold text-slate-600">fukuX にも投稿する</span>
      </label>
      {!xShopProfileId && (
        <p className="text-[10px] text-slate-400 pl-6">fukuX店舗アカウントと連携すると同時投稿できます</p>
      )}
      {xShopProfileId && enabled && (
        <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
          <input
            type="checkbox"
            checked={noReplies}
            onChange={(e) => setNoReplies(e.target.checked)}
            className="w-4 h-4 accent-pink-500 flex-shrink-0"
          />
          <span className="text-xs font-bold text-slate-600">リプライできないようにする</span>
        </label>
      )}
    </div>
  );

  // お知らせ：削除（確認あり）
  const handleAnnouncementDelete = async (id: string) => {
    if (!window.confirm('このお知らせを削除しますか？\nこの操作は取り消せません。')) return;
    // 掃除対象の画像URLを行削除前に控える（行削除成功後に best-effort で掃除）。
    const oldImageUrl = announcements.find(a => a.id === id)?.image_url ?? null;
    setDeletingAnnouncement(id);
    const { data: deleted, error } = await supabase.from('announcements').delete().eq('id', id).select('id');
    setDeletingAnnouncement(null);
    if (error) { showToast(`削除に失敗しました: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) {
      showToast('削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    removeAnnouncementImage(oldImageUrl);
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    setAnnouncementForms(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (salon) revalidateSalon(salon.id);
    showToast('お知らせを削除しました');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
  const textareaClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none';
  const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
  const saveBtn = 'px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50';

  if (loadError) {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-500 text-sm">{loadError}</p>
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50/30">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <header className="border-b border-slate-100">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-base font-black text-slate-800 tracking-wide">マイページ</h1>
            <div className="flex items-center gap-4">
              <Link href={salon ? `/salon/${salon.id}` : '/'} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-pink-600 font-medium transition-colors">
                サイトを見る
              </Link>
              <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors">
                ログアウト
              </button>
            </div>
          </div>
        </header>

        {/* タブナビゲーション（アイコン＋短縮ラベルのチップ。横に並びきらなければ折り返す） */}
        <div className="max-w-2xl mx-auto px-3 py-2 flex flex-wrap justify-center gap-1.5">
          {([
            ['salon',     '店舗'],
            ['popup',     '店舗装飾'],
            ['schedule',  '出勤'],
            ['available', '今すぐ'],
            ['profile',   'セラピスト'],
            ['diary',     '日記'],
            ['coupon',    'クーポン'],
            ['news',      'お知らせ'],
            ['vipletter', 'VIPレター'],
            ['booking',   'ネット予約'],
            ['jobs',      '求人'],
            ['support',   '運営事務局'],
          ] as const)
            // 求人タブはフクエスワーク掲載（jobs_enabled）契約店のみ表示。
            .filter(([key]) => key !== 'jobs' || Boolean(salon?.jobs_enabled))
            .map(([key, label]) => {
            const selected = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                aria-pressed={selected}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                  selected
                    ? 'bg-pink-50 text-pink-600 border-pink-300'
                    : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                }`}
              >
                {tabIcon(key)}
                {label}
                {/* 「運営から」タブ: 未読お知らせ件数の赤バッジ（/admin 求人タブのバッジと同型） */}
                {key === 'support' && supportUnread > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-pink-500 text-white text-[9px] font-black leading-none">
                    {supportUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── 店名（最上部・独立ブロック） ── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 text-center">
          <h2
            className="font-black text-slate-800 whitespace-nowrap overflow-hidden"
            style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis' }}
          >
            {salonForm.name ?? ''}
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">※ 店舗名の変更は管理者のみ行えます。変更が必要な場合はお問い合わせください。</p>
        </div>

        {/* ── サロン情報編集 ── */}
        <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 ${activeTab === 'salon' ? '' : 'hidden'}`}>
          <h2 className="text-sm font-black text-slate-700">店舗情報の編集</h2>


          <div>
            <label className={labelClass}>コースメニュー</label>
            <div className="space-y-3">
              {courseGroups.map((group, gi) => (
                <div key={gi} className="rounded-2xl border border-pink-100 bg-pink-50/20 p-3 space-y-2">
                  {/* コース名 */}
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 px-3 py-2 rounded-xl border border-pink-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 font-bold placeholder:font-normal"
                      placeholder="コース名（例: アロマリラクゼーション）"
                      value={group.name}
                      onChange={(e) => setCourseGroups(prev => prev.map((g, i) => i === gi ? { ...g, name: e.target.value } : g))}
                    />
                    <button
                      type="button"
                      onClick={() => setCourseGroups(prev => prev.filter((_, i) => i !== gi))}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-400 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors flex-shrink-0"
                    >
                      このコースを削除
                    </button>
                  </div>
                  {/* 時間・金額の行 */}
                  <div className="space-y-1.5 pl-1">
                    {group.items.map((item, ii) => (
                      <div key={ii} className="flex items-center gap-1.5 w-full">
                        <input
                          type="number"
                          min={0}
                          placeholder="60"
                          value={item.duration}
                          onChange={(e) => setCourseGroups(prev => prev.map((g, gi2) => gi2 === gi ? { ...g, items: g.items.map((it, ii2) => ii2 === ii ? { ...it, duration: e.target.value } : it) } : g))}
                          className="w-16 flex-shrink-0 px-2 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 text-center"
                        />
                        <span className="text-xs text-slate-500 flex-shrink-0">分 / ¥</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="8000"
                          value={item.price}
                          onChange={(e) => setCourseGroups(prev => prev.map((g, gi2) => gi2 === gi ? { ...g, items: g.items.map((it, ii2) => ii2 === ii ? { ...it, price: e.target.value } : it) } : g))}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                        />
                        <span className="text-xs text-slate-500 flex-shrink-0">円</span>
                        {group.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setCourseGroups(prev => prev.map((g, gi2) => gi2 === gi ? { ...g, items: g.items.filter((_, ii2) => ii2 !== ii) } : g))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-rose-400 hover:border-rose-200 text-sm font-bold transition-colors flex-shrink-0"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCourseGroups(prev => prev.map((g, i) => i === gi ? { ...g, items: [...g.items, { duration: '', price: '' }] } : g))}
                    className="text-xs font-bold text-pink-500 hover:text-pink-600 transition-colors pl-1"
                  >
                    + 時間を追加
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCourseGroups(prev => [...prev, { name: '', items: [{ duration: '', price: '' }] }])}
              className="mt-3 text-xs font-bold text-pink-500 hover:text-pink-600 transition-colors"
            >
              + コースを追加
            </button>
            {/* その他メニュー追加 */}
            <div className="mt-4 rounded-2xl border border-pink-100 bg-pink-50/20 p-3 space-y-2">
              <p className="text-xs font-bold text-slate-600">その他メニュー追加</p>
              <div className="space-y-1.5">
                {otherItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 w-full">
                    <input
                      type="text"
                      placeholder="メニュー名（例：延長30分）"
                      value={item.label}
                      onChange={(e) => setOtherItems(prev => prev.map((it, ii) => ii === i ? { ...it, label: e.target.value } : it))}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                    />
                    <span className="text-xs text-slate-500 flex-shrink-0">/ ¥</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="料金"
                      value={item.price}
                      onChange={(e) => setOtherItems(prev => prev.map((it, ii) => ii === i ? { ...it, price: e.target.value } : it))}
                      className="w-20 flex-shrink-0 min-w-0 px-2 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                    />
                    <span className="text-xs text-slate-500 flex-shrink-0">円</span>
                    {otherItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setOtherItems(prev => prev.filter((_, ii) => ii !== i))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-rose-400 hover:border-rose-200 text-sm font-bold transition-colors flex-shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOtherItems(prev => [...prev, { label: '', price: '' }])}
                className="text-xs font-bold text-pink-500 hover:text-pink-600 transition-colors"
              >
                + その他メニューを追加
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>営業時間</label>
            <div className="flex gap-2">
              <input className={inputClass} value={salonForm.hours ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, hours: e.target.value }))} />
              <TimeRangePicker value={salonForm.hours ?? ''} onChange={(v) => setSalonForm((p) => ({ ...p, hours: v }))} />
            </div>
          </div>
          <div>
            <label className={labelClass}>定休日</label>
            <input className={inputClass} value={salonForm.closed_days ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, closed_days: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>電話番号</label>
            <input className={inputClass} value={salonForm.phone ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>住所</label>
            <input className={inputClass} value={salonForm.address ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, address: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>アクセス</label>
            <input className={inputClass} value={salonForm.access ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, access: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>公式サイトURL（任意）</label>
            <input
              type="url"
              placeholder="https://example.com"
              className={inputClass}
              value={salonForm.official_url ?? ''}
              onChange={(e) => setSalonForm((p) => ({ ...p, official_url: e.target.value }))}
            />
            <p className="text-[10px] text-slate-400 mt-1">https:// から始まる正しいURLを入力してください。空欄なら表示されません。</p>
          </div>
          <div>
            <label className={labelClass}>fukuX URL（任意）</label>
            <input
              type="url"
              placeholder="https://fukues.com/x/..."
              className={inputClass}
              value={salonForm.fukux_url ?? ''}
              onChange={(e) => setSalonForm((p) => ({ ...p, fukux_url: e.target.value }))}
            />
            <p className="text-[10px] text-slate-400 mt-1">https:// から始まる正しいURLを入力してください。空欄なら表示されません。</p>
          </div>
          {/* ── 支払い方法（店舗基本情報に表示） ── */}
          <div>
            <label className={labelClass}>支払い方法</label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHOD_OPTIONS.map((m) => {
                const checked = (salonForm.payment_methods ?? []).includes(m.slug);
                return (
                  <label
                    key={m.slug}
                    className={`flex items-center gap-1.5 text-xs font-bold rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${
                      checked
                        ? 'border-pink-300 bg-pink-50 text-pink-600'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => togglePaymentMethod(m.slug)} className="accent-pink-500" />
                    {m.label}
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">店舗ページの「店舗基本情報」に表示されます。未選択なら表示されません。</p>
          </div>
          {/* ── クレジットカード決済（外部リンク・対応カード選択） ── */}
          <div>
            <label className={labelClass}>クレジットカード決済URL（任意）</label>
            <input
              type="url"
              placeholder="https://example.com/pay"
              className={inputClass}
              value={salonForm.payment_url ?? ''}
              onChange={(e) => setSalonForm((p) => ({ ...p, payment_url: e.target.value }))}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              他社の決済ページURLを設定すると、料金ページに「クレジットカード決済」欄が表示されます。空欄なら表示されません。フクエスは決済処理には関与しません。
            </p>
            <div className="mt-3">
              <p className="text-[11px] font-bold text-slate-500 mb-1.5">対応カードブランド</p>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_CARD_OPTIONS.map((card) => {
                  const checked = (salonForm.payment_cards ?? []).includes(card.slug);
                  return (
                    <label
                      key={card.slug}
                      className={`flex items-center gap-1.5 text-xs font-bold rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${
                        checked
                          ? 'border-pink-300 bg-pink-50 text-pink-600'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePaymentCard(card.slug)}
                        className="accent-pink-500"
                      />
                      {card.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div>
            <label className={labelClass}>キャッチフレーズ</label>
            <p className="mb-1 text-[11px] text-slate-400">TOP・地域ページの店舗カードに表示されます（最大30文字）。</p>
            <input
              type="text"
              maxLength={30}
              className={inputClass}
              placeholder="例：癒しと非日常を、あなたに。"
              value={salonForm.catchphrase ?? ''}
              onChange={(e) => setSalonForm((prev) => ({ ...prev, catchphrase: e.target.value.slice(0, 30) }))}
            />
            <p className="mt-0.5 text-right text-[10px] text-slate-400">{(salonForm.catchphrase ?? '').length}/30</p>
          </div>

          <div>
            <label className={labelClass}>店舗紹介</label>
            <textarea rows={6} className={textareaClass} value={salonForm.description ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, description: e.target.value }))} />
          </div>

          {/* ── サロン画像 ── */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>店舗画像（最大3枚）</label>
              <span className="text-[10px] text-slate-400">{salonImages.length} / 3</span>
            </div>

            {/* 推奨サイズは画像が0枚でも分かるよう常時表示（PC・スマホ両方）。 */}
            <p className="text-[10px] text-slate-400 -mt-1">
              PC用 推奨 <span className="font-bold text-slate-500">1600×530px</span>／スマホ用 推奨 <span className="font-bold text-slate-500">750×470px</span>（JPEG・PNG・WebP／各5MBまで）
            </p>

            {salonImages.length > 0 && (
              <div className="space-y-3">
                {salonImages.map((img, i) => (
                  <div key={img.id} className="rounded-xl border border-pink-100 bg-pink-50/20 p-3 space-y-2">
                    {/* PC用・スマホ用を横並び */}
                    <div className="grid grid-cols-2 gap-3">

                      {/* PC用 */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-500">PC用（推奨 1600×530px）</p>
                        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50" style={{ aspectRatio: '3/1' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                        <div className="flex gap-1">
                          <label className={`flex-1 flex items-center justify-center cursor-pointer py-1 px-2 rounded-lg border text-[10px] font-bold transition-colors ${
                            uploadingPcId === img.id
                              ? 'border-pink-100 text-pink-300 cursor-not-allowed'
                              : 'border-pink-200 text-pink-500 hover:bg-pink-50'
                          }`}>
                            <input
                              type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                              disabled={uploadingPcId === img.id}
                              onChange={(e) => handlePcImageReplace(img.id, img.image_url, e)}
                            />
                            {uploadingPcId === img.id ? 'UP中...' : '変更'}
                          </label>
                          {/* PC用の削除＝そのスロットごと削除（PC用が本体のため。確認ダイアログあり）。 */}
                          <button
                            type="button"
                            onClick={() => handleImageDelete(img.id, img.image_url, img.mobile_image_url)}
                            className="py-1 px-2 rounded-lg border border-rose-100 text-rose-400 text-[10px] font-bold hover:bg-rose-50 transition-colors"
                          >削除</button>
                        </div>
                      </div>

                      {/* スマホ用 */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-500">スマホ用（推奨 750×470px）</p>
                        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50" style={{ aspectRatio: '3/1' }}>
                          {img.mobile_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img.mobile_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-400 text-center leading-tight px-1">
                              未設定<br />（PC用を使用）
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <label className={`flex-1 flex items-center justify-center cursor-pointer py-1 px-2 rounded-lg border text-[10px] font-bold transition-colors ${
                            uploadingMobileId === img.id
                              ? 'border-pink-100 text-pink-300 cursor-not-allowed'
                              : 'border-pink-200 text-pink-500 hover:bg-pink-50'
                          }`}>
                            <input
                              type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                              disabled={uploadingMobileId === img.id}
                              onChange={(e) => handleMobileImageUpload(img.id, img.mobile_image_url, e)}
                            />
                            {uploadingMobileId === img.id ? 'UP中...' : img.mobile_image_url ? '変更' : '追加'}
                          </label>
                          {img.mobile_image_url && (
                            <button
                              type="button"
                              onClick={() => handleMobileImageDelete(img.id, img.mobile_image_url!)}
                              className="py-1 px-2 rounded-lg border border-rose-100 text-rose-400 text-[10px] font-bold hover:bg-rose-50 transition-colors"
                            >削除</button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 並び替え（削除は各画像の「削除」ボタンで行う） */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-pink-100">
                      <span className="text-[10px] text-slate-400">スロット {i + 1}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => handleImageMove(i, 'up')} disabled={i === 0}
                          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors">↑</button>
                        <button type="button" onClick={() => handleImageMove(i, 'down')} disabled={i === salonImages.length - 1}
                          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors">↓</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {salonImages.length < 3 && (
              <label className={`flex items-center gap-2 cursor-pointer w-full py-2.5 px-4 rounded-xl border-2 border-dashed text-xs font-bold transition-colors ${
                uploadingNewSlot
                  ? 'border-pink-200 text-pink-300 cursor-not-allowed'
                  : 'border-pink-200 text-pink-500 hover:border-pink-400 hover:bg-pink-50/50'
              }`}>
                <input
                  type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  disabled={uploadingNewSlot}
                  onChange={handleAddSlot}
                />
                {uploadingNewSlot ? 'アップロード中...' : '+ 新しいスロットを追加（PC用画像、JPEG / PNG / WebP, 最大5MB）'}
              </label>
            )}
          </div>

          <div className="pt-1 flex justify-end">
            <button className={saveBtn} onClick={handleSalonSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* ── タブ: ネット予約設定 ── */}
        <div className={`space-y-4 ${activeTab === 'booking' ? '' : 'hidden'}`}>

        {/* 予約一覧（新しい順・表示のみ。ステータス変更/削除は後日） */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">予約一覧</h2>
            <span className="text-[11px] text-slate-400">{bookings.length}件</span>
          </div>
          {bookingsError ? (
            <p className="text-xs text-rose-600">予約一覧の取得に失敗しました：{bookingsError}</p>
          ) : bookingsLoading ? (
            <p className="text-xs text-slate-400">読み込み中...</p>
          ) : bookings.length === 0 ? (
            <p className="text-xs text-slate-400">まだネット予約はありません。</p>
          ) : (
            <div className="space-y-2">
              {bookings.map((b) => {
                const st = bookingStatusLabel(b.status);
                const busy = bookingBusyId === b.id;
                const isCancelled = b.status === 'cancelled';
                // 操作ボタンの共通スタイル。
                const btnBase = 'text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50';
                return (
                  <div key={b.id} className={`rounded-xl border border-slate-200 p-3 space-y-1.5 ${isCancelled ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-700">{formatBookingSlot(b.slotStart, b.slotEnd)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span><span className="text-slate-400">指名：</span>{b.therapistName}</span>
                      <span><span className="text-slate-400">コース：</span>{b.courseName}（{b.courseMin}分）</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                      <span><span className="text-slate-400">お客様：</span>{b.customerName}</span>
                      <span><span className="text-slate-400">電話：</span><a href={`tel:${b.customerTel}`} className="text-pink-600 underline">{b.customerTel}</a></span>
                      <span><span className="text-slate-400">折り返し希望：</span>{callbackPrefLabel(b.callbackPref)}</span>
                    </div>
                    {b.note && (
                      <p className="text-xs text-slate-500 whitespace-pre-wrap break-words"><span className="text-slate-400">備考：</span>{b.note}</p>
                    )}
                    {/* 操作ボタン（ステータスに応じて出し分け・削除は常時可） */}
                    <div className="flex flex-wrap gap-2 pt-1.5 border-t border-slate-100">
                      {b.status === 'new' && (
                        <button type="button" disabled={busy} onClick={() => handleBookingStatus(b.id, 'confirmed')}
                          className={`${btnBase} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>確定にする</button>
                      )}
                      {(b.status === 'new' || b.status === 'confirmed') && (
                        <button type="button" disabled={busy} onClick={() => handleBookingStatus(b.id, 'cancelled')}
                          className={`${btnBase} border-slate-300 text-slate-500 hover:bg-slate-50`}>キャンセル</button>
                      )}
                      {b.status === 'cancelled' && (
                        <button type="button" disabled={busy} onClick={() => handleBookingStatus(b.id, 'new')}
                          className={`${btnBase} border-pink-300 text-pink-600 hover:bg-pink-50`}>新規に戻す</button>
                      )}
                      <button type="button" disabled={busy} onClick={() => handleBookingDelete(b.id)}
                        className={`${btnBase} border-rose-200 text-rose-500 hover:bg-rose-50`}>削除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-700">ネット予約の設定</h2>

          <div className="border border-pink-100 rounded-xl p-3 bg-pink-50/20 space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(salonForm.booking_enabled)}
                onChange={(e) => setSalonForm((p) => ({ ...p, booking_enabled: e.target.checked }))}
                className="accent-pink-500 w-4 h-4"
              />
              ネット予約を受け付ける
            </label>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ネット予約を受け付けると、店舗詳細ページの「ネット予約」ボタンから予約の受付が開始されます。
              （「予約で受け付けるコース」を1つ以上登録する必要があります）
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">予約通知先メール</label>
              <input
                type="email"
                placeholder="reservation@example.com"
                className={inputClass}
                value={salonForm.booking_email ?? ''}
                onChange={(e) => setSalonForm((p) => ({ ...p, booking_email: e.target.value }))}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                新しい予約が入ったときの通知先です。ネット予約を受け付ける場合は必須。
              </p>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ※ ネット予約は「指名予約」のみ受け付けます。フリー（指名なし）をご希望のお客様には、
              料金ページ等でお電話でのご予約をご案内ください。
            </p>
          </div>

          {/* 予約で受け付けるコース（料金ページの courses とは独立） */}
          <div className="border border-pink-100 rounded-xl p-3 bg-pink-50/20 space-y-2">
            <label className="block text-[11px] font-bold text-slate-500">予約で受け付けるコース</label>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ここに登録したコースがネット予約の選択肢になります。料金ページとは別に設定できます（ネット予約限定メニューも登録できます）。
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ※ 指名料やオプション料金などの追加料金は、ここでは設定しません。ご予約が入った際に、折り返しのお電話でお客様に総額をお伝えする運用です。
            </p>
            {bookingCourses.length > 0 && (
              <div className="space-y-2">
                {bookingCourses.map((c, i) => {
                  // 行内 input は inputClass（w-full を含む）を使わない。
                  // w-full が w-20/flex-1 と衝突すると、Tailwind の解決順で幅が暴れ料金欄が潰れるため、
                  // ここは明示クラスで flex 幅（none / 1 / min-w-0）を確定させる。
                  const rowInput = 'rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
                  return (
                    <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/60 p-3">
                      {/* 1段目：コース名（フル幅） */}
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => updateBookingCourse(i, { name: e.target.value })}
                        placeholder="例）スタンダードアロマ"
                        className={`w-full ${rowInput}`}
                      />
                      {/* 2段目：所要時間 / 分 / 料金 / × を横並び */}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={15}
                          step={15}
                          value={c.duration_min}
                          onChange={(e) =>
                            updateBookingCourse(i, { duration_min: e.target.value === '' ? '' : Number(e.target.value) })
                          }
                          placeholder="60"
                          className={`w-20 flex-none text-right ${rowInput}`}
                        />
                        <span className="text-sm text-slate-500 flex-none">分</span>
                        <input
                          type="text"
                          value={c.price}
                          onChange={(e) => updateBookingCourse(i, { price: e.target.value })}
                          placeholder="例）¥9,000"
                          className={`flex-1 min-w-0 ${rowInput}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeBookingCourse(i)}
                          className="flex-none text-slate-400 hover:text-rose-500 px-2 text-lg leading-none"
                          aria-label="削除"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={addBookingCourse}
              className="text-xs font-bold text-pink-500 hover:text-pink-600 transition-colors"
            >
              ＋コースを追加
            </button>
          </div>

          <div className="pt-1 flex justify-end">
            <button className={saveBtn} onClick={handleSalonSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
        </div>

        {/* ── タブ2: 出勤設定 ── */}
        <div className={`space-y-3 ${activeTab === 'schedule' ? '' : 'hidden'}`}>
          {therapists.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているセラピストがいません</p>
            </div>
          )}

          {therapists.map((t) => {
            const isOpen = expandedSections.has(`${t.id}-schedule`);
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-pink-100 shadow-sm overflow-hidden">

                <button
                  type="button"
                  onClick={() => toggleSection(`${t.id}-schedule`)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-pink-50/40 transition-colors"
                >
                  <span className="text-sm font-bold text-slate-700">{t.name ?? '(名前未設定)'}</span>
                  <svg
                    className={`w-4 h-4 text-pink-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className={isOpen ? 'px-5 pb-5 pt-2 space-y-4 border-t border-pink-100' : 'hidden'}>

                  {/* 7日間スケジュール */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-400">7日間スケジュール</p>

                    {sevenDays.map((dateStr, idx) => {
                      const day = schedules[t.id]?.[dateStr] ?? { is_active: false, start_time: null, end_time: null };
                      const pickerVal = toPickerValue(day.start_time, day.end_time);
                      return (
                        <div
                          key={dateStr}
                          className={`rounded-xl border px-3 py-2.5 space-y-2 transition-colors ${
                            day.is_active ? 'border-pink-200 bg-pink-50/30' : 'border-slate-100 bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${idx === 0 ? 'text-pink-600' : 'text-slate-600'}`}>
                              {idx === 0 ? '今日 ' : ''}{formatDateLabel(dateStr)}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateDay(t.id, dateStr, { is_active: !day.is_active })}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                day.is_active ? 'bg-pink-500' : 'bg-slate-200'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                day.is_active ? 'translate-x-6' : 'translate-x-1'
                              }`} />
                              <span className="sr-only">{day.is_active ? '出勤' : '休み'}</span>
                            </button>
                          </div>
                          {day.is_active && (
                            <div className="flex items-center gap-2">
                              <input
                                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                                placeholder="例: 12:00〜21:00"
                                value={pickerVal}
                                onChange={e => {
                                  const { start, end } = fromPickerValue(e.target.value);
                                  updateDay(t.id, dateStr, { start_time: start, end_time: end });
                                }}
                              />
                              <TimeRangePicker
                                value={pickerVal}
                                onChange={v => {
                                  const { start, end } = fromPickerValue(v);
                                  updateDay(t.id, dateStr, { start_time: start, end_time: end });
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex justify-end pt-1">
                      <button
                        className={saveBtn}
                        onClick={() => handleScheduleSave(t.id)}
                        disabled={savingSchedule === t.id}
                      >
                        {savingSchedule === t.id ? '保存中...' : 'スケジュールを保存'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── タブ3: 今すぐ ── */}
        <div className={`${activeTab === 'available' ? '' : 'hidden'}`}>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-700 mb-1">今すぐ対応可能なセラピスト</h2>
              <p className="text-[11px] text-slate-400">本日出勤中のセラピストに「今すぐ」フラグを設定できます。チェックを入れて保存するとサイト上にバッジが表示されます。30分後に自動で解除されますが、この画面上ではリロードするまでチェックは残ります。</p>
            </div>
            {(() => {
              // 「今すぐ」判定は営業日基準（深夜0〜6時は前日のスケジュールを参照）
              const todayStr = getBusinessDateJST();
              const checkedCount = onDutyTherapists.filter(t => availableNow[String(t.id)]).length;
              const atLimit = checkedCount >= 3;
              if (onDutyTherapists.length === 0) {
                return (
                  <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-2xl">
                    現在、出勤中のセラピストはいません
                  </p>
                );
              }
              return (
                <div className="space-y-2">
                  {atLimit && (
                    <p className="text-xs text-rose-500 font-bold text-center py-2 bg-rose-50 border border-rose-100 rounded-xl">
                      今すぐは最大3名までです
                    </p>
                  )}
                  {onDutyTherapists.map(t => {
                    const sid = String(t.id);
                    const isChecked = availableNow[sid] ?? false;
                    // 排他制御：キャスト本人が受付中の枠はオーナーが選べない（グレーアウト）。
                    const castLive = isCastLiveRow(t, now);
                    const remainingMin = t.available_until
                      ? Math.floor((new Date(t.available_until).getTime() - now.getTime()) / 60000)
                      : 0;
                    return (
                      <label key={sid} className={`flex items-center gap-3 p-3 rounded-2xl border bg-slate-50/50 transition-colors ${
                        castLive || (!isChecked && atLimit) ? 'border-slate-100 opacity-50 cursor-not-allowed' : 'border-slate-100 cursor-pointer hover:border-pink-200'
                      }`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-pink-500 flex-shrink-0"
                          checked={isChecked}
                          disabled={castLive || (!isChecked && atLimit)}
                          onChange={e => setAvailableNow(prev => ({ ...prev, [sid]: e.target.checked }))}
                        />
                        {t.profile_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.profile_image_url} alt="" className="w-9 h-9 rounded-xl object-cover border border-pink-100 flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center text-pink-400 text-xs font-bold flex-shrink-0">
                            {(t.name ?? '?').charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-700 truncate">{t.name ?? '(名前未設定)'}</p>
                          {schedules[sid]?.[todayStr]?.start_time && (
                            <p className="text-[11px] text-slate-400">
                              {schedules[sid][todayStr].start_time?.slice(0, 5)}〜{schedules[sid][todayStr].end_time?.slice(0, 5)}
                            </p>
                          )}
                          {isChecked && remainingMin > 0 && (
                            <p className="text-[11px] text-pink-500 font-bold">残り{remainingMin}分</p>
                          )}
                        </div>
                        {isChecked && (
                          <span style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', flexShrink: 0 }}>
                            今すぐ
                          </span>
                        )}
                        {castLive && (
                          <span className="text-[11px] font-bold text-pink-600 bg-pink-50 border border-pink-200 rounded-full px-2 py-0.5 flex-shrink-0 whitespace-nowrap">
                            本人が受付中
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })()}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleAvailableNowSave}
                disabled={savingAvailable}
                className={saveBtn}
              >
                {savingAvailable ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>

        {/* ── タブ4: セラピスト情報 ── */}
        <div className={`space-y-3 ${activeTab === 'profile' ? '' : 'hidden'}`}>

          {/* 新規セラピスト追加フォーム */}
          <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-black text-pink-600">新規セラピスト追加</h3>
            <div>
              <label className={labelClass}>名前 <span className="text-rose-400">*</span></label>
              <input
                className={inputClass}
                placeholder="例: 桜木 あいな"
                value={newTherapistName}
                onChange={(e) => { setNewTherapistName(e.target.value); setAddError(''); }}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-green-500 flex-shrink-0"
                checked={newTherapistIsNew}
                onChange={(e) => setNewTherapistIsNew(e.target.checked)}
              />
              <span className="text-xs font-bold text-slate-600">新人マークを付ける</span>
              <span style={{ background: '#22c55e', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>NEW</span>
              <span className="text-[10px] text-slate-400">（30日間表示）</span>
            </label>
            {addError && (
              <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 leading-relaxed">
                {addError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                className={saveBtn}
                onClick={handleTherapistAdd}
                disabled={addingTherapist || !newTherapistName.trim()}
              >
                {addingTherapist ? '追加中...' : '+ セラピストを追加'}
              </button>
            </div>
          </div>

          {therapists.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているセラピストがいません</p>
            </div>
          )}

          {therapists.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-pink-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  {t.profile_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.profile_image_url}
                      alt=""
                      className="w-10 h-10 object-cover rounded-xl border border-pink-100"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 text-[10px]">
                      なし
                    </div>
                  )}
                  <span className="text-sm font-bold text-slate-700">{t.name ?? '(名前未設定)'}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/mypage/therapist/${t.id}`}
                    className="px-4 py-1.5 rounded-xl border border-pink-300 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors"
                  >
                    プロフィールを編集
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleTherapistDelete(t.id, t.name)}
                    disabled={deletingTherapist === t.id}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    {deletingTherapist === t.id ? '削除中...' : '削除'}
                  </button>
                </div>
              </div>

              {/* ── キャスト招待（本人ログイン用） ── */}
              <div className="border-t border-pink-50 px-5 py-3 bg-pink-50/20 space-y-2">
                {t.user_id ? (
                  // 本人化済み
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-emerald-600">
                      ✓ 本人ログイン済み{t.invited_email ? `（${t.invited_email}）` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUnlinkCast(t.id)}
                      disabled={inviteBusyId === t.id}
                      className="px-3 py-1 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-bold hover:border-rose-300 hover:text-rose-500 transition-colors disabled:opacity-50"
                    >
                      {inviteBusyId === t.id ? '処理中...' : '紐付け解除'}
                    </button>
                  </div>
                ) : t.invited_email ? (
                  // 招待済み・本人未ログイン
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-amber-600">
                      ⏳ 招待中（{t.invited_email}）— 本人のログイン待ち
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleResendInvite(t.id)}
                        disabled={inviteBusyId === t.id}
                        className="px-3 py-1 rounded-lg border border-pink-300 text-pink-600 text-[11px] font-bold hover:bg-pink-50 transition-colors disabled:opacity-50"
                      >
                        {inviteBusyId === t.id ? '送信中...' : '招待を再送'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(t.id, t.invited_email!)}
                        disabled={inviteBusyId === t.id}
                        className="px-3 py-1 rounded-lg border border-rose-200 text-rose-500 text-[11px] font-bold hover:bg-rose-50 hover:border-rose-300 transition-colors disabled:opacity-50"
                      >
                        {inviteBusyId === t.id ? '処理中...' : '招待を取り消す'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        type="email"
                        inputMode="email"
                        placeholder="別のメールで招待し直す"
                        value={inviteEmails[t.id] ?? ''}
                        onChange={(e) => setInviteEmails(prev => ({ ...prev, [t.id]: e.target.value }))}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleInviteCast(t.id)}
                        disabled={inviteBusyId === t.id}
                        className="px-3 py-1.5 rounded-xl border border-pink-300 text-pink-600 text-[11px] font-bold bg-white hover:bg-pink-50 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        招待
                      </button>
                    </div>
                  </div>
                ) : (
                  // 未招待
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-400">
                      未招待<span className="font-normal text-slate-400/90">：セラピスト本人用のアカウントに招待します</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="email"
                        inputMode="email"
                        placeholder="本人のメールアドレスを入力"
                        value={inviteEmails[t.id] ?? ''}
                        onChange={(e) => setInviteEmails(prev => ({ ...prev, [t.id]: e.target.value }))}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleInviteCast(t.id)}
                        disabled={inviteBusyId === t.id}
                        className="px-4 py-1.5 rounded-xl text-white text-[11px] font-bold shadow-sm disabled:opacity-50 flex-shrink-0"
                        style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
                      >
                        {inviteBusyId === t.id ? '送信中...' : '招待する'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── タブ5: 写メ日記 ── */}
        <div className={`${activeTab === 'diary' ? '' : 'hidden'}`}>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-700 mb-1">写メ日記の投稿</h2>
              <p className="text-[11px] text-slate-400">投稿するセラピストを選んでから、画像・タイトル・本文を入力してください。</p>
            </div>

            {/* セラピスト選択 */}
            {therapists.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-2xl">
                登録されているセラピストがいません
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {therapists.map((t) => {
                  const selected = diaryTherapistId === String(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectDiaryTherapist(String(t.id))}
                      className={`rounded-2xl border-2 overflow-hidden text-center transition-colors ${
                        selected ? 'border-pink-500 ring-2 ring-pink-200' : 'border-slate-200 hover:border-pink-300'
                      }`}
                    >
                      <div className="aspect-square bg-slate-100">
                        {t.profile_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.profile_image_url} alt={t.name ?? ''} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xl font-bold">
                            {(t.name ?? '?').charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className={`text-[11px] font-bold py-1.5 px-1 truncate ${selected ? 'text-pink-600 bg-pink-50' : 'text-slate-600 bg-white'}`}>
                        {t.name ?? '(名前未設定)'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 投稿フォーム（セラピスト選択時のみ表示） */}
            {diaryTherapistId && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-[11px] font-bold text-slate-400">
                  投稿フォーム（{therapists.find(t => String(t.id) === diaryTherapistId)?.name ?? ''}）
                </p>

                {/* 画像（1枚） */}
                <div>
                  <label className={labelClass}>画像（1枚）</label>
                  <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
                  {diaryImage ? (
                    <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-pink-100 bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={diaryImage} alt="投稿画像" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setDiaryImage(null)}
                        aria-label="削除"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-32 rounded-xl border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
                      {diaryUploading ? (
                        <span className="text-[10px] font-bold">アップ中...</span>
                      ) : (
                        <>
                          <span className="text-2xl leading-none">＋</span>
                          <span className="text-[10px] font-bold mt-0.5">画像を追加</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleDiaryImageUpload}
                        disabled={diaryUploading}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* タイトル（最大20文字） */}
                <div>
                  <label className={labelClass}>タイトル（最大10文字）</label>
                  <input
                    className={inputClass}
                    placeholder="タイトルを入力"
                    maxLength={10}
                    value={diaryTitle}
                    onChange={(e) => setDiaryTitle(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400 text-right mt-0.5">{diaryTitle.length} / 10</p>
                </div>

                {/* 本文 */}
                <div>
                  <label className={labelClass}>本文</label>
                  <textarea
                    rows={5}
                    className={textareaClass}
                    placeholder="本文を入力"
                    value={diaryBody}
                    onChange={(e) => setDiaryBody(e.target.value)}
                  />
                </div>

                {/* 投稿ボタン（ピンク→オレンジグラデーション） */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleDiaryPost}
                    disabled={diaryPosting || diaryUploading}
                    className="px-6 py-2 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-50"
                    style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
                  >
                    {diaryPosting ? '投稿中...' : '投稿する'}
                  </button>
                </div>
              </div>
            )}

            {/* 投稿済み日記一覧 */}
            <MyDiaryList salonId={Number(salon.id)} reloadSignal={diaryReload} onToast={showToast} />
          </div>
        </div>

        {/* ── タブ6: クーポン ── */}
        <div className={`space-y-4 ${activeTab === 'coupon' ? '' : 'hidden'}`}>

          {/* 新規追加フォーム */}
          <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-black text-pink-600">クーポンを新規追加</h3>
            <p className="text-[10px] text-slate-400">有効期限が過ぎると自動で非表示になります。</p>
            <div>
              <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
              <input
                className={inputClass}
                placeholder="例: 新規様限定クーポン"
                value={newCoupon.title}
                onChange={(e) => setNewCoupon(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>割引内容 <span className="text-rose-400">*</span></label>
              <input
                className={inputClass}
                placeholder="例: ¥1,000 OFF"
                value={newCoupon.discount}
                onChange={(e) => setNewCoupon(p => ({ ...p, discount: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>利用条件</label>
              <textarea
                rows={2}
                className={textareaClass}
                placeholder="例: 60分以上のコースをご利用の方限定。他クーポンとの併用不可。"
                value={newCoupon.conditions}
                onChange={(e) => setNewCoupon(p => ({ ...p, conditions: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>有効期限</label>
              <input
                type="date"
                className={inputClass}
                value={newCoupon.valid_until}
                onChange={(e) => setNewCoupon(p => ({ ...p, valid_until: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>背景色</label>
              <div className="flex flex-wrap gap-2">
                {COUPON_COLORS.map((cc) => {
                  const selected = newCoupon.color === cc.key;
                  return (
                    <button
                      key={cc.key}
                      type="button"
                      onClick={() => setNewCoupon(p => ({ ...p, color: cc.key }))}
                      aria-label={cc.label}
                      title={cc.label}
                      className={`relative w-10 h-10 rounded-xl border-2 transition-transform ${
                        selected ? 'border-pink-500 ring-2 ring-pink-200 scale-105' : 'border-slate-200 hover:border-pink-300'
                      }`}
                      style={{ background: cc.background }}
                    >
                      {selected && (
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: cc.text }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">選択中：{getCouponColor(newCoupon.color).label}</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-pink-500 flex-shrink-0"
                checked={newCoupon.is_published}
                onChange={(e) => setNewCoupon(p => ({ ...p, is_published: e.target.checked }))}
              />
              <span className="text-xs font-bold text-slate-600">公開する（オフにすると非公開で保存）</span>
            </label>
            <div className="flex flex-col items-end gap-1.5">
              <button
                className={saveBtn}
                onClick={handleCouponAdd}
                disabled={addingCoupon || !newCoupon.title.trim() || !newCoupon.discount.trim()}
              >
                {addingCoupon ? '追加中...' : '+ クーポンを追加'}
              </button>
              <p className="text-[11px] text-slate-400">※新規発行時のみ、保存している会員に通知されます（編集では通知されません）</p>
            </div>
          </div>

          {/* クーポン一覧（公開・非公開含む） */}
          {coupons.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているクーポンがありません</p>
            </div>
          ) : (
            coupons.map((c) => {
              const form = couponForms[c.id] ?? {};
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 space-y-3">
                  {/* ヘッダー：色プレビュー・公開状態・ワンタップ切替・削除 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-lg border border-slate-200 flex-shrink-0"
                        style={{ background: getCouponColor(c.color).background }}
                        title={getCouponColor(c.color).label}
                      />
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        c.is_published ? 'bg-pink-50 text-pink-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {c.is_published ? '公開中' : '非公開'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCouponTogglePublish(c.id)}
                        className="px-3 py-1.5 rounded-xl border border-pink-300 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors"
                      >
                        {c.is_published ? '非公開にする' : '公開にする'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCouponDelete(c.id)}
                        disabled={deletingCoupon === c.id}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                      >
                        {deletingCoupon === c.id ? '削除中...' : '削除'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
                    <input
                      className={inputClass}
                      value={form.title ?? ''}
                      onChange={(e) => setCouponForms(prev => ({ ...prev, [c.id]: { ...prev[c.id], title: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>割引内容 <span className="text-rose-400">*</span></label>
                    <input
                      className={inputClass}
                      value={form.discount ?? ''}
                      onChange={(e) => setCouponForms(prev => ({ ...prev, [c.id]: { ...prev[c.id], discount: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>利用条件</label>
                    <textarea
                      rows={2}
                      className={textareaClass}
                      value={(form.conditions as string | null) ?? ''}
                      onChange={(e) => setCouponForms(prev => ({ ...prev, [c.id]: { ...prev[c.id], conditions: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>有効期限</label>
                    <input
                      type="date"
                      className={inputClass}
                      value={(form.valid_until as string | null) ?? ''}
                      onChange={(e) => setCouponForms(prev => ({ ...prev, [c.id]: { ...prev[c.id], valid_until: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>背景色</label>
                    <div className="flex flex-wrap gap-2">
                      {COUPON_COLORS.map((cc) => {
                        const selected = ((form.color as string) ?? DEFAULT_COUPON_COLOR_KEY) === cc.key;
                        return (
                          <button
                            key={cc.key}
                            type="button"
                            onClick={() => setCouponForms(prev => ({ ...prev, [c.id]: { ...prev[c.id], color: cc.key } }))}
                            aria-label={cc.label}
                            title={cc.label}
                            className={`relative w-10 h-10 rounded-xl border-2 transition-transform ${
                              selected ? 'border-pink-500 ring-2 ring-pink-200 scale-105' : 'border-slate-200 hover:border-pink-300'
                            }`}
                            style={{ background: cc.background }}
                          >
                            {selected && (
                              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: cc.text }}>✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">選択中：{getCouponColor((form.color as string) ?? DEFAULT_COUPON_COLOR_KEY).label}</p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      className={saveBtn}
                      onClick={() => handleCouponSave(c.id)}
                      disabled={savingCoupon === c.id}
                    >
                      {savingCoupon === c.id ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── タブ7: お知らせ ── */}
        <div className={`space-y-4 ${activeTab === 'news' ? '' : 'hidden'}`}>

          {/* 新規追加フォーム */}
          <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-black text-pink-600">お知らせを新規追加</h3>
            <div>
              <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
              <input
                className={inputClass}
                placeholder="例: 5月の営業日のお知らせ"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>本文 <span className="text-rose-400">*</span></label>
              <textarea
                rows={5}
                className={textareaClass}
                placeholder="お知らせの本文を入力してください。"
                value={newAnnouncement.content}
                onChange={(e) => setNewAnnouncement(p => ({ ...p, content: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>画像（任意・1枚）</label>
              <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
              {newAnnouncement.image_url ? (
                <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-pink-100 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={newAnnouncement.image_url} alt="お知らせ画像" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setNewAnnouncement(p => ({ ...p, image_url: null }))}
                    aria-label="削除"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-32 h-32 rounded-xl border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
                  {uploadingNewAnnouncementImage ? (
                    <span className="text-[10px] font-bold">アップ中...</span>
                  ) : (
                    <>
                      <span className="text-2xl leading-none">＋</span>
                      <span className="text-[10px] font-bold mt-0.5">画像を追加</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleNewAnnouncementImageUpload}
                    disabled={uploadingNewAnnouncementImage}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-pink-500 flex-shrink-0"
                checked={newAnnouncement.is_published}
                onChange={(e) => setNewAnnouncement(p => ({ ...p, is_published: e.target.checked }))}
              />
              <span className="text-xs font-bold text-slate-600">公開する（オフにすると非公開で保存）</span>
            </label>
            {/* fukuX 同時投稿（新規投稿時のみ有効。編集保存では出さない＝重複ポスト防止）。 */}
            {renderCrosspostChecks(newAnnCrosspostX, setNewAnnCrosspostX, newAnnCrosspostNoReplies, setNewAnnCrosspostNoReplies)}
            <div className="flex flex-col items-end gap-1.5">
              <button
                className={saveBtn}
                onClick={handleAnnouncementAdd}
                disabled={addingAnnouncement || !newAnnouncement.title.trim() || !newAnnouncement.content.trim()}
              >
                {addingAnnouncement ? '追加中...' : '+ お知らせを追加'}
              </button>
              <p className="text-[11px] text-slate-400">※新規投稿時のみ、保存している会員に通知されます（編集では通知されません）</p>
            </div>
          </div>

          {/* 再投稿の確認モーダル（標準confirmの置き換え）。文言は既存confirmと同一。
              その下に fukuX 同時投稿チェック（未連携なら disabled＋注記）。 */}
          {repostModalId && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => { if (!repostingAnnouncement) setRepostModalId(null); }}
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-bold text-slate-700 whitespace-pre-line leading-relaxed">
                  {`このお知らせを再投稿しますか？\n投稿日時が現在時刻に更新され、一覧の先頭に表示されます。\n（元の投稿日時は失われ、再び新着「NEW!!」扱いになります）`}
                </p>
                {renderCrosspostChecks(repostCrosspostX, setRepostCrosspostX, repostCrosspostNoReplies, setRepostCrosspostNoReplies)}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRepostModalId(null)}
                    disabled={!!repostingAnnouncement}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={confirmAnnouncementRepost}
                    disabled={!!repostingAnnouncement}
                    className={saveBtn}
                  >
                    {repostingAnnouncement ? '処理中...' : 'OK'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* お知らせ一覧（公開・非公開含む。published_at の新しい順） */}
          {announcements.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているお知らせがありません</p>
            </div>
          ) : (
            announcements.map((a) => {
              const form = announcementForms[a.id] ?? {};
              return (
                <div key={a.id} className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 space-y-3">
                  {/* ヘッダー：公開状態・公開日時・ワンタップ切替・再投稿・削除 */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                        a.is_published ? 'bg-pink-50 text-pink-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {a.is_published ? '公開中' : '非公開'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">{formatPublishedAt(a.published_at)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => handleAnnouncementTogglePublish(a.id)}
                        className="px-3 py-1.5 rounded-xl border border-pink-300 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors"
                      >
                        {a.is_published ? '非公開にする' : '公開にする'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnnouncementRepost(a.id)}
                        disabled={repostingAnnouncement === a.id}
                        title="投稿日時を現在時刻に更新して再投稿します"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-600 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                          <path d="M21 3v5h-5" />
                          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                          <path d="M3 21v-5h5" />
                        </svg>
                        {repostingAnnouncement === a.id ? '処理中...' : '再投稿'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnnouncementDelete(a.id)}
                        disabled={deletingAnnouncement === a.id}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                      >
                        {deletingAnnouncement === a.id ? '削除中...' : '削除'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
                    <input
                      className={inputClass}
                      value={form.title ?? ''}
                      onChange={(e) => setAnnouncementForms(prev => ({ ...prev, [a.id]: { ...prev[a.id], title: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>本文 <span className="text-rose-400">*</span></label>
                    <textarea
                      rows={5}
                      className={textareaClass}
                      value={(form.content as string | null) ?? ''}
                      onChange={(e) => setAnnouncementForms(prev => ({ ...prev, [a.id]: { ...prev[a.id], content: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>画像（任意・1枚）</label>
                    <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
                    {(form.image_url as string | null) ? (
                      <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-pink-100 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.image_url as string} alt="お知らせ画像" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAnnouncementForms(prev => ({ ...prev, [a.id]: { ...prev[a.id], image_url: null } }))}
                          aria-label="削除"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-32 h-32 rounded-xl border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
                        {uploadingAnnouncementImageId === a.id ? (
                          <span className="text-[10px] font-bold">アップ中...</span>
                        ) : (
                          <>
                            <span className="text-2xl leading-none">＋</span>
                            <span className="text-[10px] font-bold mt-0.5">画像を追加</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleAnnouncementImageUpload(a.id, e)}
                          disabled={uploadingAnnouncementImageId === a.id}
                          className="hidden"
                        />
                      </label>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">※ 画像の差し替え・削除は「保存」で確定します。</p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      className={saveBtn}
                      onClick={() => handleAnnouncementSave(a.id)}
                      disabled={savingAnnouncement === a.id}
                    >
                      {savingAnnouncement === a.id ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── VIPレタータブ ── */}
        <div className={`space-y-4 ${activeTab === 'vipletter' ? '' : 'hidden'}`}>
          {salon ? (
            <VipLetterForm salonId={Number(salon.id)} />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">店舗情報を読み込み中です…</p>
            </div>
          )}
        </div>

        {/* ── 求人タブ（フクエスワーク・最後尾）。掲載契約店（jobs_enabled）のみ表示。 ── */}
        <div className={`space-y-4 ${activeTab === 'jobs' && salon?.jobs_enabled ? '' : 'hidden'}`}>
          {salon ? (
            <JobsTab salonId={Number(salon.id)} />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">店舗情報を読み込み中です…</p>
            </div>
          )}
        </div>

        {/* ── ポップアップ画像タブ（サロン詳細で左下から出る画像） ── */}
        <div className={`space-y-4 ${activeTab === 'popup' ? '' : 'hidden'}`}>
          {/* ── テーマ（背景壁紙）：店舗装飾。旧・店舗タブから移設。保存で salons.theme を更新 ── */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          {/* ── テーマ（壁紙） ── */}
          <div>
            <h2 className="text-sm font-black text-slate-700">テーマ（背景壁紙）</h2>
            <p className="mt-1 mb-2 text-[11px] leading-relaxed text-slate-400">店舗詳細ページの背景に敷かれる壁紙を選べます。壁紙未設定のテーマは背景色のみになります。</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {SALON_THEMES.map((t) => {
                const selected = (salonForm.theme ?? 'white') === t.key;
                const wallpaper = themeWallpapers[t.key];
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSalonForm((p) => ({ ...p, theme: t.key as ThemeKey }))}
                    className={`group rounded-2xl border-2 overflow-hidden text-left transition-colors ${
                      selected ? 'border-pink-500 ring-2 ring-pink-200' : 'border-slate-200 hover:border-pink-300'
                    }`}
                  >
                    {/* プレビュー */}
                    <div className="relative w-full" style={{ aspectRatio: '16/9', backgroundColor: t.bg }}>
                      {wallpaper && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={wallpaper} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-pink-500 text-white text-[11px] font-bold flex items-center justify-center shadow">
                          ✓
                        </span>
                      )}
                    </div>
                    {/* ラベル */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${selected ? 'bg-pink-50' : 'bg-white'}`}>
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.bg, border: `1px solid ${t.swatchBorder}` }}
                      />
                      <span className={`text-xs font-bold ${selected ? 'text-pink-600' : 'text-slate-600'}`}>{t.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
            <button
              type="button"
              onClick={handleThemeSave}
              disabled={savingTheme}
              className="w-full py-2.5 rounded-full bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 disabled:opacity-50"
            >
              {savingTheme ? '保存中…' : 'テーマを保存する'}
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-700">ポップアップ画像</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                スマホで店舗詳細ページを少し下にスクロールすると、左下から画像が「ポンっ」と跳ねて出ます（スマホ表示のみ。PCでは出ません）。最大3枚まで登録でき、<span className="text-slate-500 font-bold">ページを開くたびに1枚がランダムで表示</span>されます。画像ごとに、自分の店舗内のページ（セラピスト個別ページも含む）へのリンク先を選べます。「表示する」をONにすると公開されます（お客様は✕で閉じられます）。<br />
                <span className="text-slate-500 font-bold">推奨サイズ：</span>縦長・約2:3（例 800×1200px）／1MB以下／JPEG・PNG・WebP。画像は枠なしで全体が表示されます（切れません）。<span className="text-pink-500 font-bold">背景を透過したPNG（切り抜き画像）</span>にすると、背景に自然に溶け込みます。
              </p>
            </div>

            {/* 画像スロット×3（各：プレビュー＋アップロード＋削除＋個別リンク） */}
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="rounded-2xl border border-slate-100 p-3 space-y-2">
                <p className="text-[11px] font-bold text-slate-500">画像 {slot + 1}</p>
                <div className="flex items-start gap-3">
                  <div className="w-20 h-28 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center flex-shrink-0">
                    {popupImages[slot] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={popupImages[slot] as string} alt={`ポップアップ画像${slot + 1}プレビュー`} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 text-center px-2">未設定</span>
                    )}
                  </div>
                  <div className="space-y-2 min-w-0 flex-1">
                    <label className="inline-block">
                      <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold ${uploadingPopupSlot === slot ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-pink-50 text-pink-600 border border-pink-300 hover:bg-pink-100 cursor-pointer'}`}>
                        {uploadingPopupSlot === slot ? 'アップロード中…' : (popupImages[slot] ? '画像を差し替える' : '画像をアップロード')}
                      </span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handlePopupImageUpload(slot, e)} disabled={uploadingPopupSlot === slot} />
                    </label>
                    {popupImages[slot] && (
                      <button type="button" onClick={() => handlePopupImageDelete(slot)} className="block text-[11px] text-slate-400 hover:text-red-500 underline">
                        画像を削除
                      </button>
                    )}
                    <label className="block text-[10px] text-slate-500 mb-0.5">クリック時のリンク先（自店ページのみ）</label>
                    <select
                      value={popupLinks[slot]}
                      onChange={(e) => setPopupLinks(prev => prev.map((l, i) => (i === slot ? e.target.value : l)))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white focus:outline-none focus:border-pink-300"
                    >
                      {(salon ? popupLinkOptions(salon.id, therapists) : [{ label: 'リンクなし', value: '' }]).map((opt) => (
                        <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-slate-400">JPEG・PNG・WebP／各5MBまで。リンク先は自分の店舗内のページから選べます（「リンクなし」ならクリックしても移動しません）。</p>

            {/* 表示ON/OFF */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                <span className="text-sm font-bold text-slate-700">店舗詳細ページに表示する</span>
              </label>
              <p className="mt-1 text-[10px] text-slate-400">※ 画像を1枚以上設定してONにしたときだけ表示されます。</p>
            </div>

            <button
              type="button"
              onClick={handlePopupSave}
              disabled={savingPopup}
              className="w-full py-2.5 rounded-full bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 disabled:opacity-50"
            >
              {savingPopup ? '保存中…' : '保存する'}
            </button>
          </div>
        </div>

        {/* ── 運営から（お知らせ受信＋お問い合わせ） ── */}
        {/* 常時マウント（hidden 切替）＝未読件数をタブバッジへ即時反映。タブを開くと既読化される。 */}
        <div className={`${activeTab === 'support' ? '' : 'hidden'}`}>
          <SupportTab
            salonId={salon ? Number(salon.id) : null}
            active={activeTab === 'support'}
            onUnreadChange={setSupportUnread}
            onToast={showToast}
          />
        </div>

      </main>
    </div>
  );
}