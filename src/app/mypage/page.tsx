'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isNewFaceActive } from '@/lib/newFace';
import { matchesSearch } from '@/lib/searchNormalize';
import { sortTherapistsForList } from '@/lib/therapistOrder';
import { CouponCard } from '@/app/components/CouponCard';
import { toKana, isRomaji } from 'wanakana';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import { getLinkedXProfileForSalon } from '@/app/lib/xLink';
// ★ 独自ドメインの表記ゆれ（www. 付き）を落とすのに使う。★ 公開HP側と同じ関数を使い、判断を1か所にする（第184便）。
import { normalizeHpSiteKey } from '@/app/lib/hpSite';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { SALON_THEMES, type ThemeKey } from '@/app/lib/themes';
import { COUPON_COLORS, getCouponColor, DEFAULT_COUPON_COLOR_KEY, type CouponColorKey } from '@/app/lib/couponColors';
import { VipLetterForm } from '@/app/components/VipLetterForm';
import { VipLetterSentList } from '@/app/components/VipLetterSentList';
import { BookingBoard } from '@/app/mypage/BookingBoard';
import { SupportTab } from '@/app/mypage/SupportTab';
import { getBusinessDateJST, getBusinessDateRangeJST } from '@/lib/dutyStatus';
import { snapClockPair } from '@/lib/timeSnap';
import { isCastLiveRow, isOwnerLiveRow, isImportLiveRow } from '@/lib/imasugu';
import { MyDiaryList } from './MyDiaryList';
import { inviteCast, resendCastInvite, unlinkCast, cancelCastInvite } from '@/app/actions/castInvite';
import { deleteTherapistWithCleanup } from '@/app/actions/therapistAdmin';
import { PAYMENT_CARD_OPTIONS } from '@/app/lib/paymentCards';
import { PAYMENT_METHOD_OPTIONS } from '@/app/lib/paymentMethods';
import { getSalonBookings, updateBookingStatus, deleteBooking, sendBookingTestMailForSalon, type OwnerBooking } from '@/app/actions/booking';
import { callbackPrefLabel } from '@/app/lib/booking/callbackPref';
import { SALON_BOOKINGS_LIMIT } from '@/app/lib/booking/limits';
import { isValidEmail, normalizeEmail, suggestEmailDomain } from '@/app/lib/validation/email';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import SalonFreePagesManager from '@/app/components/SalonFreePagesManager';
import AccordionCard from '@/app/components/AccordionCard';
import { sanitizeInternalPath } from '@/app/lib/safeLink';
import { useToast } from '@/app/components/useToast';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SalonBumpButton } from '@/app/components/SalonBumpButton';
import { getMediaLinkAlerts } from '@/app/actions/mediaCredentials';
import { postAnnouncementManually, getAnnounceState } from '@/app/actions/announcePost';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';
import { ADMIN_UUID } from '@/app/lib/admin';
import { canSeeMedia, readUnlockIntent, MEDIA_UNLOCK_KEY } from '@/lib/mediaVisibility';
import { IMASUGU_COLUMNS } from '@/lib/therapistColumns';

const supabase = createClient();

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ★ ここにあった isAvailableNowLive() は src/lib/imasugu.ts の isOwnerLiveRow() の複製だった（第40便で撤去）。
//   ヘルパーの外にある複製は、枠が増えても追随しない。判定は必ず src/lib/imasugu.ts を通すこと。
//   ★ /mypage が見るのは【オーナー枠だけ】。取り込み枠（駅ちか由来）は読み取り専用で表示するのみで、
//     3名制限にも一括保存にも混ぜない（第40便の決定）。

async function fetchTherapistList(salonId: string): Promise<Therapist[]> {
  const { data, error } = await supabase
    .from('therapists')
    .select(`id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text, ${IMASUGU_COLUMNS}, user_id, invited_email, is_new_face, new_face_since, is_active`)
    .eq('salon_id', salonId);
  if (!error) return (data ?? []) as Therapist[];
  console.warn('[mypage] クエリ失敗（カラム未作成の可能性）:', error.message);
  const { data: fb } = await supabase
    .from('therapists')
    .select('id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text')
    .eq('salon_id', salonId);
  return (fb ?? []).map(t => ({ ...(t as Omit<Therapist, 'is_available_now' | 'available_until' | 'is_available_now_cast' | 'available_until_cast' | 'is_available_now_import' | 'available_until_import' | 'user_id' | 'invited_email' | 'is_new_face' | 'new_face_since' | 'is_active'>), is_available_now: false, available_until: null, is_available_now_cast: false, available_until_cast: null, is_available_now_import: false, available_until_import: null, user_id: null, invited_email: null, is_new_face: false, new_face_since: null, is_active: true }));
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
  /** 自動配信のローテに乗せるか（第69便・設計メモ 追記37 §192）。★ 既定 false */
  auto_rotate: boolean;
};

async function fetchAnnouncementList(salonId: number): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, is_published, published_at, image_url, auto_rotate')
    .eq('salon_id', salonId)
    .order('published_at', { ascending: false });
  if (error) console.warn('[mypage] お知らせ取得失敗:', error.message);
  return (data ?? []) as Announcement[];
}

// ★★★ 画面の種類（2026-09-06・サイドバー化）。
//   ★ 以前は「店舗」タブに7つの箱を縦に積んでいた。★ 縦長で、店舗様がどこに何があるか分からない。
//   ★ フクエスリンク（/mypage/media）と同じく【1画面1つ】に割って、左のサイドバーで選ぶ形にした。
//   ★ 'board'（予約ボード）はサイドバー（ネット予約の下）とヘッダーのピンク文字の両方から開ける
//     （2026-09-06・カッキーさんの指示。ヘッダーのリンクはそのまま残す）。
export type TabKey =
  | 'salon' | 'course' | 'photos'
  | 'theme' | 'banner' | 'popup' | 'freepage'
  | 'schedule' | 'available' | 'profile' | 'diary' | 'coupon' | 'news' | 'vipletter'
  | 'board' | 'booking' | 'jobs' | 'support';

// タブのアイコン（既存サイトと同系統の tabler/lucide 風アウトラインアイコン）。
function tabIcon(key: TabKey | 'media' | 'fukux' | 'crm' | 'hp') {
  const common = {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0',
  };
  switch (key) {
    case 'course': // コースメニュー（receipt）
      return (
        <svg {...common}>
          <path d="M5 21V5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2z" />
          <path d="M9 7h6" /><path d="M9 11h6" />
        </svg>
      );
    case 'photos': // 店舗画像（photo）
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" /><path d="M21 15l-5 -5l-11 9" />
        </svg>
      );
    case 'theme': // テーマ（paint）
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="6" rx="2" />
          <path d="M12 10v4" /><rect x="9" y="14" width="6" height="6" rx="1" />
        </svg>
      );
    case 'banner': // 詳細ページバナー（横長の帯）
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="5" rx="1" />
          <rect x="3" y="14" width="18" height="4" rx="1" />
        </svg>
      );
    case 'popup': // ポップアップ（megaphone）
      return (
        <svg {...common}>
          <path d="M3 11l14 -5v12l-14 -5v-2z" />
          <path d="M11.6 16.8a3 3 0 1 1 -5.8 -1.6" />
        </svg>
      );
    case 'freepage': // フリーページ（file-text）
      return (
        <svg {...common}>
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
          <path d="M9 13h6" /><path d="M9 17h4" />
        </svg>
      );
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
    case 'hp': // フクエスサイト（world：公式ホームページ）
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8" /><path d="M3.6 15h16.8" />
          <path d="M11.5 3a17 17 0 0 0 0 18" /><path d="M12.5 3a17 17 0 0 1 0 18" />
        </svg>
      );
    case 'crm': // フクエスCRM（address-book：お客様の名簿）
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 3v18" />
          <circle cx="14.5" cy="9" r="1.5" />
          <path d="M12.5 15a2.5 2.5 0 0 1 4 0" />
        </svg>
      );
    case 'fukux': // フクエックス（message-circle：SNS＝つぶやき）
      return (
        <svg {...common}>
          <path d="M3 20l1.3 -3.9A8 7 0 1 1 7.5 18.9L3 20" />
          <path d="M8 11h.01" /><path d="M12 11h.01" /><path d="M16 11h.01" />
        </svg>
      );
    case 'media': // 媒体連携（link：他媒体とつながっている）
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case 'schedule': // 出勤（calendar）
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'board': // 予約ボード（table-column：縦の列に区切ったボード）
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
          <path d="M15 3v18" />
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

// ★★★ サイドバーの並び（2026-09-06）。★ group はその項目の【上】に出す見出し。
//   ★ 順番は「店舗の基本 → 見た目 → 日々の更新 → 予約・求人 → その他」。
//   ★ parent: 'salon' はスマホの2階層で【店舗情報の中】に入る画面（2026-09-06）。
//     ★ PCでは今までどおり全部を縦に並べる（親子は字下げで見せるだけ）。
//   ★★ 並びは「日々の更新 → 店舗の基本 → 店舗装飾 → 予約・求人 → その他」
//     （2026-09-06・カッキーさんの指示で、毎日さわる方を上にした）。
const MYPAGE_NAV: Array<{ key: TabKey; label: string; group?: string; parent?: TabKey }> = [
  { key: 'available', label: '今すぐ',          group: '日々の更新' },
  { key: 'schedule',  label: '出勤' },
  { key: 'profile',   label: 'セラピスト' },
  { key: 'diary',     label: '写メ日記' },
  // ★ ネット予約は「日々の更新」の中・写メ日記の下（2026-09-06・カッキーさんの指示）。
  { key: 'booking',   label: 'ネット予約' },
  { key: 'board',     label: '予約ボード' },
  { key: 'coupon',    label: 'クーポン' },
  { key: 'news',      label: 'お知らせ' },
  { key: 'vipletter', label: 'VIPレター' },
  { key: 'salon',     label: '店舗基本設定',     group: '店舗情報' },
  { key: 'course',    label: 'コースメニュー',    parent: 'salon' },
  { key: 'photos',    label: '店舗画像',         parent: 'salon' },
  // ★ 見出し「店舗装飾」は廃止（2026-09-06・カッキーさんの指示）。★「店舗情報」の帯に続けて並べる。
  { key: 'theme',     label: 'テーマ（背景壁紙）', parent: 'salon' },
  { key: 'banner',    label: '詳細ページバナー',  parent: 'salon' },
  { key: 'popup',     label: 'ポップアップ画像',  parent: 'salon' },
  { key: 'freepage',  label: 'フリーページ',      parent: 'salon' },
  // ★★ フクエスワーク（求人）は第220便（2026-09-08・カッキーさんの指示）で
  //   タブをやめ、専用サイト /mypage/jobs（緑・別ページ）に移した。
  //   ★ サイドバーの「関連サイト」には renderJobsLink がリンクとして出す（フクエスリンクと同じ形）。
  //   ★ ここに 'jobs' を戻さないこと（★ 戻すと本文の無いタブが1つできる）。
  // ★ 運営事務局はいちばん下。★ group: '' ＝ 見出しを付けずに、ここで区切る
  //   （2026-09-06・カッキーさんの指示で「その他」の見出しは廃止）。
  { key: 'support',   label: '運営事務局（お問い合わせ等）', group: '' },
];

// ★ 各画面が「どの見出しの下にあるか」を MYPAGE_NAV から作る（2026-09-06）。
//   ★ group はその見出しの先頭の行にだけ書いてあるので、次の group が来るまで引き継ぐ。
//   ★ 並びを直すときは MYPAGE_NAV だけ直せばよい（★ 二重管理をしない）。
const NAV_GROUP_OF: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  let current = '';
  for (const n of MYPAGE_NAV) {
    // ★ '' も区切りとして扱う（★ 見出しは出さないが、前の見出しの中身にはしない）。
    if (n.group !== undefined) current = n.group;
    out[n.key] = current;
  }
  return out;
})();

// ★★ たたんで開ける見出し（アコーディオン・2026-09-06・カッキーさんの指示）。
//   ★ 縦に長い見出しはふだん閉じておく。★ ここに足せば増える。
//   ★ ここに無い見出し（日々の更新・その他）は、いつも開いたまま。
const NAV_ACCORDION_GROUPS = new Set(['店舗情報', '関連サイト']);

// ★ 見出しごとのまとまり（★ PCサイドバーはこれを上から描く）。
//   ★ group: '' は「見出しを出さない区切り」。
const NAV_SECTIONS: Array<{ group: string; keys: TabKey[] }> = (() => {
  const out: Array<{ group: string; keys: TabKey[] }> = [];
  for (const n of MYPAGE_NAV) {
    if (n.group !== undefined || out.length === 0) out.push({ group: n.group ?? '', keys: [] });
    out[out.length - 1].keys.push(n.key);
  }
  // ★★★ 「関連サイト」は【中の画面が0個でも】必ず作る（第220便・2026-09-08）。
  //   ★ この見出しの中身は、いまは全部リンク（フクエスワーク・フクエスリンク・フクエックス・
  //     フクエスCRM・フクエスサイト）で、MYPAGE_NAV には1つも入っていない。
  //   ★★ 第220便で求人をタブから外したとき、この見出しごと消えてしまった（カッキーさんが気づいた）。
  //     ★ 見出しは MYPAGE_NAV から作る、という前提が崩れた場所。★ ここで明示的に足しておく。
  //   ★ 置き場所は「運営事務局」（見出しなしの区切り）の【すぐ上】＝いちばん下から2番目。
  if (!out.some((sec) => sec.group === '関連サイト')) {
    const at = out.findIndex((sec) => sec.group === '');
    const section = { group: '関連サイト', keys: [] as TabKey[] };
    if (at >= 0) out.splice(at, 0, section);
    else out.push(section);
  }
  return out;
})();

// ★★ 大きくピンクの帯にする見出し（2026-09-06・カッキーさんの指示）。
//   ★ 「日々の更新」「店舗情報」「関連サイト」は同じ見た目にする。★ ここに足せば増える。
const NAV_BAND_GROUPS = new Set(['日々の更新', '店舗情報', '関連サイト']);

// ══════════════════════════════════════════════════════════════════
// ★★★ スマホのタブ（2026-09-06 第185便・カッキーさんの指示）
//
//   ★ 毎日さわる8つは【開かずに】1タップで出す。★ 2行×4列。
//   ★ 残りは全部、下の「その他」の中（★ 店舗情報・関連サイトはアコーディオン）。
//
//   ★★★ ここは「置き換え」ではなく【上書き】です。
//     ★ MOBILE_MAIN にも MOBILE_HIDDEN にも書かれていない画面は
//       【自動で「その他」に入ります】（MOBILE_OTHER_SECTIONS が差集合で作る）。
//     ★ だから新しい画面を足して書き忘れても、スマホから消えることはありません。
//     ★ 第184便より前は手書きの別リストだったため、PCで作った「関連サイト」が
//       スマホに反映されず、「その他」のまま取り残されていました（★ 二重管理の事故）。
//
//   ★ 点検は TypeScript が担います（TabKey にない名前は書けない）。
//     ★ さらに MOBILE_MAIN_KEYS で「MYPAGE_NAV に無い名前」を落としているので、
//       打ち間違えても画面は消えず「その他」に出ます。
// ══════════════════════════════════════════════════════════════════

// ★ 未保存のまま離れようとしたときの文言（第226便・2026-09-09）。★ 1か所に置く（画面とブラウザ警告で同じ言葉）。
const SALON_LEAVE_WARNING = 'まだ保存していない変更があります。このページを離れると消えます。';

// ★ スマホで直に出す8つ。★ 並びはこの順（★ PCとは違ってよい。スマホは外出先で使うため）。
const MOBILE_MAIN: TabKey[] = [
  // ★ 2026-09-09（第225便・カッキーさんの指示）: クーポン と ネット予約 の位置を入れ替えた。
  //   ★ 入れ替えたのはスマホのアイコンの並びだけ。★ PC（MYPAGE_NAV）の並びは変えていない。
  'available', 'schedule', 'diary', 'coupon',
  'profile', 'booking', 'news', 'vipletter',
];

// ★ スマホでは出さない画面。★ 予約ボードはヘッダーのピンク文字から開く（2026-09-06・カッキーさんの指示）。
//   ★★ 落とし穴：スマホで ?tab=board を開くと、上のタブはどれも選ばれていない見た目になります。
//     ★ ヘッダーの「予約ボード」はいつも出ているので、迷子にはなりません。
const MOBILE_HIDDEN: TabKey[] = ['board'];

// ★ 実際に上に並べるもの（★ MYPAGE_NAV に無い名前は落とす＝下の「その他」へ回る）。
const MOBILE_MAIN_KEYS: TabKey[] = MOBILE_MAIN.filter((k) => MYPAGE_NAV.some((n) => n.key === k));

// ★ 「その他」の中身。★ 見出しと並びは PC（NAV_SECTIONS）をそのまま使う（★ 二重管理をしない）。
//   ★ 「関連サイト」は中の画面が0個でも残す（★ 契約に関係なく出す外部リンクが入っているため）。
const MOBILE_OTHER_SECTIONS: Array<{ group: string; keys: TabKey[] }> = NAV_SECTIONS
  .map((sec) => ({
    group: sec.group,
    keys: sec.keys.filter((k) => !MOBILE_MAIN_KEYS.includes(k) && !MOBILE_HIDDEN.includes(k)),
  }))
  .filter((sec) => sec.keys.length > 0 || sec.group === '関連サイト');

// ★ URL の ?tab= に出す値。★ 知らない値が来たら 'salon' に倒す（存在しない画面を作らない）。
// ★ 'board' は MYPAGE_NAV にも入っているが、外れても ?tab=board が死なないよう明示で足しておく。
const TAB_KEYS = new Set<string>([...MYPAGE_NAV.map((n) => n.key), 'board']);
function parseTabKey(raw: string | null): TabKey {
  // ★ 既定は「今すぐ」（2026-09-06）。★ 知らない値が来てもここへ倒す。
  return raw && TAB_KEYS.has(raw) ? (raw as TabKey) : 'available';
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

// 施術後のインターバル（準備・片付け時間）の選択肢。salons.default_interval_min に保存し、
// ネット予約が入ったときに予約枠へ自動で加算する（2026-08-15追加）。
// 予約ボードの手入力フォーム（BookingBoard の INTERVAL_OPTIONS）と同じ並びを保つこと。
const INTERVAL_MIN_OPTIONS: readonly number[] = [0, 15, 30, 45, 60];

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
  line_url: string | null;
  address: string | null;
  access: string | null;
  closed_days: string | null;
  courses: unknown;
  /** 料金表の備考（改行保持・未入力なら表示側で欄ごと非表示） */
  course_note: string | null;
  theme: string | null;
  official_url: string | null;
  fukux_url: string | null;
  payment_url: string | null;
  payment_cards: string[] | null;
  payment_methods: string[] | null;
  booking_enabled: boolean | null;
  booking_email: string | null;
  booking_courses: unknown;
  default_interval_min: number | null;
  jobs_enabled: boolean | null;
  popup_image_url: string | null;
  popup_link: string | null;
  popup_image_url2: string | null;
  popup_link2: string | null;
  popup_image_url3: string | null;
  popup_link3: string | null;
  popup_enabled: boolean | null;
  detail_banner_enabled: boolean | null;
  detail_banner_image_url: string | null;
  detail_banner_link: string | null;
  detail_banner_image_url2: string | null;
  detail_banner_link2: string | null;
  detail_banner_image_url3: string | null;
  detail_banner_link3: string | null;
  // 詳細ページバナーのSP（スマホ）用画像。未設定のスロットはPC用画像を流用する。
  detail_banner_image_url_sp: string | null;
  detail_banner_image_url2_sp: string | null;
  detail_banner_image_url3_sp: string | null;
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
  // ★ 駅ちかの「即ヒメ」から取り込んだ枠（第39便）。店舗もキャストも操作しない・読み取り専用。
  is_available_now_import: boolean;
  available_until_import: string | null;
  user_id: string | null;
  invited_email: string | null;
  // ★ 新人マーク（NEWバッジ）。★ 判定は src/lib/newFace.ts の isNewFaceActive ただ1つを通す。
  is_new_face: boolean | null;
  new_face_since: string | null;
  // ★ 公開／非公開（第216便・2026-09-08）。★ 切替は /mypage/therapist/[id]。
  //   ★ null は【公開】として扱う（★ 列を足す前からの古い行が全部消えないように）。
  is_active: boolean | null;
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

// 詳細ページバナー（最大3枚）→ salons の列名の対応。
// imgSp はスマホ用の画像列（2026-08-21 追加）。未設定なら表示側で img を流用する。
const DETAIL_COLS = [
  { img: 'detail_banner_image_url',  imgSp: 'detail_banner_image_url_sp',  link: 'detail_banner_link'  },
  { img: 'detail_banner_image_url2', imgSp: 'detail_banner_image_url2_sp', link: 'detail_banner_link2' },
  { img: 'detail_banner_image_url3', imgSp: 'detail_banner_image_url3_sp', link: 'detail_banner_link3' },
] as const;

// 詳細ページバナーの推奨サイズ（説明文とスロットUIの見出しで使う。数字を1か所にまとめる）。
// ※ プレビュー枠のアスペクト比クラスは Tailwind に拾わせるため JSX に直接書く
//    （PC=aspect-[31/9] / SP=aspect-[3/1]）。禁則160。
const DETAIL_BANNER_SIZE = {
  pc: { label: 'PC・タブレット用', ratio: '約31:9', example: '1240×360px' },
  sp: { label: 'スマホ用',         ratio: '約3:1',  example: '1080×360px' },
} as const;

// ポップアップのリンク先候補。自分のサロン内のページ＋自店セラピストの個別ページのみ（外部URLは選べない）。
// value は保存される実パス。'' は「リンクなし」。
function popupLinkOptions(
  salonId: string | number,
  therapists: { id: string; name: string | null }[] = [],
  freePages: { id: number; title: string }[] = [],
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
  const freePageLinks = freePages
    .filter((fp) => fp.id != null)
    .map((fp) => ({ label: `フリーページ：${fp.title || '（無題）'}`, value: `/salon/${salonId}/p/${fp.id}` }));
  return [...pages, ...therapistPages, ...freePageLinks];
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
  // ★ コースメニュー設定ブロックの開閉（★ 独立画面になったので既定は開く・2026-09-06）。
  const [courseOpen, setCourseOpen] = useState(true);
  // ★ 店舗画像の設定ブロックの開閉（★ 独立画面になったので既定は開く・2026-09-06）。
  const [salonImageOpen, setSalonImageOpen] = useState(true);
  // ★ 店舗情報の設定ブロックの開閉（★ 独立画面になったので既定は開く・2026-09-06）。
  const [salonInfoOpen, setSalonInfoOpen] = useState(true);
  // 通知先メールのテスト送信（2026-08-16）。送信中の二度押し防止＋結果メッセージの保持。
  const [mailTesting, setMailTesting] = useState(false);
  const [mailTestResult, setMailTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingSchedule, setSavingSchedule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('available');
  // ★★ 開いている画面を URL に残す（?tab=course）。2026-09-06
  //   ★ 再読み込みしても同じ画面に戻る。★ 「←戻る」で1つ前の画面へ戻る。
  //   ★ tabReady が立つまでURLへ書かない（読み取り前の 'salon' で上書きしないため）。
  const [tabReady, setTabReady] = useState(false);
  // ★ スマホで開いているグループ名（null＝どれも開いていない・2026-09-06）。★ PCでは使わない。
  // ★ ここにあった openGroup（スマホ「その他」の開閉）は第216便でドロワーに置き換えて廃止。
  // ★★★ スマホの左ドロワー（第216便・2026-09-08・カッキーさんの指示）。
  //   ★ 元の「その他」（店舗情報・関連サイトの折りたたみ＋運営事務局）を、ヘッダー左の三本線から
  //     左からスライドして出るドロワーへ移した。★ 上の 4×2 のアイコンはそのまま。
  //   ★ 中身の並びは MOBILE_OTHER_SECTIONS（＝PCの NAV_SECTIONS）をそのまま使う（★ 二重管理をしない）。
  //   ★ PC（md 以上）では描かない。★ 開いている間は本文のスクロールを止める。
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [drawerOpen]);
  // ★★ 本文（右側）を1.2倍にするのはPCだけ（2026-09-06・カッキーさんの指示）。
  //   ★ スマホは画面が狭く、拡大すると横にはみ出すため。
  //   ★ CSSの @media ではなく、ここで幅を見て style に直接書く（★ 効かない事故を避ける）。
  //   ★ 最初の1回は false（サーバー側では画面幅が分からないため）。
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const read = () => setIsDesktop(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  // ★ PCサイドバーで開いている見出し（2026-09-06・カッキーさんの指示）。
  //   ★ 既定はどれも閉じる。★ その中の画面を開いているときは自動で開く（下の useEffect）。
  const [navOpenGroups, setNavOpenGroups] = useState<Record<string, boolean>>({});
  // ★ 出勤ページの名前しぼり込み（2026-09-06）。★ 画面だけの話で、保存には触れない。
  const [scheduleQuery, setScheduleQuery] = useState('');
  // ★ VIPレターを送ったら、下の一覧を読み直させる鍵（2026-09-06）。
  const [vipSentReload, setVipSentReload] = useState(0);
  // ★ セラピストページの名前しぼり込み（2026-09-06）。★ 出勤ページと同じ規則で絞る。
  const [profileQuery, setProfileQuery] = useState('');
  // ★ 写メ日記のセラピストしぼり込み（2026-09-06）。★ 出勤・セラピストと同じ規則。
  const [diaryQuery, setDiaryQuery] = useState('');
  useEffect(() => {
    const read = () => setActiveTab(parseTabKey(new URLSearchParams(window.location.search).get('tab')));
    read();
    setTabReady(true);
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  // ★★ 求人は第220便で専用サイト /mypage/jobs へ移した。
  //   ★ 昔のリンク（?tab=jobs）で来た人は、そのまま新しい場所へ送る。
  //   ★ 契約が無い店は店舗情報へ倒す（★ サイドバーに項目がなく本文も出ない＝真っ白、を作らない）。
  useEffect(() => {
    if (activeTab !== 'jobs') return;
    if (salon && !salon.jobs_enabled) { setActiveTab('available'); return; }
    if (salon?.jobs_enabled) router.replace('/mypage/jobs');
  }, [activeTab, salon, router]);
  // ★ 「店舗情報」の中の画面を開いているときは、その見出しを開いたままにする（2026-09-06）。
  //   ★ ?tab=course で直接開かれたときや、エラーで店舗基本設定へ飛ばしたときに、
  //     いま見ている画面がサイドバーから消えていると迷うため。
  useEffect(() => {
    const g = NAV_GROUP_OF[activeTab];
    if (g && NAV_ACCORDION_GROUPS.has(g)) setNavOpenGroups((p) => (p[g] ? p : { ...p, [g]: true }));
  }, [activeTab]);
  // ★★ サイドバーを画面の左に貼り付けるため、共通ヘッダー（マイページ＋告知バナー）の高さを測る。
  //   ★ 告知バナーの有無や文字の折返しで高さが変わるので、決め打ちにしない（2026-09-06）。
  //   ★ 測った値は CSS の --nav-top に渡し、PC（md以上）だけで使う。
  //   ★★★ 第216便（2026-09-08）: ref を【コールバック式】にした。
  //     ★ 元は useEffect(…, []) で1回だけ測っていたが、その時点ではまだ「読み込み中...」の画面で
  //       ヘッダーが描かれておらず（ref が null）、そのまま二度と測り直さなかった。
  //       → --nav-top が 0px のまま ＝ サイドバーが top:0 で貼り付き、スクロールすると
  //         ヘッダーの高さ（約88px）ぶん上へずれて「フクエス」の頭がヘッダーの下に潜っていた。
  //     ★ コールバック ref なら、ヘッダーの要素が【付いた瞬間】に呼ばれる。★ 外れたら監視も止める。
  const pageHeaderRoRef = useRef<ResizeObserver | null>(null);
  const [pageHeaderH, setPageHeaderH] = useState(0);
  const pageHeaderRef = useCallback((el: HTMLDivElement | null) => {
    pageHeaderRoRef.current?.disconnect();
    pageHeaderRoRef.current = null;
    if (!el) return;
    const update = () => setPageHeaderH(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    pageHeaderRoRef.current = ro;
  }, []);
  useEffect(() => {
    if (!tabReady) return;
    const url = new URL(window.location.href);
    // ★ 生の値と比べる（★ ?tab=bogus のような値をURLに残さないため）。
    if (url.searchParams.get('tab') === (activeTab === 'available' ? null : activeTab)) return;
    if (activeTab === 'available') url.searchParams.delete('tab');
    else url.searchParams.set('tab', activeTab);
    window.history.pushState(null, '', url.toString());
  }, [activeTab, tabReady]);

  // ★ サイドバーの店舗名は 15.5px が既定。★ 1行に入らないときだけ、入るまで小さくする。
  //   ★ 文字数では決めない（★ 全角と半角で幅が違うため、実際に置いて測る）。
  //   ★ スマホでは隠れていて幅が 0 になるので、そのときは何もしない。
  const salonNameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = salonNameRef.current;
    if (!el) return;
    let size = 15.5;
    el.style.fontSize = `${size}px`;
    if (el.clientWidth === 0) return;      // ★ 隠れている（スマホ）＝測れない
    while (size > 9 && el.scrollWidth > el.clientWidth) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [salonForm.name]);
  /** ★ 媒体連携が「書き込みの向きのまま止まっている」警告（第47便）。トップに出す */
  const [mediaAlerts, setMediaAlerts] = useState<MediaLinkAlert[]>([]);
  /**
   * ★★★ 媒体連携を出すかどうか（第54便）。★ 既定は【出さない】。
   *   他社の担当者が店舗のマイページを覗きに来るため（設計メモ 追記28）。
   *   ★ /mypage は owner_id = user.id で店舗を引いているので、
   *     ログイン中のUIDがそのまま持ち主のUID。★ owner_id を引き直さなくてよい。
   */
  const [userId, setUserId] = useState<string | null>(null);
  /** ★ そのブラウザで目隠しを外してあるか（?media=1）。★ 鍵ではなく目隠し */
  const [mediaUnlocked, setMediaUnlocked] = useState(false);
  /**
   * ★★★ 媒体連携を出すか。★ 既定は false（出さない）。
   *   ★ これは【表示の出し分け】であって認可ではない。
   *     server action 側は従来どおりオーナー検証をしている（assertSalonOwner）。
   */
  const mediaVisible = canSeeMedia({ ownerId: userId, adminUuid: ADMIN_UUID, unlocked: mediaUnlocked });
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
  // ★★ 未保存かどうかの判定用（第226便・2026-09-09）。
  //   ★ 読み込んだ直後と、保存に成功した直後の中身を文字にして控えておき、いまの中身と見比べるだけ。
  //   ★ 見比べるのは handleSalonSave が保存する範囲（店舗の設定＋予約コース）。★ 新しい保存の道は作らない。
  const [savedSalonSnapshot, setSavedSalonSnapshot] = useState<string | null>(null);
  // ネット予約の受付一覧（service_role でサーバー取得・表示のみ）。
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState('');
  const [bookingBusyId, setBookingBusyId] = useState<string | null>(null);
  const [salonImages,    setSalonImages]    = useState<SalonImage[]>([]);
  // ポップアップ画像タブ（サロン詳細で左下から出る画像。最大3枚・各画像に個別リンク・リロード毎に1枚ランダム表示）
  const [popupImages,  setPopupImages]  = useState<(string | null)[]>([null, null, null]);
  // ★ セラピストの既定画像（第217便・2026-09-08）。★ 写真が1枚も無い子のカードに出す、この店舗の画像。
  //   ★ 保存先は salons.therapist_placeholder_url。★ 無ければ運営の既定（/admin）→ それも無ければ今までどおり。
  //   ★ 読み込みは店舗情報の大きな select とは【別】に引く（★ 列がまだ無い環境でもマイページが落ちないように）。
  const [therapistPlaceholder, setTherapistPlaceholder] = useState<string | null>(null);
  const [uploadingPlaceholder, setUploadingPlaceholder] = useState(false);
  const [popupLinks,   setPopupLinks]   = useState<string[]>(['', '', '']);
  const [popupEnabled, setPopupEnabled] = useState(false);
  const [uploadingPopupSlot, setUploadingPopupSlot] = useState<number | null>(null);
  const [detailBanners, setDetailBanners] = useState<(string | null)[]>([null, null, null]);
  // SP（スマホ）用バナー画像。未設定のスロットは表示側でPC用画像を流用する。
  const [detailBannersSp, setDetailBannersSp] = useState<(string | null)[]>([null, null, null]);
  const [detailLinks, setDetailLinks] = useState<string[]>(['', '', '']);
  const [detailEnabled, setDetailEnabled] = useState(false);
  // アップロード中の対象。PC用とSP用を区別するため `${slot}:pc` / `${slot}:sp` を入れる。
  const [uploadingDetailKey, setUploadingDetailKey] = useState<string | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [freePagesForLinks, setFreePagesForLinks] = useState<{ id: number; title: string }[]>([]);
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

  // ★ 写メ日記: セラピストを選んだら投稿フォームまで画面を運ぶ（2026-09-06・カッキーさんの指示）。
  //   ★ 選んでから下までスクロールを探させない。★ ヘッダーの下に隠れないよう scroll-mt を付けている。
  const diaryFormRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!diaryTherapistId) return;
    // ★ フォームは選んだ【あと】に描かれるので、描かれるのを1回待ってから運ぶ。
    const id = window.requestAnimationFrame(() => {
      diaryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [diaryTherapistId]);
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
  // お知らせ：自動配信の状態（第69便）。★ 周（/api/admin/announce-auto）と同じ判定から来る1行。
  //   ★ 読めなければ null のまま。読めていないことを「お休みです」と書き替えない
  const [announceState, setAnnounceState] = useState<{ message: string; targetCount: number; autoTimeLabel: string | null; cycleMessage: string | null } | null>(null);
  const refreshAnnounceState = async () => {
    if (!salon) return;
    const r = await getAnnounceState({ salonId: Number(salon.id) });
    setAnnounceState(r.ok ? r.data : null);
  };

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
  // ★ サイドバー「フクエックス（SNS）」の飛び先に使う、その店舗のアカウント名（handle）。
  //   ★ 未連携なら null（★ そのときは店舗基本設定の fukuX URL → それも空ならトップへ）。
  const [xShopHandle, setXShopHandle] = useState<string | null>(null);
  // ★★★ フクエスサイト（公式HP）の1行（2026-09-06 第184便）。
  //   ★ undefined ＝ まだ読んでいない（★ 画面には何も描かない）
  //   ★ null      ＝ 行が無い（＝まだ申し込んでいない店舗）
  //   ★ 3つの状態を1つの変数で持つ。★ 「読めていない」と「無い」を混ぜないため（家のルール3）。
  const [hpSite, setHpSite] =
    useState<{ slug: string; domain: string | null; status: string } | null | undefined>(undefined);
  // 新規フォーム用の同時投稿チェック（default ON・投稿後もONへリセット・外すのは都度）。
  const [newAnnCrosspostX, setNewAnnCrosspostX] = useState(true);
  const [newAnnCrosspostNoReplies, setNewAnnCrosspostNoReplies] = useState(false);
  // 再投稿カスタム確認モーダル（対象id）＋そのモーダル内の同時投稿チェック（毎回選び直し・記憶しない）。
  const [repostModalId, setRepostModalId] = useState<string | null>(null);
  const [repostCrosspostX, setRepostCrosspostX] = useState(true);
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

  // ★ 並び順に使う2つの見分け方。★ 出勤ページとセラピストページで同じものを使う。
  //   ★ 順番の決め方そのものは src/lib/therapistOrder.ts（★ 通信もDBも触らない）。
  const isWorkingToday = useCallback(
    (t: Therapist) => Boolean(schedules[t.id]?.[sevenDays[0]]?.is_active),
    [schedules, sevenDays],
  );
  const hasProfilePhoto = useCallback((t: Therapist) => Boolean(t.profile_image_url), []);

  // ★★ 出勤ページの並び順（2026-09-06・カッキーさんの指示）。
  //   ★ 上から: 今日の出勤あり → 出勤なし。★ その中で、写真なしを下に落とす。
  //   ★ DBは order を付けていない（＝保存順のまま）ので、並びは画面側で決める。
  //   ★ 同じ点数どうしは元の順のまま（JSの sort は安定）。
  //   ★★ この並びは出勤ページだけ。★ セラピスト・今すぐの一覧は今までどおり。
  const scheduleTherapists = useMemo(() => {
    // ★ 名前で絞る。★ TOPの検索バーと同じ規則（src/lib/searchNormalize.ts）で潰してから比べる:
    //   ★ ひらがな⇄カタカナ／半角カナ／濁点・長音・中黒・空白の有無 を無視する。
    //   ★ ローマ字で打たれたらカナに直す（"sakura" → さくら）。TOPと同じ wanakana を使う。
    //   ★★ 漢字の読み（「桜」→さくら）は当たらない。★ TOPの検索バーも同じ。
    const raw = scheduleQuery.trim();
    const q = raw && isRomaji(raw) ? toKana(raw) : raw;
    const list = q ? therapists.filter((t) => matchesSearch(t.name, q)) : therapists;
    return sortTherapistsForList(list, isWorkingToday, hasProfilePhoto);
  }, [therapists, scheduleQuery, isWorkingToday, hasProfilePhoto]);

  // ★ 写メ日記の投稿でセラピストを選ぶ並び（2026-09-06・カッキーさんの指示）。
  //   ★ 出勤ページ・セラピストページと同じ規則（src/lib/therapistOrder.ts）。★ 左上から順に並ぶ。
  const diaryTherapists = useMemo(() => {
    const raw = diaryQuery.trim();
    const q = raw && isRomaji(raw) ? toKana(raw) : raw;
    const list = q ? therapists.filter((t) => matchesSearch(t.name, q)) : therapists;
    return sortTherapistsForList(list, isWorkingToday, hasProfilePhoto);
  }, [therapists, diaryQuery, isWorkingToday, hasProfilePhoto]);

  // ★ セラピストページの一覧。★ 並びは出勤ページとまったく同じ規則（2026-09-06・カッキーさんの指示）:
  //   ★ 上から: 今日の出勤あり → 出勤なし。★ その中で、写真なしを下に落とす。
  //   ★ 点数の付け方は scheduleTherapists と同じ。★ 直すときは2か所いっしょに直すこと。
  const profileTherapists = useMemo(() => {
    const raw = profileQuery.trim();
    const q = raw && isRomaji(raw) ? toKana(raw) : raw;
    const list = q ? therapists.filter((t) => matchesSearch(t.name, q)) : therapists;
    return sortTherapistsForList(list, isWorkingToday, hasProfilePhoto);
  }, [therapists, profileQuery, isWorkingToday, hasProfilePhoto]);

  // 本日出勤中のセラピスト（営業日基準・深夜跨ぎ対応）。
  // 「今すぐ」は出勤中のセラピストにしか付けられないため、表示・保存の両方で参照する。
  //
  // ★★★ 第216便（2026-09-08）: 【非公開の方は出さない】。
  //   ★ 「今すぐ」はフクエスのサイトに出す仕掛けなので、サイトに出ていない方に付ける意味が無い。
  //   ★★ この useMemo は【表示と一括保存の両方】が見ている（★ 上のコメントのとおり）ので、
  //     ここで落とせば保存側にも入らない。★ 2か所で別々に絞らないこと。
  //   ★ is_active が null（列を足す前の古い行）は公開として扱う＝落とさない。
  //   ★ 出勤・写メ日記・セラピストの一覧は今までどおり全員出す（★ カッキーさんの判断）。
  //     ★ 非公開の方も名簿からは見つけられる＝公開に戻す入口が消えない。
  const onDutyTherapists = useMemo(() => {
    const todayStr = getBusinessDateJST();
    const jstH = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(now));
    const jstM = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', minute: '2-digit' }).format(now));
    const nowMin = jstH * 60 + jstM;
    return therapists.filter(t => {
      if (t.is_active === false) return false; // ★ 非公開の方（第216便）
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
      setUserId(user.id);

      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .select('id, name, rating, review_count, tags, price, area, hours, description, appeal, catchphrase, therapist_count, therapist_types, therapist_profile, phone, address, access, closed_days, courses, course_note, theme, official_url, fukux_url, line_url, payment_url, payment_cards, payment_methods, booking_enabled, booking_email, booking_courses, default_interval_min, jobs_enabled, popup_image_url, popup_link, popup_image_url2, popup_link2, popup_image_url3, popup_link3, popup_enabled, detail_banner_enabled, detail_banner_image_url, detail_banner_link, detail_banner_image_url2, detail_banner_link2, detail_banner_image_url3, detail_banner_link3, detail_banner_image_url_sp, detail_banner_image_url2_sp, detail_banner_image_url3_sp')
        .eq('owner_id', user.id)
        // ★ .single() は「0件でも2件以上でも」エラーになる。
        //   2026-08-20：テスト用の非表示店舗に同じオーナーUUIDが残っていたため2件ヒットし、
        //   正常な店舗まで「店舗情報が見つかりません」になる事故が起きた。
        //   重複しても落ちないよう、表示中の店舗を優先して 1 件だけ取る。
        //   is_hidden で絞り込まないのは、休止中（非表示）の店舗のオーナーも /mypage を使うため。
        .order('is_hidden', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (salonError || !salonData) {
        // 運営アカウントのまま /mypage を開いてもここに来るので、
        // 切り分けができるようログイン中のアカウントを併記する。
        setLoadError(`店舗情報が見つかりません\nログイン中: ${user.email ?? user.id}`);
        return;
      }

      setSalon(salonData);
      setSalonForm(salonData);
      // お知らせ→fukuX 同時投稿用：オーナーの連携fukuX店舗プロフィール（kind='shop'・approved）を解決。
      // best-effort（未連携/失敗は null＝チェックは無効表示）。日記の xProfileId 解決と同型。
      getLinkedXProfileForSalon(user.id)
        .then((p) => { setXShopProfileId(p?.profileId ?? null); setXShopHandle(p?.handle ?? null); })
        .catch(() => { setXShopProfileId(null); setXShopHandle(null); });
      // ★★ 公式HP（salon_sites）の1行。★ サイドバー「フクエスサイト」の出し分けに使う（第184便）。
      //   ★ slug / domain / status は anon・authenticated に読み取り許可がある列
      //     （20260809_salon_sites_admin_lock.sql）。★ マイグレーションは要らない。
      //   ★ 行が無いのが正常（＝まだ申し込んでいない店舗）なので maybeSingle。★ エラーにしない。
      //   ★★ 読めなかったときは undefined のまま＝【何も描かない】。★ 「読めなかった」を
      //     「行が無い（申し込み受付中）」と混ぜない（家のルール3）。★ 画面は止めない。
      void supabase
        .from('salon_sites')
        .select('slug, domain, status')
        .eq('salon_id', salonData.id)
        .maybeSingle()
        .then(
          ({ data, error }) => { if (!error) setHpSite(data ?? null); },
          () => { /* ★ 読めなかった。★ undefined のままにして何も描かない */ },
        );
      setCourseGroups(parseCourseGroups(salonData.courses));
      setOtherItems(parseOtherItems(salonData.courses));
      setBookingCourses(parseBookingCourses(salonData.booking_courses));
      // ★ 読み込んだ直後＝未保存の変更なし。★ この時点の中身を控える。
      setSavedSalonSnapshot(JSON.stringify({ f: salonData, c: parseBookingCourses(salonData.booking_courses) }));
      // ポップアップ画像の設定を初期化（最大3枚・各リンク）
      // ★ 既定画像（第217便）。★ 失敗しても黙って null（★ 列が無い環境でも落とさない）。
      supabase
        .from('salons')
        .select('therapist_placeholder_url')
        .eq('id', salonData.id)
        .maybeSingle()
        .then(({ data }) => setTherapistPlaceholder(((data as { therapist_placeholder_url?: string | null } | null)?.therapist_placeholder_url) ?? null));
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
      setDetailBanners([
        salonData.detail_banner_image_url  ?? null,
        salonData.detail_banner_image_url2 ?? null,
        salonData.detail_banner_image_url3 ?? null,
      ]);
      setDetailBannersSp([
        salonData.detail_banner_image_url_sp  ?? null,
        salonData.detail_banner_image_url2_sp ?? null,
        salonData.detail_banner_image_url3_sp ?? null,
      ]);
      setDetailLinks([
        salonData.detail_banner_link  ?? '',
        salonData.detail_banner_link2 ?? '',
        salonData.detail_banner_link3 ?? '',
      ]);
      setDetailEnabled(Boolean(salonData.detail_banner_enabled));

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
      list.forEach(t => { initAvail[String(t.id)] = isOwnerLiveRow(t); });
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

  // ★ お知らせタブを開いたときに、自動配信の状態を取り直す（第69便）。
  //   ★ 開かないタブのために毎回サーバへ行かない。
  //   ★ eslint の依存警告を避けるため、関数はここでは呼ばず id とタブだけを見る
  useEffect(() => {
    if (activeTab !== 'news' || !salon) return;
    let alive = true;
    (async () => {
      const r = await getAnnounceState({ salonId: Number(salon.id) });
      if (alive) setAnnounceState(r.ok ? r.data : null);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, salon?.id]);

  // ★★ 目隠しの読み書き（第54便）。開いたとき1回だけ。
  //   ?media=1 を付けて開いたブラウザにだけ媒体連携を出す。?media=0 で消す。
  //   ★ 指定が無いときは【いまの状態を変えない】（ふつうに開くたびに消えない）。
  useEffect(() => {
    try {
      const intent = readUnlockIntent(window.location.search);
      if (intent === 'on') window.localStorage.setItem(MEDIA_UNLOCK_KEY, '1');
      else if (intent === 'off') window.localStorage.removeItem(MEDIA_UNLOCK_KEY);
      setMediaUnlocked(window.localStorage.getItem(MEDIA_UNLOCK_KEY) === '1');
    } catch {
      // ★ localStorage が使えない環境（プライベートウィンドウ等）では出さない側に倒す
      setMediaUnlocked(false);
    }
  }, []);

  // ★ 媒体連携の見張り（第47便）。開いたとき1回だけ。
  //   ★ 失敗しても画面は止めない。**警告が出せないことは、警告が無いことと同じにする**
  //     （出せないのに「異常なし」と見せない。ここは静かに空のままにするだけ）。
  useEffect(() => {
    // ★ 出さない相手には取りに行かない（赤い箱そのものが媒体連携の存在を明かすため）
    if (!salon?.id || !mediaVisible) { setMediaAlerts([]); return; }
    let alive = true;
    (async () => {
      const res = await getMediaLinkAlerts({ salonId: Number(salon.id) });
      if (alive && res.ok) setMediaAlerts(res.data);
    })();
    return () => { alive = false; };
  }, [salon?.id, mediaVisible]);

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

  // ★★ セラピストの既定画像（第217便・2026-09-08）。★ salon-images バケットを流用（path は therapist_placeholder_ で区別）。
  //   ★ 保存先は salons.therapist_placeholder_url。★ 削除は列を null に戻す。
  //   ★ 反映先は店舗ページ・出勤表・写メ日記・本人ページ・公式HPなど写真が出る場所全部（src/lib/therapistPlaceholder.ts）。
  //     ★ revalidateSalon で店舗配下は作り直す。本人ページ（/therapist/[id]）は ISR で最大10分。
  const handleTherapistPlaceholderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }
    setUploadingPlaceholder(true);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Number(salon.id)}/therapist_placeholder_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    if (uploadError) {
      showToast(`アップロードに失敗しました: ${uploadError.message}`);
      setUploadingPlaceholder(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('salons').update({ therapist_placeholder_url: publicUrl }).eq('id', salon.id);
    setUploadingPlaceholder(false); e.target.value = '';
    if (dbErr) {
      showToast(`保存に失敗しました: ${dbErr.message}`);
      await supabase.storage.from('salon-images').remove([path]); return;
    }
    const oldUrl = therapistPlaceholder;
    setTherapistPlaceholder(publicUrl);
    if (oldUrl) storageRemove(oldUrl);
    revalidateSalon(salon.id);
    showToast('セラピストの既定画像を設定しました');
  };

  const handleTherapistPlaceholderDelete = async () => {
    if (!salon || !therapistPlaceholder) return;
    if (!window.confirm('セラピストの既定画像を削除しますか？\n（写真が無い方は、運営の既定画像か「画像なし」の表示に戻ります）')) return;
    const { error } = await supabase.from('salons').update({ therapist_placeholder_url: null }).eq('id', salon.id);
    if (error) { showToast(`削除に失敗しました: ${error.message}`); return; }
    storageRemove(therapistPlaceholder);
    setTherapistPlaceholder(null);
    revalidateSalon(salon.id);
    showToast('セラピストの既定画像を削除しました');
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

  // ── 詳細ページバナー：画像アップロード/削除/保存（ポップアップと同方式） ──
  // kind='pc' … 640px以上で表示する横長画像（従来の1枚）
  // kind='sp' … 640px未満で表示するスマホ用画像（未設定ならPC用を流用するため任意）
  // 保存列・ストレージのパス・stateだけが kind で切り替わり、処理の流れはPC/SPで共通。
  const handleDetailImageUpload = async (slot: number, kind: 'pc' | 'sp', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }
    const isSp = kind === 'sp';
    const col  = isSp ? DETAIL_COLS[slot].imgSp : DETAIL_COLS[slot].img;
    setUploadingDetailKey(`${slot}:${kind}`);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    // PC用（detailbanner{n}_…）と衝突しないよう、SP用は _sp サフィックスで分離する。
    const path = `${Number(salon.id)}/detailbanner${slot + 1}${isSp ? '_sp' : ''}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    if (uploadError) { showToast(`アップロードに失敗しました: ${uploadError.message}`); setUploadingDetailKey(null); e.target.value = ''; return; }
    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('salons').update({ [col]: publicUrl }).eq('id', salon.id);
    setUploadingDetailKey(null); e.target.value = '';
    if (dbErr) { showToast(`保存に失敗しました: ${dbErr.message}`); await supabase.storage.from('salon-images').remove([path]); return; }
    const oldUrl = isSp ? detailBannersSp[slot] : detailBanners[slot];
    const setter = isSp ? setDetailBannersSp : setDetailBanners;
    setter(prev => prev.map((u, i) => (i === slot ? publicUrl : u)));
    if (oldUrl) storageRemove(oldUrl);
    revalidateSalon(salon.id);
    showToast(isSp ? 'スマホ用バナー画像をアップロードしました' : 'バナー画像をアップロードしました');
  };

  const handleDetailImageDelete = async (slot: number, kind: 'pc' | 'sp') => {
    if (!salon) return;
    const isSp = kind === 'sp';
    const url  = isSp ? detailBannersSp[slot] : detailBanners[slot];
    if (!url) return;
    if (!window.confirm(isSp ? 'このスマホ用画像を削除しますか？（PC用画像がスマホでも表示されるようになります）' : 'この画像を削除しますか？')) return;
    const col = isSp ? DETAIL_COLS[slot].imgSp : DETAIL_COLS[slot].img;
    const { error } = await supabase.from('salons').update({ [col]: null }).eq('id', salon.id);
    if (error) { showToast(`削除に失敗しました: ${error.message}`); return; }
    storageRemove(url);
    const setter = isSp ? setDetailBannersSp : setDetailBanners;
    setter(prev => prev.map((u, i) => (i === slot ? null : u)));
    revalidateSalon(salon.id);
    showToast('画像を削除しました');
  };

  const handleDetailSave = async () => {
    if (!salon) return;
    // PC用・SP用のどちらか1枚でもあれば公開できる（表示側も img ?? imgSp で拾う）。
    const anyImage = detailBanners.some(Boolean) || detailBannersSp.some(Boolean);
    if (detailEnabled && !anyImage) { showToast('先に画像を1枚以上アップロードしてください'); return; }
    setSavingDetail(true);
    const update: Record<string, unknown> = { detail_banner_enabled: detailEnabled };
    DETAIL_COLS.forEach((c, i) => { update[c.link] = sanitizeInternalPath(detailLinks[i]) || null; });
    const { error } = await supabase.from('salons').update(update).eq('id', salon.id);
    setSavingDetail(false);
    if (error) { showToast(`保存に失敗しました: ${error.message}`); return; }
    revalidateSalon(salon.id);
    showToast('保存しました');
  };

  const handlePopupSave = async () => {
    if (!salon) return;
    const anyImage = popupImages.some(Boolean);
    if (popupEnabled && !anyImage) { showToast('先に画像を1枚以上アップロードしてください'); return; }
    setSavingPopup(true);
    const update: Record<string, unknown> = { popup_enabled: popupEnabled };
    POPUP_COLS.forEach((c, i) => { update[c.link] = sanitizeInternalPath(popupLinks[i]) || null; });
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

  // ネット予約タブのチップに出す「未処理」件数（2026-08-17 / 第20便）。
  //
  // ★ 開いた瞬間に「対応すべき予約がある」と分かるようにするためのもの。
  //   通知メールは届くが、メールを見落とすと予約一覧を開くまで気づけなかった。
  //
  // ★ bookings は【タブを開いていなくても】ページ読み込み時に取得済み。
  //   だから他のタブを見ているときでもこの件数は出る（/admin の各バッジと同じ考え方）。
  //
  // ★ status==='new'（＝画面の「新規リクエスト」）だけを数える。
  //   確定・キャンセルは対応済みなので数えない。
  //   「確定にする」「キャンセル」を押すと handleBookingStatus が bookings を
  //   その場で書き換えるため、バッジもリロードなしで減る。
  //
  // ★ 数える対象は【一覧に出ている予約】そのもの。別のクエリを投げていない。
  //   投げると、一覧の上限（SALON_BOOKINGS_LIMIT）を超えたぶんで
  //   「バッジは3なのに一覧に3件見当たらない」というズレが起きる。
  const bookingNewCount = bookings.filter((b) => b.status === 'new').length;

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
        // ★ この欄は「店舗情報」の画面にある。★ 別の画面から保存したときは、そこへ連れて行く
        //   （★ 2026-09-06 の画面分割で、欄が見えないまま怒られる形になったため）。
        setActiveTab('salon');
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
        // ★ この欄は「店舗情報」の画面にある。★ 別の画面から保存したときは、そこへ連れて行く
        //   （★ 2026-09-06 の画面分割で、欄が見えないまま怒られる形になったため）。
        setActiveTab('salon');
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
        setActiveTab('salon');   // ★ 決済URLの欄も「店舗情報」の画面にある
        showToast('決済URLは http:// または https:// から始めてください');
        return;
      }
      paymentUrl = payRaw;
    }

    // ネット予約：受付ON時は通知先メール必須。空欄は null。
    // ★ 2026-08-16 まで検証は「@ を含むか」だけで、gamil.com のような打ち間違いが素通りしていた。
    //   Resend は送信APIとしては成功を返し、バウンスは後から非同期で起きるため、
    //   アプリ側には「送れなかった」情報が戻ってこない（実機で確認済み）。
    //   → 入口で止める。ここを緩めると、また静かに通知が届かない店が生まれる。
    const bookingEnabled = Boolean(salonForm.booking_enabled);
    const bookingEmail = normalizeEmail(salonForm.booking_email ?? '') || null;
    // 施術後インターバル（2026-08-15）。許可値以外は 0＝なしに丸める（DB側にも CHECK 制約あり）。
    const defaultIntervalMin = INTERVAL_MIN_OPTIONS.includes(Number(salonForm.default_interval_min ?? 0))
      ? Number(salonForm.default_interval_min ?? 0)
      : 0;
    if (bookingEnabled) {
      if (!bookingEmail) {
        setSaving(false);
        showToast('ネット予約を受け付けるには、通知先メールアドレスを入力してください');
        return;
      }
      if (!isValidEmail(bookingEmail)) {
        setSaving(false);
        showToast('通知先メールアドレスの形式が正しくありません。もう一度ご確認ください');
        return;
      }
    }
    // 打ち間違いドメインの疑い（ネット予約OFFでも、入力されていれば見る）。
    // ★ ここは【保存をブロックしない】こと。似ているだけの正当な独自ドメインがあるため、
    //   弾いてしまうと正しい宛先を保存できなくなる。確認を1回挟むだけにする。
    if (bookingEmail) {
      const suggest = suggestEmailDomain(bookingEmail);
      if (suggest && suggest !== bookingEmail.split('@')[1]) {
        const ok = window.confirm(
          `通知先メールのドメインが「${bookingEmail.split('@')[1]}」になっています。\n` +
            `「${suggest}」の打ち間違いではありませんか？\n\n` +
            `このまま保存すると、予約通知が届かない可能性があります。\n` +
            `OK＝このまま保存 / キャンセル＝入力し直す`,
        );
        if (!ok) {
          setSaving(false);
          return;
        }
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
        // 料金表の備考。空欄は null で保存し、表示側で欄ごと出さない。
        course_note: (salonForm.course_note ?? '').trim() || null,
        price: buildRepresentativePrice(courseGroups),
        hours: salonForm.hours,
        description: salonForm.description,
        appeal: salonForm.appeal,
        catchphrase: (salonForm.catchphrase ?? '').trim().slice(0, 27) || null,
        phone: salonForm.phone,
        address: salonForm.address,
        access: salonForm.access,
        closed_days: salonForm.closed_days,
        theme: salonForm.theme ?? 'white',
        official_url: officialUrl,
        fukux_url: fukuxUrl,
        line_url: (salonForm.line_url ?? '').trim() || null,
        payment_url: paymentUrl,
        payment_cards: salonForm.payment_cards ?? [],
        payment_methods: salonForm.payment_methods ?? [],
        booking_enabled: bookingEnabled,
        booking_email: bookingEmail,
        booking_courses: bookingCoursesClean,
        default_interval_min: defaultIntervalMin,
      })
      .eq('id', salon.id);
    setSaving(false);
    if (!error && salon) revalidateSalon(salon.id); // 成功時：トップのISRを即時更新
    // ★ 保存できた＝ここが新しい「保存済みの中身」。★ 以後、触るまで未保存の確認は出さない。
    if (!error) setSavedSalonSnapshot(JSON.stringify({ f: salonForm, c: bookingCourses }));
    showToast(error ? '保存に失敗しました' : '保存しました');
  };

  // ★★ 未保存の変更があるか（第226便・2026-09-09）。★ 控え（savedSalonSnapshot）といまの中身を見比べるだけ。
  //   ★ 控えがまだ無い（読み込み前）ときは false ＝ 何も聞かない（★ 嘘の警告を出さない）。
  const salonDirty =
    savedSalonSnapshot != null &&
    savedSalonSnapshot !== JSON.stringify({ f: salonForm, c: bookingCourses });

  // ★ 未保存のまま【この2つの画面から】離れようとしたら聞く。
  //   ★ タブを閉じる・再読み込み・ほかのサイトへ行く、はブラウザに任せる（beforeunload）。
  //   ★ 文言はブラウザに無視されることがあるが、確認そのものは出る。★ 他のタブでは付けない。
  useEffect(() => {
    if (!salonDirty) return;
    if (activeTab !== 'salon' && activeTab !== 'booking') return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = SALON_LEAVE_WARNING;
      return e.returnValue;
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [salonDirty, activeTab]);

  // ★ 画面の中の「← 戻る」で離れるとき。★ beforeunload はページ内の移動では出ないので、ここは自分で聞く。
  //   ★ 「はい」なら普通に戻る（★ 止めない。★ 決めるのは店舗様）。
  const handleSalonBack = () => {
    if (salonDirty && !window.confirm(SALON_LEAVE_WARNING + '\n\n離れますか？')) return;
    if (window.history.length > 1) window.history.back();
    else setActiveTab('available');
  };

  const handleScheduleSave = async (therapistId: string) => {
    setSavingSchedule(therapistId);
    // ★★ 保存の前に30分刻みへ内側に寄せる（第75便）。
    //   ★ 手打ちの欄からは 12:15 のような時刻を入れられるので、ピッカーだけでは揃わない。
    //   ★ 黙って書き換えない——寄せた枠は数えて、保存後にそのまま伝える。
    //   ★ 寄せると勤務が無くなる枠（12:15〜12:30）は【そのまま残し】、別に伝える。
    let snappedCount = 0;
    const keptAsIs: string[] = [];
    const rows = sevenDays.map(dateStr => {
      const s = schedules[therapistId]?.[dateStr] ?? { is_active: false, start_time: null, end_time: null };
      let start = s.start_time;
      let end = s.end_time;
      if (s.is_active && start && end) {
        const snapped = snapClockPair(start, end);
        if (snapped.ok) {
          if (snapped.changed) snappedCount += 1;
          start = snapped.start;
          end = snapped.end;
        } else {
          keptAsIs.push(start + '〜' + end);
        }
      }
      return {
        therapist_id: therapistId,
        schedule_date: dateStr,
        is_active: s.is_active,
        start_time: s.is_active ? start : null,
        end_time: s.is_active ? end : null,
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
      // ★ 画面の値も、保存した値に合わせる（寄せた結果が見えないと「効いていない」に見える）
      setSchedules(prev => {
        const next = { ...prev };
        const cur = { ...(next[therapistId] ?? {}) };
        rows.forEach(r => {
          const before = cur[r.schedule_date];
          if (before) cur[r.schedule_date] = { ...before, start_time: r.start_time, end_time: r.end_time };
        });
        next[therapistId] = cur;
        return next;
      });
    }
    // ★★ 起きたことを必ず言葉にする（§14-3）。黙って時刻を書き換えない
    if (error) showToast('保存に失敗しました');
    else if (keptAsIs.length > 0)
      showToast('スケジュールを保存しました（' + keptAsIs.join('・') + ' は30分単位にできないため、そのままです）');
    else if (snappedCount > 0)
      showToast('スケジュールを保存しました（' + snappedCount + '件を30分単位に寄せました）');
    else showToast('スケジュールを保存しました');
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
        ? (isOwnerLiveRow(t) && t.available_until ? t.available_until : availableUntil)
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
      refreshed.forEach(t => { sync[String(t.id)] = isOwnerLiveRow(t); });
      setAvailableNow(sync);
    }
    setSavingAvailable(false);
    if (salon) revalidateSalon(salon.id);
    showToast('「今すぐ」設定を保存しました');
  };

  // ★ 「今すぐ」を DB から読み直す（2026-09-06・カッキーさんの指示）。
  //   ★ 30分で自動解除された分は、画面のチェックだけが残る。★ それを消すための口。
  //   ★ ページ全体は読み直さない（他のタブで書きかけの内容を消さないため）。
  const [reloadingAvailable, setReloadingAvailable] = useState(false);
  const handleAvailableNowReload = async () => {
    if (!salon) return;
    setReloadingAvailable(true);
    const refreshed = await fetchTherapistList(String(salon.id));
    setTherapists(refreshed);
    const sync: Record<string, boolean> = {};
    refreshed.forEach((t) => { sync[String(t.id)] = isOwnerLiveRow(t); });
    setAvailableNow(sync);
    setReloadingAvailable(false);
    showToast('最新の状態を読み込みました');
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
    const { data: posted, error } = await supabase.from('diary_posts').insert({
      therapist_id: Number(diaryTherapistId),
      salon_id:     Number(salon.id),
      images:       diaryImage ? [diaryImage] : [],
      title:        diaryTitle.trim() || null,
      content:      diaryBody.trim() || null,
    }).select('id').single();
    if (error) {
      setDiaryPosting(false);
      showToast(`投稿に失敗しました: ${error.message}`);
      return;
    }

    // ── 他媒体への転送（第36便・第2弾）────────────────────────────
    // 店舗の salons.diary_source が 'fukues' のときだけ、駅ちか・エスラブの投稿用アドレスへ送る。
    // 既定は 'benry' なので、切り替えていない店舗では何も起きない。
    // ★ 日記の保存は上で成功済み。転送は付随処理＝失敗しても日記投稿は成功扱い（fukuX と同じ）。
    //   結果は diary_forward_log に残るので、あとから再送できる。
    // ★ 即時反映が売りなので await して送る（cron に積むと10分遅れのベンリー経由と変わらなくなる）。
    if (posted?.id) {
      try {
        const fr = await fetch('/api/diary/forward', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ diaryId: posted.id }),
        });
        const fj = (await fr.json().catch(() => null)) as { 宛先?: Array<{ status?: string }> } | null;
        const sent = (fj?.宛先 ?? []).filter((x) => x.status === 'sent').length;
        if (sent > 0) showToast(`他媒体へ ${sent} 件送信しました`);
      } catch (e) {
        console.error('diary forward failed:', e); // 握りつぶしてログのみ
      }
    }
    setDiaryPosting(false);
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
      map[a.id] = { title: a.title, content: a.content, is_published: a.is_published, image_url: a.image_url, auto_rotate: a.auto_rotate };
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
    const { data: inserted, error } = await supabase.from('announcements').insert({
      salon_id:     Number(salon.id),
      title,
      content,
      is_published: newAnnouncement.is_published,
      image_url:    imageUrl,
    }).select('id').maybeSingle();
    if (error) {
      setAddingAnnouncement(false);
      showToast(
        error.code === '42501'
          ? 'RLSポリシーにより追加が拒否されました。Supabaseでannouncementsのオーナー用INSERTポリシーを確認してください。'
          : `追加に失敗しました: ${error.message}`
      );
      return;
    }
    // ★★ 書いた事実をサーバ側に残す（第68便・§192）。
    //   「その日に手動があったか」は自動配信のスキップ判定の材料。ここで残さないと取りこぼす。
    //   ★ 新規は待たせない（kind:'new'）。失敗しても、書けたものは書けている
    if (inserted?.id && newAnnouncement.is_published) {
      const r = await postAnnouncementManually({
        salonId: Number(salon.id), announcementId: String(inserted.id), kind: 'new',
      });
      if (!r.ok) console.error('[announce] 手動配信の記録に失敗:', r.error);
    }
    const list = await fetchAnnouncementList(Number(salon.id));
    setAnnouncements(list);
    rebuildAnnouncementForms(list);
    // お知らせ保存成功後のみ fukuX 同時投稿（新規投稿時）。失敗しても本体は成功のまま。
    const xOk = await maybeCrosspostAnnouncementToX(newAnnCrosspostX, newAnnCrosspostNoReplies, title, content, imageUrl);
    setNewAnnouncement({ title: '', content: '', is_published: true, image_url: null });
    setNewAnnCrosspostX(true); // 投稿後もデフォルトONへ戻す
    setNewAnnCrosspostNoReplies(false);
    setAddingAnnouncement(false);
    if (salon) revalidateSalon(salon.id);
    void refreshAnnounceState();
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
    const auto_rotate = form.auto_rotate ?? false;
    const { error } = await supabase.from('announcements').update({
      title: form.title.trim(),
      content,
      is_published,
      image_url,
      auto_rotate,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setSavingAnnouncement(null);
    if (error) { showToast(`保存に失敗しました: ${error.message}`); return; }
    // 差し替え・画像なしへの変更で不要になった旧画像を掃除（保存成功後・best-effort）。
    const prevImageUrl = announcements.find(a => a.id === id)?.image_url ?? null;
    if (prevImageUrl && prevImageUrl !== image_url) removeAnnouncementImage(prevImageUrl);
    setAnnouncements(prev => prev.map(a => a.id === id
      ? { ...a, title: form.title!.trim(), content, is_published, image_url, auto_rotate }
      : a));
    if (salon) revalidateSalon(salon.id);
    // ★ 「自動で回す」の印は自動配信の対象件数を変える。状態の1行も取り直す
    void refreshAnnounceState();
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
    // ★ 非公開にすると自動配信の対象から外れる。状態の1行も取り直す
    void refreshAnnounceState();
    showToast(next ? '公開にしました' : '非公開にしました');
  };

  // お知らせ：再投稿ボタン → カスタム確認モーダルを開く（チェックは毎回ONから）。
  // 標準 confirm() ではチェックを置けないため、モーダルで確認＋同時投稿オプションを提示する。
  const handleAnnouncementRepost = (id: string) => {
    setRepostCrosspostX(true); // モーダルを開くたびデフォルトON
    setRepostCrosspostNoReplies(false);
    setRepostModalId(id);
  };

  // お知らせ：再投稿の実行（モーダルのOK）。published_at を現在時刻に更新し一覧の先頭へ。
  // 元の投稿日時は上書きされ、新しい投稿として扱われる。再投稿時のみ fukuX 同時投稿（best-effort）。
  const confirmAnnouncementRepost = async () => {
    const id = repostModalId;
    if (!id || !salon) return;
    const target = announcements.find(a => a.id === id);
    setRepostingAnnouncement(id);
    const newIso = new Date().toISOString();
    // ★★ 画面から直に published_at を書かない（第68便・§191 守り3）。
    //   同じ本文の押し直しは、フクエスTOPの並びを最短30分に1回しか動かさない。
    //   ★ 新しく書いたものは待たせない（そちらは kind:'new' で通る）。
    const res = await postAnnouncementManually({
      salonId: Number(salon.id), announcementId: id, kind: 'repost',
    });
    if (!res.ok) { setRepostingAnnouncement(null); showToast(`再投稿に失敗しました: ${res.error}`); return; }
    // ★ 並びが動いたときだけ、画面の並びも動かす。動かなかったのに動いて見せない
    if (res.data.bumped) {
      setAnnouncements(prev =>
        prev
          .map(a => a.id === id ? { ...a, published_at: newIso } : a)
          .sort((x, y) => new Date(y.published_at).getTime() - new Date(x.published_at).getTime())
      );
    }
    // 再投稿成功後のみ fukuX 同時投稿。失敗しても再投稿は成功のまま。
    const xOk = target
      ? await maybeCrosspostAnnouncementToX(repostCrosspostX, repostCrosspostNoReplies, target.title, target.content, target.image_url)
      : true;
    setRepostingAnnouncement(null);
    setRepostModalId(null);
    if (salon) revalidateSalon(salon.id);
    // ★ 手動で出した日は、その日の自動がお休みになる。状態の1行も取り直す
    void refreshAnnounceState();
    // ★★ 黙って何も起きないのが最悪。起きたことを必ず言葉にする（§191）。
    //   ★ 「再投稿しました」と言い切らない——並びが動かなかった回もあるため
    showToast(xOk ? res.data.message : `${res.data.message}（fukuX投稿は失敗しました）`);
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
          checked={!!xShopProfileId && enabled}
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
    void refreshAnnounceState();
    showToast('お知らせを削除しました');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const inputClass = 'w-full px-3 py-2 rounded-none border border-slate-200 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200';
  const textareaClass = 'w-full px-3 py-2 rounded-none border border-slate-200 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none';
  const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
  const saveBtn = 'px-5 py-2 rounded-none bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50';

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-sm whitespace-pre-line text-center leading-relaxed px-6">{loadError}</p>
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  // ── サイドバーの小道具（2026-09-06）────────────────────────────
  // ★ 部品ではなく関数にしている（★ 中で作った部品は毎回別物になり、押した瞬間に作り直される）。
  // ★ 画面を切り替えたら、必ずページの一番上を出す（2026-09-06・カッキーさんの指示）。
  //   ★ 下の方を見ている状態で別の画面に移ると、その画面の途中から始まって迷うため。
  //   ★ ここを通さずに setActiveTab を直接呼ぶと、上に戻らない画面ができる。
  const goTab = (key: TabKey) => {
    setActiveTab(key);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  };
  // ★ その見出しの中身を出すか。★ たたむ見出しでなければ、いつも出す。
  const navGroupIsOpen = (group: string) => !NAV_ACCORDION_GROUPS.has(group) || Boolean(navOpenGroups[group]);
  // ★ たたむ見出しのピンクの帯（★ 見た目と開閉を1か所に）。
  //   ★ compact＝スマホの「その他」の中で使う小さい帯（2026-09-06 第185便）。
  const navBandButton = (group: string, compact = false) => (
    <button
      type="button"
      onClick={() => setNavOpenGroups((p) => ({ ...p, [group]: !p[group] }))}
      aria-expanded={navGroupIsOpen(group)}
      className={`w-full flex items-center justify-between px-4 mb-1 font-bold tracking-wider text-white bg-pink-500 ${
        compact ? 'py-1.5 text-[13px]' : 'py-2 text-[16px]'
      }`}
    >
      {group}
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={`flex-shrink-0 transition-transform duration-200 ${navGroupIsOpen(group) ? 'rotate-180' : ''}`}
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
  // ★ 本文の拡大率。★ 1 のときは何もしない（★ 判断はこの1か所）。
  const mainZoom = isDesktop && activeTab !== 'board' ? 1.2 : 1;
  const navVisible = (key: TabKey) => key !== 'jobs' || Boolean(salon?.jobs_enabled);
  // ★ バッジ（ネット予約の未処理／運営事務局の未読）。★ 0 のときは null＝出さない。
  //   ★ 色は要対応のピンク。赤（rose）は /admin のメール不達＝取りこぼし専用なので使わない。
  const navBadge = (key: TabKey): number | null => {
    if (key === 'booking' && bookingNewCount > 0) return bookingNewCount;
    if (key === 'support' && supportUnread > 0) return supportUnread;
    return null;
  };

  // ★ スマホの「その他」の見た目（2026-09-06 第185便）。
  //   ★ 中の画面を開いているときは、閉じていてもピンクにする（★ いまどこに居るか分かるため）。
  //   ★ バッジは中の合計（★ 運営事務局の未読は、閉じていても気づけるように）。
  const mobileOtherKeys = MOBILE_OTHER_SECTIONS.flatMap((sec) => sec.keys);
  const mobileOtherHere = mobileOtherKeys.includes(activeTab);
  const mobileOtherBadge = mobileOtherKeys.reduce((sum, k) => sum + (navBadge(k) ?? 0), 0);

  // ★★★ フクエスサイト（公式HP）への入口（2026-09-06 第184便・カッキーさんの指示）。★ 全店舗に出す。
  //   ★★ 表示は salon_sites（公式HPの、1店舗1行の表）だけを見て【自動で】決まる。
  //      ★ 店舗様の設定は一切要らない。★ 運営が行を作る／status を live にする、といういまの運用そのまま。
  //      ★ 判断はこの1か所（家のルール4：画面で言葉や順番を作らない）。
  //
  //        行が無い          → フクエスサイト（申し込み受付中）→ /hp/templates（デザイン一覧＝営業ページ）
  //        行あり・draft     → フクエスサイト（制作中）        → ★ リンクにしない（灰色・押せない）
  //        行あり・suspended → 同上（★ 停止の理由は画面に出さない。連絡は運営事務局から）
  //        行あり・live      → フクエスサイト（公式HP）        → 独自ドメイン、無ければ /hp/{slug}
  //
  //   ★ draft を押せなくしているのは、開いても「ただいま準備中です」の白い1枚しか出ないため
  //     （/hp/[slug]/page.tsx の status ゲート）。★ 押せると誤解させるものは置かない。
  //   ★★ salons.official_url（店舗基本設定の「公式サイトURL」）とは混ぜない。
  //     あちらは他社で作ったサイトも入る欄で、フクエスが作ったサイトとは別物。
  const hpNav: { label: string; href: string | null } | null =
    hpSite === undefined
      // ★ まだ読んでいない。★ 一瞬「申し込み受付中」と出てから変わるのを防ぐため、何も描かない。
      ? null
      : hpSite === null
        ? { label: 'フクエスサイト（申し込み受付中）', href: '/hp/templates' }
        : hpSite.status !== 'live'
          ? { label: 'フクエスサイト（制作中）', href: null }
          : {
              label: 'フクエスサイト（公式HP）',
              // ★ 独自ドメインは外のサイトなので絶対URL。★ www. は落とす（公開HP側と同じ normalizeHpSiteKey）。
              href: (hpSite.domain ?? '').trim() !== ''
                ? `https://${normalizeHpSiteKey(hpSite.domain as string)}/`
                : `/hp/${hpSite.slug}`,
            };

  const renderHpLink = (pc: boolean) => {
    // ★ まだ読んでいないあいだは描かない（上の hpNav のコメント参照）。
    if (!hpNav) return null;
    if (hpNav.href === null) {
      // ★ 制作中・停止中。★ フクエスCRM（準備中）と同じ見た目にそろえる。
      return (
        <div
          aria-disabled
          className={
            pc
              ? 'inline-flex w-full items-center justify-start gap-2.5 border-0 border-l-4 border-l-transparent px-4 py-3 text-[16px] font-bold text-slate-300 cursor-default select-none'
              // ★ スマホは「その他」の中の項目と同じ形（★ 押せないので文字は薄いまま）。
          : 'inline-flex w-full items-center justify-start gap-2 border-0 border-l-4 border-l-transparent px-4 py-2.5 text-[13px] font-bold text-slate-300 cursor-default select-none'
          }
        >
          {tabIcon('hp')}
          {hpNav.label}
        </div>
      );
    }
    return (
      <Link
        href={hpNav.href}
        target="_blank"
        rel="noopener noreferrer"
        className={
          pc
            ? 'inline-flex w-full items-center justify-start gap-2.5 border-0 border-l-4 border-l-transparent px-4 py-3 text-[16px] font-bold text-slate-400 transition-colors hover:bg-pink-50/40 hover:text-slate-600'
            // ★ スマホは「その他」の中の項目と同じ形にそろえる（2026-09-06・カッキーさんの指示）。
          //   ★ フクエスワーク（求人）と同じ 13px・px-4・py-2.5・text-slate-500。
          : 'inline-flex w-full items-center justify-start gap-2 border-0 border-l-4 border-l-transparent px-4 py-2.5 text-[13px] font-bold text-slate-500 transition-colors'
        }
      >
        {tabIcon('hp')}
        {hpNav.label}
      </Link>
    );
  };

  // ★★ フクエックス（SNS）への入口（2026-09-06・カッキーさんの指示）。★ 全店舗に出す。
  //   ★ 飛び先は上から順に決める（★ 判断はこの1か所）:
  //     1. 連携しているフクエックスの店舗アカウント（/x/u/ハンドル）
  //        ＝ 同じログインで作った kind='shop' の承認済みアカウント。★ 店舗様の設定は要らない。
  //     2. 店舗基本設定の「fukuX URL」（1が未連携で、手で入れてある場合）
  //     3. フクエックスのトップ（/x）＝ まだ何も無いとき。★ 白い画面を出さない。
  const fukuxHref = xShopHandle
    ? `/x/u/${encodeURIComponent(xShopHandle)}`
    : ((salon?.fukux_url ?? '').trim() || '/x');
  const renderFukuxLink = (pc: boolean) => (
    <Link
      href={fukuxHref}
      target="_blank"
      rel="noopener noreferrer"
      className={
        pc
          ? 'inline-flex w-full items-center justify-start gap-2.5 border-0 border-l-4 border-l-transparent px-4 py-3 text-[16px] font-bold text-slate-400 transition-colors hover:bg-pink-50/40 hover:text-slate-600'
          // ★ スマホは「その他」の中の項目と同じ形にそろえる（2026-09-06・カッキーさんの指示）。
          //   ★ フクエスワーク（求人）と同じ 13px・px-4・py-2.5・text-slate-500。
          : 'inline-flex w-full items-center justify-start gap-2 border-0 border-l-4 border-l-transparent px-4 py-2.5 text-[13px] font-bold text-slate-500 transition-colors'
      }
    >
      {tabIcon('fukux')}
      フクエックス（SNS）
    </Link>
  );

  // ★★ フクエスCRM（準備中）（2026-09-06・カッキーさんの指示）。
  //   ★ まだ行き先が無いので、リンクにしない（★ 押せると誤解させるものは置かない）。
  //   ★ 灰色のまま・触っても何も起きない。★ 出来たらここを renderFukuxLink と同じ形にする。
  const renderCrmSoon = (pc: boolean) => (
    <div
      aria-disabled
      className={
        pc
          ? 'inline-flex w-full items-center justify-start gap-2.5 border-0 border-l-4 border-l-transparent px-4 py-3 text-[16px] font-bold text-slate-300 cursor-default select-none'
          // ★ スマホは「その他」の中の項目と同じ形（★ 押せないので文字は薄いまま）。
          : 'inline-flex w-full items-center justify-start gap-2 border-0 border-l-4 border-l-transparent px-4 py-2.5 text-[13px] font-bold text-slate-300 cursor-default select-none'
      }
    >
      {tabIcon('crm')}
      フクエスCRM（準備中）
    </div>
  );

  // ★★ 「今すぐ」のリロード・保存（2026-09-06 第185便・カッキーさんの指示）。
  //   ★ 置き場所はセラピスト一覧のすぐ上・右詰め。★ 出勤者0名のときも出す（リロードが要るため）。
  //   ★ 部品（コンポーネント）ではなく関数にしている
  //     （★ 中で作った部品は毎回別物になり、押した瞬間に作り直される）。
  const renderAvailableActions = () => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={handleAvailableNowReload}
        disabled={reloadingAvailable || savingAvailable}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-none border border-slate-200 bg-white text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 4v7h-7" />
        </svg>
        {reloadingAvailable ? '読込中...' : 'リロード'}
      </button>
      <button
        onClick={handleAvailableNowSave}
        disabled={savingAvailable}
        className={saveBtn}
      >
        {savingAvailable ? '保存中...' : '保存する'}
      </button>
    </div>
  );

  // ★★★ フクエスワーク（求人）（第220便・2026-09-08・カッキーさんの指示）。
  //   ★ タブではなく専用サイト /mypage/jobs への入口（★ フクエスリンクとまったく同じ形）。
  //   ★ 新しいタブで開く。★ 出すのはフクエスワーク掲載（jobs_enabled）契約店だけ。
  const renderJobsLink = (pc: boolean) => (
    <Link
      href="/mypage/jobs"
      target="_blank"
      rel="noopener noreferrer"
      className={
        pc
          ? 'inline-flex w-full items-center justify-start gap-2.5 border-0 border-l-4 border-l-transparent px-4 py-3 text-[16px] font-bold text-slate-400 transition-colors hover:bg-pink-50/40 hover:text-slate-600'
          : 'inline-flex w-full items-center justify-start gap-2 border-0 border-l-4 border-l-transparent px-4 py-2.5 text-[13px] font-bold text-slate-500 transition-colors'
      }
    >
      {tabIcon('jobs')}
      フクエスワーク（求人）
    </Link>
  );

  const renderMediaLink = (pc: boolean) => (
    <Link
      href="/mypage/media"
      target="_blank"
      rel="noopener noreferrer"
      className={
        pc
          ? 'inline-flex w-full items-center justify-start gap-2.5 border-0 border-l-4 border-l-transparent px-4 py-3 text-[16px] font-bold text-slate-400 transition-colors hover:bg-pink-50/40 hover:text-slate-600'
          // ★ スマホは「その他」の中の項目と同じ形にそろえる（2026-09-06・カッキーさんの指示）。
          //   ★ フクエスワーク（求人）と同じ 13px・px-4・py-2.5・text-slate-500。
          : 'inline-flex w-full items-center justify-start gap-2 border-0 border-l-4 border-l-transparent px-4 py-2.5 text-[13px] font-bold text-slate-500 transition-colors'
      }
    >
      {tabIcon('media')}
      フクエスリンク（媒体連携）
    </Link>
  );

  return (
    <div className="min-h-screen">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-none px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <div ref={pageHeaderRef} className="sticky top-0 z-40 bg-white shadow-sm">
        <header className="border-b border-slate-100">
          <div className="px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* ★ スマホだけ: 左ドロワーを開く三本線（第216便）。★ PCは左サイドバーがあるので出さない。
                  ★ 中の画面を開いているときはピンク（★ いまどこに居るか分かるため）。
                  ★ バッジは中の合計（★ 運営事務局の未読に、閉じていても気づけるように）。 */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="メニューを開く"
                aria-expanded={drawerOpen}
                // ★ 目立たせる（2026-09-08・カッキーさんの指示）: いつもピンク。★ 中の画面を開いているときは濃いピンク。
                className={`md:hidden relative -ml-1 p-1 transition-colors ${mobileOtherHere ? 'text-pink-700' : 'text-pink-500'}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {mobileOtherBadge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-none bg-pink-500 text-white text-[9px] font-black leading-none">
                    {mobileOtherBadge}
                  </span>
                )}
              </button>
              <h1 className="text-base font-black text-slate-800 tracking-wide">マイページ</h1>
            </div>
            <div className="flex items-center gap-4">
              {/* 予約ボードへの近道（2026-08-14 追加）。営業中いちばん使うタブなのでヘッダーに常設し、
                  他のリンク（slate-400）と違いピンク太字で目立たせる。 */}
              <button
                onClick={() => goTab('board')}
                className="text-xs text-pink-500 hover:text-pink-600 font-black transition-colors"
              >
                予約ボード
              </button>
              <Link href={salon ? `/salon/${salon.id}` : '/'} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-pink-600 font-medium transition-colors">
                サイトを見る
              </Link>
              <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors">
                ログアウト
              </button>
            </div>
          </div>
        </header>
        <SiteNoticeBanner />

      </div>

      {/* ── 左サイドバー ＋ 右側の本文（2026-09-06・サイドバー化）──
          ★★ PCは左に全項目を縦並び（グループ見出し付き）。
          ★★ スマホは2階層（2026-09-06・カッキーさんの指示）:
              上の行は「店舗情報」＋日々の更新など。★ 「店舗情報」を選ぶと、その下に
              コースメニュー／店舗画像／テーマ／バナー／ポップアップ／フリーページが出る。
              ★ スマホで17個を全部並べると4行になり、押し間違えるため。
          ★ 中身（各画面）は今までと同じものを hidden で出し分けている。作りは変えていない。 */}
      <div className="md:flex md:items-start">
        {/* ★ PCではサイドバーを画面の左に貼り付ける（2026-09-06・カッキーさんの指示）。
            ★ 本文を下にスクロールしても、サイドバーは動かない。
            ★★ サイドバーと本文は【完全に別々】に動く（2026-09-06）:
              ・md:h-… ＝ 画面の高さぴったりに固定する（★ max-h だと中身が短いとき、
                サイドバーの上で回したホイールが本文に流れてしまう）
              ・md:overscroll-contain ＝ サイドバーを下まで／上まで送っても、
                そこから本文へスクロールが伝わらない（★ これが「一緒についてくる」の正体）
            ★ 位置と高さは共通ヘッダーの高さ（--nav-top）を引いて決める。★ スマホでは使わない。 */}
        <aside
          style={{ '--nav-top': `${pageHeaderH}px` } as React.CSSProperties}
          className="bg-white border-b border-slate-100 md:border-b-0 md:border-r md:w-[288px] md:flex-none md:self-start md:sticky md:top-[var(--nav-top)] md:h-[calc(100vh_-_var(--nav-top))] md:overflow-y-auto md:overscroll-contain scrollbar-none"
        >

          {/* ★ サイドバーの頭（PCだけ）。★ フクエスリンクと同じ形: 印＋名前＋店舗名。2026-09-06 */}
          <div className="hidden md:block">
            <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-100">
              {/* ★ ヘッダー共通ロゴ（Logo.tsx）と同じ肉球＋オレンジ→ピンクのグラデ文字。
                  ★ サイドバーは幅が狭いので、サブテキスト（～福岡メンズエステポータル～）は出さない。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="w-7 h-7 flex-shrink-0" />
              <span
                className="font-bold text-[22px] tracking-wide leading-none inline-block"
                style={{
                  background: 'linear-gradient(95deg,#FB923C,#DB2777)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                フクエス
              </span>
            </div>
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-[12.5px] font-bold text-slate-400 tracking-wider">店舗</div>
              {/* ★ 長い店舗名でも1行に収める（2026-09-06・カッキーさんの指示）。
                  ★ サイドバーの幅は固定（288px）なので、文字数から大きさを決めれば足りる。
                  ★ それでも入りきらないときだけ「…」で切る（★ 2行にはしない）。 */}
              <div
                ref={salonNameRef}
                className="font-bold text-slate-600 mt-0.5 leading-snug whitespace-nowrap overflow-hidden"
                style={{ fontSize: '15.5px', textOverflow: 'ellipsis' }}
                title={salonForm.name ?? ''}
              >
                {salonForm.name ?? ''}
              </div>
            </div>
          </div>

          {/* ══ スマホ（2026-09-06 第185便・カッキーさんの指示）══
              ★ 毎日さわる8つを 2行×4列 で【直に】出す。★ 開かずに1タップ。
              ★ 残りは全部いちばん下の「その他」の中（★ 店舗情報・関連サイトはアコーディオン）。
              ★ 並びの元は MOBILE_MAIN。★ 書かれていない画面は自動で「その他」に入る。 */}
          <div className="md:hidden">
            {/* ★ 4列×2行。★ すきま(gap-px)に薄い線が見えるよう、下地を slate-100 にしている。 */}
            <div className="grid grid-cols-4 gap-px bg-slate-100">
              {MOBILE_MAIN_KEYS.filter(navVisible).map((k) => {
                const n = MYPAGE_NAV.find((x) => x.key === k);
                if (!n) return null;
                const selected = activeTab === k;
                const badge = navBadge(k);
                return (
                  <button
                    key={k}
                    onClick={() => goTab(k)}
                    aria-pressed={selected}
                    className={`relative flex flex-col items-center justify-center gap-1 px-1 py-2.5 bg-white border-b-2 text-[11px] font-bold leading-none transition-colors ${
                      selected ? 'border-b-pink-500 text-pink-600' : 'border-b-transparent text-slate-400'
                    }`}
                  >
                    {tabIcon(k)}
                    {/* ★ 選んでいるタブは【文字だけ】をピンクのグラデーションに（★ PCと同じ作法）。
                        ★ アイコンは currentColor なので、この span に入れると透明になって消える。 */}
                    {selected ? (
                      <span className="bg-gradient-to-r from-pink-600 to-pink-400 bg-clip-text text-transparent whitespace-nowrap">
                        {n.label}
                      </span>
                    ) : (
                      <span className="whitespace-nowrap">{n.label}</span>
                    )}
                    {badge !== null && (
                      <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-none bg-pink-500 text-white text-[9px] font-black leading-none">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ★ ここにあった「その他」（折りたたみ）は 2026-09-08 に左ドロワーへ移した（第216便）。 */}
          </div>

          {/* ══ スマホの左ドロワー（第216便・2026-09-08）══
              ★ ヘッダー左の三本線で開く。★ 背面（黒の半透明）をタップ／×／Esc／項目を押す、で閉じる。
              ★ 中身は「その他」に入っていたものと同じ（店舗情報・関連サイト・運営事務局）。
              ★ 見出しはPCと同じピンクの帯だが、ドロワーの中では【たたまない】（★ 開いてすぐ全部見える）。
              ★ 閉じているときは描かない（★ hidden ではなく描かない）。 */}
          {/* ★ 高さは dvh（実機のブラウザのアドレスバー・下のバーを除いた【見えている高さ】）。
              ★ inset-0（100vh）だと、実機で下のバーに隠れた分がスクロールできず、
                いちばん下の「運営事務局」が見えなかった（2026-09-08・カッキーさんの実機確認）。 */}
          {drawerOpen && (
            <div className="md:hidden fixed inset-x-0 top-0 h-dvh z-50" role="dialog" aria-modal="true" aria-label="メニュー">
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={() => setDrawerOpen(false)}
                className="absolute inset-0 bg-black/40"
              />
              <nav
                aria-label="その他のメニュー"
                className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl overflow-y-auto overscroll-contain scrollbar-none pb-24 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="text-sm font-black text-slate-700">メニュー</span>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="閉じる"
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
                {MOBILE_OTHER_SECTIONS.map((sec) => {
                  const keys = sec.keys.filter(navVisible);
                  const isSites = sec.group === '関連サイト';
                  const withMedia = isSites && mediaVisible;
                  // ★ 「関連サイト」は中の画面が0個でも残す（★ 全店舗に出す外部リンクが入っているため）。
                  if (keys.length === 0 && !isSites) return null;
                  return (
                    <div key={sec.group || '(見出しなし)'} className="contents">
                      {sec.group ? (
                        <div className="mt-2 mb-1 px-4 py-1.5 font-bold tracking-wider text-[13px] text-white bg-pink-500">
                          {sec.group}
                        </div>
                      ) : (
                        // ★ 見出しの無いまとまり（運営事務局）は、区切り線の下に少し間を空ける（2026-09-08・カッキーさんの指示）。
                        <div className="mt-6 mb-2 border-t border-slate-100" />
                      )}
                      {keys.map((key) => {
                        const n = MYPAGE_NAV.find((x) => x.key === key);
                        if (!n) return null;
                        const selected = activeTab === key;
                        const badge = navBadge(key);
                        return (
                          <button
                            key={key}
                            onClick={() => { goTab(key); setDrawerOpen(false); }}
                            aria-pressed={selected}
                            className={`inline-flex w-full items-center justify-start gap-2 border-0 border-l-4 px-4 py-2.5 text-[13px] font-bold transition-colors ${
                              selected
                                ? 'bg-pink-50 text-pink-600 border-l-pink-500'
                                : 'text-slate-500 border-l-transparent'
                            }`}
                          >
                            {tabIcon(key)}
                            {n.label}
                            {badge !== null && (
                              <span className="ml-auto inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-none bg-pink-500 text-white text-[9px] font-black leading-none">
                                {badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {/* ★ 外部リンクは「関連サイト」の中。★ 並びはPCと同じ（★ 変えるときは両方）。 */}
                      {isSites && salon?.jobs_enabled && renderJobsLink(false)}
                      {withMedia && renderMediaLink(false)}
                      {isSites && renderFukuxLink(false)}
                      {isSites && renderCrmSoon(false)}
                      {isSites && renderHpLink(false)}
                    </div>
                  );
                })}
              </nav>
            </div>
          )}

          {/* ══ PC（見出しのまとまりごとに、上から並べる）══
              ★ 並びの正は MYPAGE_NAV ただ1つ（★ ここでは順番を作らない）。
              ★ たたんである見出しの中身は【描かない】（隠すのではなく描かない）。 */}
          <nav aria-label="マイページのメニュー" className="hidden md:flex md:flex-col md:pt-2 md:pb-40">
            {NAV_SECTIONS.map((sec) => {
              // 求人はフクエスワーク掲載（jobs_enabled）契約店のみ表示。
              const keys = sec.keys.filter(navVisible);
              // ★ 「関連サイト」にはフクエスリンク（媒体連携）も入る。★ 出す相手にしか描かない（第54便）。
              const withMedia = sec.group === '関連サイト' && mediaVisible;
              // ★★ 「関連サイト」には、契約に関係なく全店舗に出すものが入っている
              //   （フクエスサイト・フクエックス・フクエスCRM）。★ 見出しごと消してはいけない。
              //   ★ 第184便より前は、求人も媒体連携も無い店舗で「関連サイト」が丸ごと消えていた。
              const alwaysShown = sec.group === '関連サイト';
              if (keys.length === 0 && !withMedia && !alwaysShown) return null;
              const open = navGroupIsOpen(sec.group);
              return (
                <div key={sec.group || '(見出しなし)'} className="contents">
                  {/* ★ NAV_BAND_GROUPS の見出しは大きくピンクの帯（2026-09-06・カッキーさんの指示）。
                      ★ よくさわる場所なので、他の見出しより目に入るようにする。 */}
                  {/* ★ 見出しの無いまとまり（運営事務局）は、上に区切りの横線を引く。
                      ★ そうしないと、すぐ上の「関連サイト」の中身に見えてしまう（2026-09-06）。 */}
                  {!sec.group && <div className="mt-4 mb-5 border-t border-slate-200" />}
                  {sec.group && (
                    NAV_ACCORDION_GROUPS.has(sec.group) ? (
                      navBandButton(sec.group)
                    ) : (
                      <div
                        className={
                          NAV_BAND_GROUPS.has(sec.group)
                            ? 'px-4 py-2 mb-1 font-bold tracking-wider text-[16px] text-white bg-pink-500'
                            : 'px-4 pt-3.5 pb-1 font-bold tracking-wider text-[13px] text-slate-400'
                        }
                      >
                        {sec.group}
                      </div>
                    )
                  )}
                  {open && keys.map((key) => {
                    const n = MYPAGE_NAV.find((x) => x.key === key);
                    if (!n) return null;
                    const selected = activeTab === key;
                    return (
                      <button
                        key={key}
                        onClick={() => goTab(key)}
                        aria-pressed={selected}
                        className={`relative inline-flex w-full items-center justify-start gap-2.5 border-0 border-l-4 border-l-transparent px-4 py-3 text-[16px] font-bold transition-colors ${
                          selected
                            ? 'bg-white text-pink-600'
                            : 'bg-white text-slate-400 hover:bg-pink-50/40 hover:text-slate-600'
                        }`}
                      >
                        {tabIcon(key)}
                        {/* ★ 選んでいる項目は【文字だけ】をピンクのグラデーションにする
                            （2026-09-06・カッキーさんの指示。★ 帯で塗りつぶさない）。
                            ★ アイコンは currentColor なので、ボタン側の text-pink-600 で色が付く
                              （★ 文字と同じ span に入れると、透明になって消える）。 */}
                        {selected ? (
                          <span className="bg-gradient-to-r from-pink-600 to-pink-400 bg-clip-text text-transparent">
                            {n.label}
                          </span>
                        ) : (
                          n.label
                        )}
                        {navBadge(key) !== null && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-none bg-pink-500 text-white text-[9px] font-black leading-none">
                            {navBadge(key)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {/* ★★★ フクエスリンク（媒体連携）（第55便・㉜）。★ タブではなく専用ページ /mypage/media への入口。
                      ★ 新しいタブで開く（2026-08-30・カッキーさんの決定）。 */}
                  {/* ★ フクエスワーク（求人）→ フクエスリンク の順（★ 第184便までの並びのまま）。 */}
                  {open && sec.group === '関連サイト' && salon?.jobs_enabled && renderJobsLink(true)}
                  {open && withMedia && renderMediaLink(true)}
                  {/* ★ フクエックス（SNS）。★ 媒体連携と違い、契約に関係なく全店舗に出す。 */}
                  {open && sec.group === '関連サイト' && renderFukuxLink(true)}
                  {open && sec.group === '関連サイト' && renderCrmSoon(true)}
                  {/* ★★ フクエスサイト（公式HP）。★ 契約に関係なく全店舗に出す（第184便）。
                      ★ 中身（申し込み受付中／制作中／公式HP）は hpNav が決める。
                      ★ 位置は【いちばん下】（2026-09-06・カッキーさんの指示でCRMの下へ）。 */}
                  {open && sec.group === '関連サイト' && renderHpLink(true)}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">

        {/* ★★★ 媒体連携が「書き込みの向きのまま止まっている」ときの警告（第47便）。
            ★ タブの中ではなくトップに出す。媒体連携タブを開かない限り気づけない、では見張りにならない
              （設計メモ §2-3「失敗を店舗に届ける」・追記11 §40）。 */}
        {mediaVisible && mediaAlerts.length > 0 && (
          <div className="max-w-2xl mx-auto px-3 pt-2">
            {mediaAlerts.map((a) => (
              <div
                // ★ 同じ枠で2つ鳴ることがある（書く向きの見張りと取り込みの見張り・第51便）。
                //   ★ provider#slot だけでは key が衝突する。reason まで入れて分ける
                key={a.watch + ':' + a.reason + ':' + a.provider + '#' + a.slot}
                className="mb-2 rounded-none border-2 border-rose-300 bg-rose-50 px-3 py-2.5"
              >
                {/* ★★ 見出しを見張りごとに変える（第51便）。
                    ★ 「媒体連携が止まっています」は【書く向き】の話。取り込みが止まったときに
                      同じ見出しを出すと、店舗はどちらを直せばよいか分からない。 */}
                <p className="text-[12px] font-bold text-rose-700">
                  {a.watch === 'import' ? '駅ちかからの取り込みが止まっています' : '媒体連携が止まっています'}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-rose-900">{a.message}</p>
                {/* ★ 第55便: 媒体連携はタブではなく専用ページ（/mypage/media）になった。
                    ★ 見張りはここ（マイページのトップ）に残す。
                      媒体連携を開かない限り気づけない、では見張りにならない（設計メモ §2-3） */}
                {/* ★ 新しいタブで開く（2026-08-30・カッキーさんの決定）。
                    ★ マイページを開いたまま媒体連携を見られるようにする。
                      店舗は「マイページの内容を見ながら媒体連携をいじる」ため、行き来が要る。 */}
                <Link
                  href="/mypage/media"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-[12px] font-bold text-rose-700 underline"
                >
                  媒体連携をひらく
                </Link>
              </div>
            ))}
          </div>
        )}


      {/* ★ 予約ボードタブのときだけ横幅いっぱい（左右の余白5px）にする。
          ★ 表が横に長いため、背景が見えるぶんだけ表が狭くなる。
            2026-08-14 は max-w-6xl（1152px）＋px-2 だった → 2026-09-06 にカッキーさんの指示で
            上限なし＋5px に広げた。他のタブは hidden なので影響しない。 */}
      {/* ★ 本文だけ1.2倍（2026-09-06）。★ 予約ボードは横長の表なので拡大しない。
          ★ 倍率は mainZoom の数字1つ。★ 1.5倍は大きすぎたので1.2倍にした。 */}
      <main
        style={mainZoom === 1 ? undefined : { zoom: mainZoom }}
        className={`${activeTab === 'board' ? 'max-w-none px-[5px]' : 'max-w-2xl px-4'} mx-auto py-6 space-y-6 ${activeTab === 'salon' || activeTab === 'booking' ? 'pb-28' : ''}`}
      >

        {/* ── 店名（最上部・独立ブロック）──
            ★★ PCでは消した（★ サイドバーの頭に店舗名が出るため・2026-09-06）。
            ★ スマホはサイドバーの頭が無いので、ここに残す。 */}
        <div className="md:hidden max-w-2xl mx-auto w-full bg-white rounded-none border border-slate-100 shadow-sm p-5 text-center">
          <h2
            className="font-black text-slate-800 whitespace-nowrap overflow-hidden"
            style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis' }}
          >
            {salonForm.name ?? ''}
          </h2>
        </div>

        {/* ── 上位表示（TOP・地域ページの店舗カードを先頭へ）──
            ★★ 「今すぐ」の画面のいちばん上に置いた（2026-09-06・カッキーさんの指示）。
            ★ /mypage を開いて最初に出る画面＝いちばん押される場所。 */}
        {salon && (
          <div className={activeTab === 'available' ? '' : 'hidden'}>
            <SalonBumpButton salonId={Number(salon.id)} />
          </div>
        )}

        {/* ── コースメニュー（料金表）──
            ★ 「店舗情報の編集」から切り出して、その上の独立ブロックにした（2026-09-06・カッキーさんの指示）。
            ★ 中身はコース／その他メニュー／備考の3つ。保存は店舗情報と同じ handleSalonSave。 */}
        <div className={`bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-4 ${activeTab === 'course' ? '' : 'hidden'}`}>
          <button
            type="button"
            onClick={() => setCourseOpen(v => !v)}
            aria-expanded={courseOpen}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <h2 className="text-sm font-black text-slate-700">コースメニューの設定</h2>
            {/* ★ 矢印は店舗装飾タブの AccordionCard と同じ形（開くと180度回る）。 */}
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${courseOpen ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {courseOpen && (
          <div>
            <label className={labelClass}>コースメニュー</label>
            <div className="space-y-3">
              {courseGroups.map((group, gi) => (
                <div key={gi} className="rounded-none border border-pink-100 bg-pink-50/20 p-3 space-y-2">
                  {/* コース名 */}
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 px-3 py-2 rounded-none border border-pink-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 font-bold placeholder:font-normal placeholder:text-slate-300"
                      placeholder="コース名（例: アロマリラクゼーション）"
                      value={group.name}
                      onChange={(e) => setCourseGroups(prev => prev.map((g, i) => i === gi ? { ...g, name: e.target.value } : g))}
                    />
                    <button
                      type="button"
                      onClick={() => setCourseGroups(prev => prev.filter((_, i) => i !== gi))}
                      className="px-2.5 py-1.5 rounded-none border border-rose-200 text-rose-400 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors flex-shrink-0"
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
                          className="w-16 flex-shrink-0 px-2 py-1.5 rounded-none border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 text-center placeholder:text-slate-300"
                        />
                        <span className="text-xs text-slate-500 flex-shrink-0">分 / ¥</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="8000"
                          value={item.price}
                          onChange={(e) => setCourseGroups(prev => prev.map((g, gi2) => gi2 === gi ? { ...g, items: g.items.map((it, ii2) => ii2 === ii ? { ...it, price: e.target.value } : it) } : g))}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-none border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 placeholder:text-slate-300"
                        />
                        <span className="text-xs text-slate-500 flex-shrink-0">円</span>
                        {group.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setCourseGroups(prev => prev.map((g, gi2) => gi2 === gi ? { ...g, items: g.items.filter((_, ii2) => ii2 !== ii) } : g))}
                            className="w-7 h-7 flex items-center justify-center rounded-none border border-slate-200 text-slate-400 hover:text-rose-400 hover:border-rose-200 text-sm font-bold transition-colors flex-shrink-0"
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
            <div className="mt-4 rounded-none border border-pink-100 bg-pink-50/20 p-3 space-y-2">
              <p className="text-xs font-bold text-slate-600">その他メニュー追加</p>
              <div className="space-y-1.5">
                {otherItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 w-full">
                    <input
                      type="text"
                      placeholder="メニュー名（例：延長30分）"
                      value={item.label}
                      onChange={(e) => setOtherItems(prev => prev.map((it, ii) => ii === i ? { ...it, label: e.target.value } : it))}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-none border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 placeholder:text-slate-300"
                    />
                    <span className="text-xs text-slate-500 flex-shrink-0">/ ¥</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="料金"
                      value={item.price}
                      onChange={(e) => setOtherItems(prev => prev.map((it, ii) => ii === i ? { ...it, price: e.target.value } : it))}
                      className="w-20 flex-shrink-0 min-w-0 px-2 py-1.5 rounded-none border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 placeholder:text-slate-300"
                    />
                    <span className="text-xs text-slate-500 flex-shrink-0">円</span>
                    {otherItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setOtherItems(prev => prev.filter((_, ii) => ii !== i))}
                        className="w-7 h-7 flex items-center justify-center rounded-none border border-slate-200 text-slate-400 hover:text-rose-400 hover:border-rose-200 text-sm font-bold transition-colors flex-shrink-0"
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
            {/* 備考（salons.course_note）。料金表の一番下・税込注記の上に出る。空欄なら表示されない。 */}
            <div className="mt-4 rounded-none border border-pink-100 bg-pink-50/20 p-3 space-y-2">
              <p className="text-xs font-bold text-slate-600">備考</p>
              <textarea
                rows={3}
                placeholder="例：初回指名料は無料。&#10;延長はできない場合もあります。"
                value={salonForm.course_note ?? ''}
                onChange={(e) => setSalonForm((p) => ({ ...p, course_note: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-none border border-slate-200 text-sm bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                料金表の一番下（税込みの注記の上）に表示されます。
              </p>
            </div>
          </div>
          )}

          {courseOpen && (
          <div className="pt-1 flex justify-end">
            <button className={saveBtn} onClick={handleSalonSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
          )}
        </div>

        {/* ── サロン情報編集 ── */}
        <div className={`bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-4 ${activeTab === 'salon' ? '' : 'hidden'}`}>
          <button
            type="button"
            onClick={() => setSalonInfoOpen(v => !v)}
            aria-expanded={salonInfoOpen}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <h2 className="text-sm font-black text-slate-700">店舗情報の設定</h2>
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${salonInfoOpen ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {salonInfoOpen && (
          <div className="space-y-4">
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
            <label className={labelClass}>LINE予約URL（任意）</label>
            <input className={inputClass} value={salonForm.line_url ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, line_url: e.target.value }))} placeholder="https://lin.ee/xxxx または https://line.me/..." />
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">LINE公式アカウントの友だち追加URL等。</p>
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
            <p className="text-[10px] text-slate-400 mt-1">https:// から始まる正しいURLを入力してください。</p>
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
            <p className="text-[10px] text-slate-400 mt-1">https:// から始まる正しいURLを入力してください。</p>
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
                    className={`flex items-center gap-1.5 text-xs font-bold rounded-none border px-2.5 py-1.5 cursor-pointer transition-colors ${
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
            <p className="text-[10px] text-slate-400 mt-1">店舗ページの「店舗基本情報」に表示されます。</p>
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
              他社の決済ページURLを設定で、料金ページに「クレジットカード決済」欄が表示されます。フクエスは決済処理には関与しません。
            </p>
            <div className="mt-3">
              <p className="text-[11px] font-bold text-slate-500 mb-1.5">対応カードブランド</p>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_CARD_OPTIONS.map((card) => {
                  const checked = (salonForm.payment_cards ?? []).includes(card.slug);
                  return (
                    <label
                      key={card.slug}
                      className={`flex items-center gap-1.5 text-xs font-bold rounded-none border px-2.5 py-1.5 cursor-pointer transition-colors ${
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
            <p className="mb-1 text-[11px] text-slate-400">TOP・地域ページの店舗カードに表示されます（最大27文字）。</p>
            <input
              type="text"
              maxLength={27}
              className={inputClass}
              placeholder="例：癒しと非日常を、あなたに。"
              value={salonForm.catchphrase ?? ''}
              onChange={(e) => setSalonForm((prev) => ({ ...prev, catchphrase: e.target.value.slice(0, 27) }))}
            />
            <p className="mt-0.5 text-right text-[10px] text-slate-400">{(salonForm.catchphrase ?? '').length}/27</p>
          </div>

          <div>
            <label className={labelClass}>店舗紹介</label>
            <textarea rows={12} className={textareaClass} value={salonForm.description ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, description: e.target.value }))} />
          </div>


          {/* ★ 2026-09-09（第226便・カッキーさんの指示）: ここにあった「保存」は削除。
              ★ 画面下に貼り付く保存バー（このファイルの末尾）に一本化した。★ 二重に置かない。 */}
          </div>
          )}
        </div>

        {/* ── 店舗画像の設定 ──
            ★ 「店舗情報の編集」から切り出して独立ブロックにした（2026-09-06・カッキーさんの指示）。
            ★ 見出しで開閉できる（既定は開く）。画像の差し替え・削除・並べ替えはその場で反映される。 */}
        <div className={`bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-4 ${activeTab === 'photos' ? '' : 'hidden'}`}>
          <button
            type="button"
            onClick={() => setSalonImageOpen(v => !v)}
            aria-expanded={salonImageOpen}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <h2 className="text-sm font-black text-slate-700">店舗画像の設定</h2>
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${salonImageOpen ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {salonImageOpen && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>店舗画像（最大3枚・JPEG・PNG・WebP／各5MBまで）</label>
              <span className="text-[10px] text-slate-400">{salonImages.length} / 3</span>
            </div>

            {salonImages.length > 0 && (
              <div className="space-y-3">
                {salonImages.map((img, i) => (
                  <div key={img.id} className="rounded-none border border-pink-100 bg-pink-50/20 p-3 space-y-2">
                    {/* PC用・スマホ用を横並び */}
                    <div className="grid grid-cols-2 gap-3">

                      {/* PC用 */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-500">PC用（推奨 1600×530px）</p>
                        <div className="relative rounded-none overflow-hidden border border-slate-200 bg-slate-50" style={{ aspectRatio: '3/1' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                        <div className="flex gap-1">
                          <label className={`flex-1 flex items-center justify-center cursor-pointer py-1 px-2 rounded-none border text-[10px] font-bold transition-colors ${
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
                            className="py-1 px-2 rounded-none border border-rose-100 text-rose-400 text-[10px] font-bold hover:bg-rose-50 transition-colors"
                          >削除</button>
                        </div>
                      </div>

                      {/* スマホ用 */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-500">スマホ用（推奨 750×470px）</p>
                        <div className="relative rounded-none overflow-hidden border border-slate-200 bg-slate-50" style={{ aspectRatio: '3/1' }}>
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
                          <label className={`flex-1 flex items-center justify-center cursor-pointer py-1 px-2 rounded-none border text-[10px] font-bold transition-colors ${
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
                              className="py-1 px-2 rounded-none border border-rose-100 text-rose-400 text-[10px] font-bold hover:bg-rose-50 transition-colors"
                            >削除</button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 並び替え（削除は各画像の「削除」ボタンで行う） */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-pink-100">
                      <span className="text-[10px] text-slate-600">スロット {i + 1}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => handleImageMove(i, 'up')} disabled={i === 0}
                          className="w-7 h-7 rounded-none border border-slate-200 text-slate-600 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors">↑</button>
                        <button type="button" onClick={() => handleImageMove(i, 'down')} disabled={i === salonImages.length - 1}
                          className="w-7 h-7 rounded-none border border-slate-200 text-slate-600 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors">↓</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {salonImages.length < 3 && (
              <label className={`flex items-center gap-2 cursor-pointer w-full py-2.5 px-4 rounded-none border-2 border-dashed text-xs font-bold transition-colors ${
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
          )}
        </div>

        {/* ── 店舗画像タブ: セラピストの既定画像（第217便・2026-09-08） ── */}
        <div className={`bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-3 ${activeTab === 'photos' ? '' : 'hidden'}`}>
          <h2 className="text-sm font-black text-slate-700">セラピストの既定画像</h2>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            写真が1枚も無いセラピストのカードに、この画像を出します。設定が無ければフクエス共通の画像になります。推奨：縦長（3:4）1080×1440px／JPEG・PNG・WebP、5MBまで。
          </p>
          <div className="flex items-start gap-4">
            <div className="w-24 aspect-[3/4] rounded-none border border-pink-100 overflow-hidden bg-slate-50 flex-shrink-0 flex items-center justify-center">
              {therapistPlaceholder ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={therapistPlaceholder} alt="セラピストの既定画像" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-slate-400">未設定</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center justify-center px-4 py-2 rounded-none border border-pink-300 text-pink-600 text-xs font-bold cursor-pointer hover:bg-pink-50 transition-colors">
                {uploadingPlaceholder ? 'アップ中...' : therapistPlaceholder ? '画像を変更' : '画像を追加'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleTherapistPlaceholderUpload}
                  disabled={uploadingPlaceholder}
                  className="hidden"
                />
              </label>
              {therapistPlaceholder && (
                <button
                  type="button"
                  onClick={handleTherapistPlaceholderDelete}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-none border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors"
                >
                  削除
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── タブ: 予約ボード（1日タイムライン・2026-08-14 新設） ── */}
        {/* hidden 切替で常時マウント（タブを行き来しても日付・パネルの状態を保つ）。
            データの取得は active になったときだけ（BookingBoard 側で制御）。 */}
        <div className={`${activeTab === 'board' ? '' : 'hidden'}`}>
          {salon && <BookingBoard salonId={Number(salon.id)} active={activeTab === 'board'} />}
        </div>

        {/* ── タブ: ネット予約設定 ── */}
        <div className={`space-y-4 ${activeTab === 'booking' ? '' : 'hidden'}`}>

        {/* 予約一覧（新しい順・お客様からのネット予約のみ） */}
        <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">ネット予約一覧</h2>
            {/* 上限に達したときは「200件」と出すと実際の総数に見えてしまうので「直近200件」に変える（2026-08-16）。 */}
            <span className="text-[11px] text-slate-400">
              {bookings.length >= SALON_BOOKINGS_LIMIT ? `直近${SALON_BOOKINGS_LIMIT}件` : `${bookings.length}件`}
            </span>
          </div>
          {/* ── 何が出て何が出ないかの明示（2026-08-16 追加）──
              getSalonBookings() が source='web' で絞っているため、予約ボードに手入力した予約は
              ここに出ない。★ 常時表示にしてある。条件付きにすると「入れたはずの予約が無い」と
              思ったときに限って読めない。データが消えたわけではないことも必ず書くこと。 */}
          <p className="text-[11px] leading-relaxed text-slate-400">
            ネット予約のみを表示しています（電話予約は予約ボードへ）。
          </p>
          {/* ── 表示上限の案内（2026-08-16 追加）──
              getSalonBookings() が .limit(SALON_BOOKINGS_LIMIT) で読んでいるため、
              上限に達すると件数表示が黙って頭打ちになり「古い予約が消えた」と誤解されやすい。
              ★ データは消えていないことを必ず明記すること（自動削除・保持期間の仕組みは存在しない）。
              ちょうど上限と同数のときも出るが、「◯件まで表示しています」は事実として正しい。 */}
          {!bookingsError && !bookingsLoading && bookings.length >= SALON_BOOKINGS_LIMIT && (
            <p className="rounded-none border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              ネット予約を予約日時が新しい順に{SALON_BOOKINGS_LIMIT}件まで表示しています。
              これより古い予約も削除されておらず、データはすべて残っています。
            </p>
          )}
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
                const btnBase = 'text-[11px] font-bold px-2.5 py-1 rounded-none border transition-colors disabled:opacity-50';
                return (
                  <div key={b.id} className={`rounded-none border border-slate-200 p-3 space-y-1.5 ${isCancelled ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-700">{formatBookingSlot(b.slotStart, b.slotEnd)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-none flex-shrink-0 ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span><span className="text-slate-400">指名：</span>{b.therapistName}</span>
                      <span><span className="text-slate-400">コース：</span>{b.courseName}（{b.courseMin}分）</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                      <span><span className="text-slate-400">お客様：</span>{b.customerName}</span>
                      <span><span className="text-slate-400">電話：</span><a href={`tel:${b.customerTel}`} className="text-pink-600 underline">{b.customerTel}</a></span>
                      <span><span className="text-slate-400">ご連絡希望：</span>{callbackPrefLabel(b.callbackPref)}</span>
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

        <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-700">ネット予約の設定</h2>

          <div className="border border-pink-100 rounded-none p-3 bg-pink-50/20 space-y-2.5">
            {/* ★ 2026-09-09（第225便・カッキーさんの指示）: この見出しは見落とされやすいので、
                グレー(text-slate-600)→サイトのピンクに変えて目立たせた。★ 大きさも 14→15px。 */}
            <label className="flex items-center gap-2 text-[15px] font-black text-pink-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(salonForm.booking_enabled)}
                onChange={(e) => setSalonForm((p) => ({ ...p, booking_enabled: e.target.checked }))}
                className="accent-pink-500 w-4 h-4"
              />
              ネット予約を受け付ける
            </label>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {/* ★ 文面は2026-09-06・カッキーさんの指示で短くしたもの（★ 前半の説明は削除）。 */}
              「予約で受け付けるコース」を1つ以上登録してください。
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

              {/* ── 通知先メールのテスト送信（2026-08-16 追加）──
                  宛先の打ち間違いは、保存時のチェックだけでは拾いきれない
                  （形式は正しいが別人のアドレス、など）。Resend のバウンスはアプリに返ってこないので、
                  最後は「お店の受信箱に届いたか」を人が見るしかない。その導線がこのボタン。
                  ★ 送るのは保存済みの booking_email 宛だけ。入力中の値は送らない
                    （サーバー側も salons から読み直す。任意の宛先を受け取ると踏み台になる）。
                  ★ 文言で「保存後に押す」ことを明示すること。入力しただけで押されると、
                    前の宛先に飛んで「届いた」と誤解される。 */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={mailTesting || saving}
                  onClick={async () => {
                    if (!salon) return;
                    setMailTesting(true);
                    setMailTestResult(null);
                    const res = await sendBookingTestMailForSalon(Number(salon.id));
                    setMailTesting(false);
                    setMailTestResult(
                      res.ok
                        ? { ok: true, msg: `${res.to} へ送信しました。受信箱をご確認ください（迷惑メールもご確認ください）` }
                        : { ok: false, msg: res.error },
                    );
                  }}
                  className="rounded-none border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mailTesting ? '送信中…' : '保存済みの宛先にテスト送信'}
                </button>
                <span className="text-[10px] text-slate-400">
                  ※ 先に「保存」してから押してください
                </span>
              </div>
              {mailTestResult && (
                <p
                  className={`mt-2 rounded-none border px-3 py-2 text-[11px] leading-relaxed ${
                    mailTestResult.ok
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-rose-100 bg-rose-50 text-rose-700'
                  }`}
                >
                  {mailTestResult.msg}
                  {mailTestResult.ok && (
                    <>
                      <br />
                      届かない場合はアドレスの打ち間違いが疑われます。修正して保存し、もう一度お試しください。
                    </>
                  )}
                </p>
              )}
            </div>
            {/* 施術後のインターバル（2026-08-15追加）。ネット予約の予約枠に自動で加算する */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">施術後のインターバル</label>
              <select
                data-testid="default-interval-select"
                className={inputClass}
                value={Number(salonForm.default_interval_min ?? 0)}
                onChange={(e) => setSalonForm((p) => ({ ...p, default_interval_min: Number(e.target.value) }))}
              >
                {INTERVAL_MIN_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m === 0 ? 'なし' : `${m}分`}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                コース時間＋インターバル時間で枠を埋めます。
              </p>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ※ ネット予約は「指名予約」のみ受け付けます。
            </p>
          </div>

          {/* 予約で受け付けるコース（料金ページの courses とは独立） */}
          <div className="border border-pink-100 rounded-none p-3 bg-pink-50/20 space-y-2">
            {/* ★ 2026-09-09（第225便・カッキーさんの指示）: 「ネット予約を受け付ける」と対にピンクで目立たせ、
                さらに【ここを設定しないと予約を受け付けられない】ことが見て分かるようにした。
                ★ 判定は1か所（bookingCourses.length === 0）。★ 保存時の検証（既存）は変えていない。 */}
            <label className="flex items-center gap-2 text-[15px] font-black text-pink-600">
              予約で受け付けるコース
              <span className="flex-none text-[10px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded-full">必須</span>
            </label>
            {bookingCourses.length === 0 && (
              <p className="text-[12px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 leading-relaxed">
                ⚠ コースが未登録です。1つ以上登録してください。
              </p>
            )}
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ここに登録したコースがネット予約の選択肢になります。
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ※ 指名料やオプション料金などの追加料金は、ご予約が入った際にお電話またはSMSでお客様に総額をお伝えする運用です。
            </p>
            {bookingCourses.length > 0 && (
              <div className="space-y-2">
                {bookingCourses.map((c, i) => {
                  // 行内 input は inputClass（w-full を含む）を使わない。
                  // w-full が w-20/flex-1 と衝突すると、Tailwind の解決順で幅が暴れ料金欄が潰れるため、
                  // ここは明示クラスで flex 幅（none / 1 / min-w-0）を確定させる。
                  const rowInput = 'rounded-none border border-slate-200 px-3 py-2 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200';
                  return (
                    <div key={i} className="flex flex-col gap-2 rounded-none border border-slate-200 bg-white/60 p-3">
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

          {/* ★ 2026-09-09（第226便・カッキーさんの指示）: ここにあった「保存」は削除。★ 下の保存バーへ一本化。 */}
        </div>
        </div>

        {/* ── タブ2: 出勤設定 ── */}
        <div className={`space-y-3 ${activeTab === 'schedule' ? '' : 'hidden'}`}>
          {/* ★ 名前でしぼり込む（2026-09-06・カッキーさんの指示）。★ 人数が増えても探せるように。 */}
          {therapists.length > 0 && (
            <div className="bg-white rounded-none border border-slate-100 shadow-sm p-3">
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={scheduleQuery}
                  onChange={(e) => setScheduleQuery(e.target.value)}
                  placeholder="セラピスト名で探す"
                  className="flex-1 px-3 py-2 rounded-none border border-slate-200 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                {scheduleQuery && (
                  <button
                    type="button"
                    onClick={() => setScheduleQuery('')}
                    className="px-3 py-2 rounded-none border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
                  >
                    クリア
                  </button>
                )}
              </div>
              {scheduleQuery && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {scheduleTherapists.length}名が見つかりました
                </p>
              )}
            </div>
          )}

          {therapists.length === 0 && (
            <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているセラピストがいません</p>
            </div>
          )}

          {scheduleTherapists.map((t) => {
            const isOpen = expandedSections.has(`${t.id}-schedule`);
            return (
              <div key={t.id} className="bg-white rounded-none border border-pink-100 shadow-sm overflow-hidden">

                <button
                  type="button"
                  onClick={() => toggleSection(`${t.id}-schedule`)}
                  className="w-full flex items-center justify-between pr-5 hover:bg-pink-50/40 transition-colors"
                >
                  {/* ★ 名前の左に四角い顔写真（2026-09-11・カッキーさんの指示）。
                      ★ 角は直角・バーの高さいっぱい（64px）・左端にぴったり付ける。
                      ★ バーの高さは今までと同じ64px（★ 旧: py-4 の 32px ＋ 写真 32px）。
                      ★ 写真が無い人は頭文字の四角を出す（★ 欠けて見えないように）。 */}
                  <span className="flex items-center gap-3 min-w-0">
                    {t.profile_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.profile_image_url}
                        alt=""
                        className="w-16 h-16 rounded-none object-cover flex-shrink-0"
                      />
                    ) : (
                      <span className="w-16 h-16 rounded-none bg-pink-100 text-pink-400 text-base font-bold flex items-center justify-center flex-shrink-0">
                        {(t.name ?? '?').charAt(0)}
                      </span>
                    )}
                    <span className="text-sm font-bold text-slate-700 truncate">{t.name ?? '(名前未設定)'}</span>
                    {/* ★ 新人マーク（2026-09-06・カッキーさんの指示）。
                        ★ 判定は src/lib/newFace.ts ただ1つ（is_new_face かつ 60日以内）。 */}
                    {isNewFaceActive(t.is_new_face, t.new_face_since) && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-black leading-none tracking-wider">
                        NEW
                      </span>
                    )}
                    {/* ★ 非公開の印（第216便・2026-09-08）。★ 一覧からは外さず、印を付けて残す
                        （★ カッキーさんの判断: 外すと公開に戻す入口が見つからなくなる）。
                        ★ 切替は「セラピスト情報」→ プロフィールを編集 の中。 */}
                    {t.is_active === false && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 bg-slate-600 text-white text-[9px] font-black leading-none">
                        非公開
                      </span>
                    )}
                  </span>
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
                          className={`rounded-none border px-3 py-2.5 space-y-2 transition-colors ${
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
                              className={`relative inline-flex h-6 w-11 items-center rounded-none transition-colors ${
                                day.is_active ? 'bg-pink-500' : 'bg-slate-200'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-none bg-white shadow transition-transform ${
                                day.is_active ? 'translate-x-6' : 'translate-x-1'
                              }`} />
                              <span className="sr-only">{day.is_active ? '出勤' : '休み'}</span>
                            </button>
                          </div>
                          {day.is_active && (
                            <div className="flex items-center gap-2">
                              <input
                                className="flex-1 px-3 py-1.5 rounded-none border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 placeholder:text-slate-300"
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
          <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-4">
            {/* ★★ 見出しと説明文は【幅いっぱい】（2026-09-06 第185便・カッキーさんの指示）。
                ★ 前は右にボタン2つ（約185px）を並べていたため、スマホ（430px）で見出しに使える幅が
                  約170pxしかなく、「今すぐ対応可能なセラピ／スト」と単語の途中で折り返していた。
                ★ ボタンはセラピスト一覧のすぐ上・右詰めへ移した（renderAvailableActions）。 */}
            <div>
              <h2 className="text-sm font-black text-slate-700 mb-1">今すぐ対応可能なセラピスト</h2>
              <p className="text-[11px] text-slate-400">「今すぐ」設定は、30分後に自動解除。この画面上ではリロードするまでチェックは残ります。</p>
            </div>
            {(() => {
              // 「今すぐ」判定は営業日基準（深夜0〜6時は前日のスケジュールを参照）
              const todayStr = getBusinessDateJST();
              const checkedCount = onDutyTherapists.filter(t => availableNow[String(t.id)]).length;
              const atLimit = checkedCount >= 3;
              if (onDutyTherapists.length === 0) {
                return (
                  <div className="space-y-2">
                    {/* ★ 出勤者が居なくてもリロードは要る（★ 出勤を入れた直後に押す）。 */}
                    {renderAvailableActions()}
                    <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-none">
                      現在、出勤中のセラピストはいません
                    </p>
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {atLimit && (
                    <p className="text-xs text-rose-500 font-bold text-center py-2 bg-rose-50 border border-rose-100 rounded-none">
                      今すぐは最大3名までです
                    </p>
                  )}
                  {onDutyTherapists.some(t => isImportLiveRow(t, now)) && (
                    <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-none px-3 py-2 leading-relaxed">
                      {/* ★ 文面は2026-09-06 第185便でカッキーさんが短くしたもの。
                          ★ 改行（br）と太字（strong）はやめ、1つの続き文にした。 */}
                      「駅ちか連動中（即ヒメ）」は、フクエスでも「今すぐ」として表示。チェックはこれまでどおり使用可能。表示をやめるときは駅ちか側で即ヒメを解除（最大15分ほどで消去）。
                    </p>
                  )}
                  {/* ★★ リロード・保存はセラピスト一覧の【すぐ上・右詰め】
                      （2026-09-06 第185便・カッキーさんの指示）。
                      ★ 一覧の下まで戻らせない、という第183便の狙いはそのまま守られる。 */}
                  {renderAvailableActions()}
                  {onDutyTherapists.map(t => {
                    const sid = String(t.id);
                    const isChecked = availableNow[sid] ?? false;
                    // 排他制御：キャスト本人が受付中の枠はオーナーが選べない（グレーアウト）。
                    const castLive = isCastLiveRow(t, now);
                    // ★ 駅ちかの「即ヒメ」から取り込んだ枠。【表示だけ】。
                    //   ★ チェックボックスを無効にしないこと。3枠は和集合であって排他ではないので、
                    //     取り込み中でも店舗は自分の枠を押せる。
                    //   ★ 3名制限（checkedCount / atLimit）にも数えていない。数えると店舗が自分の枠を押せなくなる。
                    const importLive = isImportLiveRow(t, now);
                    const remainingMin = t.available_until
                      ? Math.floor((new Date(t.available_until).getTime() - now.getTime()) / 60000)
                      : 0;
                    return (
                      <label key={sid} className={`flex items-center gap-3 p-3 rounded-none border bg-slate-50/50 transition-colors ${
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
                          <span className="text-[11px] font-bold text-pink-600 bg-pink-50 border border-pink-200 rounded-none px-2 py-0.5 flex-shrink-0 whitespace-nowrap">
                            本人が受付中
                          </span>
                        )}
                        {importLive && (
                          <span className="text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-none px-2 py-0.5 flex-shrink-0 whitespace-nowrap">
                            駅ちか連動中
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── タブ4: セラピスト情報 ── */}
        <div className={`space-y-3 ${activeTab === 'profile' ? '' : 'hidden'}`}>

          {/* ★ 名前でしぼり込む（2026-09-06・カッキーさんの指示）。★ 出勤ページと同じ規則。 */}
          {therapists.length > 0 && (
            <div className="bg-white rounded-none border border-slate-100 shadow-sm p-3">
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={profileQuery}
                  onChange={(e) => setProfileQuery(e.target.value)}
                  placeholder="セラピスト名で探す"
                  className="flex-1 px-3 py-2 rounded-none border border-slate-200 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                {profileQuery && (
                  <button
                    type="button"
                    onClick={() => setProfileQuery('')}
                    className="px-3 py-2 rounded-none border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
                  >
                    クリア
                  </button>
                )}
              </div>
              {profileQuery && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {profileTherapists.length}名が見つかりました
                </p>
              )}
            </div>
          )}

          {/* 新規セラピスト追加フォーム */}
          <div className="bg-white rounded-none border border-pink-100 shadow-sm p-5 space-y-3">
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
              {/* ★ 日数は lib/newFace.ts の NEW_FACE_WINDOW_DAYS（60日）と対の文言。片方だけ直さないこと。 */}
              <span className="text-[10px] text-slate-400">（60日間表示）</span>
            </label>
            {addError && (
              <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-none px-3 py-2 leading-relaxed">
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
            <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているセラピストがいません</p>
            </div>
          )}

          {profileTherapists.map((t) => (
            <div key={t.id} className="relative bg-white rounded-none border border-pink-100 shadow-sm overflow-hidden flex items-stretch">
              {/* ★ 新人マークは【カードの左上】にぴったり（2026-09-11・カッキーさんの指示）。
                  ★ 写真の左上に重ねる。★ 判定は src/lib/newFace.ts ただ1つ（is_new_face かつ60日以内）。 */}
              {isNewFaceActive(t.is_new_face, t.new_face_since) && (
                <span className="absolute top-0 left-0 z-10 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-black leading-none tracking-wider">
                  NEW
                </span>
              )}
              {/* ★ 顔写真は角を直角・【カード全体】の高さいっぱい・左端にぴったり
                  （2026-09-11・カッキーさんの指示）。
                  ★ 下の薄いピンク（招待）の段まで含めて、左を縦に貫く。
                  ★ 幅は110px。★ 大きさを変えるならこの1か所だけ。 */}
              <div className="relative w-[110px] flex-shrink-0 self-stretch bg-slate-50 border-r border-pink-50">
                {t.profile_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.profile_image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-slate-300 text-[10px]">
                    なし
                  </span>
                )}
              </div>

              {/* ★ 右側 … 名前・ボタンの段 ＋ 招待の段。★ 写真の高さはこの中身で決まる。 */}
              <div className="flex-1 min-w-0">
              {/* ★★ ここの隙間は【スマホだけ】半分（2026-09-06 第186便・カッキーさんの指示）。
                  ★ PC（sm:以上）は今までどおり。★ 上下（py）は変えていない。
                  ★ 目的：スマホで NEW マークや長い名前が2行に折れないよう、名前に使える幅を広げる。
                    枠の左右 20→10px ／ 名前まわりの隙間 12→6px ／ ボタンどうし 8→4px
                    ／「プロフィールを編集」の内側 16→8px。★ 合わせて約40px 稼いでいる。 */}
              <div className="flex items-center justify-between px-2.5 sm:px-5 py-4">
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                  <span className="text-sm font-bold text-slate-700">{t.name ?? '(名前未設定)'}</span>
                  {/* ★ 非公開の印（第216便・2026-09-08）。★ ここが切替への入口
                      （「プロフィールを編集」→ いちばん下の「サイトへの掲載」）。 */}
                  {t.is_active === false && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 bg-slate-600 text-white text-[9px] font-black leading-none">
                      非公開
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 sm:gap-2">
                  <Link
                    href={`/mypage/therapist/${t.id}`}
                    className="px-2 sm:px-4 py-1.5 rounded-none border border-pink-300 text-pink-600 text-xs font-bold whitespace-nowrap hover:bg-pink-50 transition-colors"
                  >
                    プロフィールを編集
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleTherapistDelete(t.id, t.name)}
                    disabled={deletingTherapist === t.id}
                    className="px-1.5 sm:px-3 py-1.5 rounded-none border border-rose-200 text-rose-500 text-xs font-bold whitespace-nowrap bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    {deletingTherapist === t.id ? '削除中...' : '削除'}
                  </button>
                </div>
              </div>

              {/* ── キャスト招待（本人ログイン用） ── */}
              <div className="border-t border-pink-50 px-2.5 sm:px-5 py-3 bg-pink-50/20 space-y-2">
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
                      className="px-3 py-1 rounded-none border border-slate-200 text-slate-500 text-[11px] font-bold hover:border-rose-300 hover:text-rose-500 transition-colors disabled:opacity-50"
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
                        className="px-3 py-1 rounded-none border border-pink-300 text-pink-600 text-[11px] font-bold hover:bg-pink-50 transition-colors disabled:opacity-50"
                      >
                        {inviteBusyId === t.id ? '送信中...' : '招待を再送'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(t.id, t.invited_email!)}
                        disabled={inviteBusyId === t.id}
                        className="px-3 py-1 rounded-none border border-rose-200 text-rose-500 text-[11px] font-bold hover:bg-rose-50 hover:border-rose-300 transition-colors disabled:opacity-50"
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
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-none border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 placeholder:text-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => handleInviteCast(t.id)}
                        disabled={inviteBusyId === t.id}
                        className="px-3 py-1.5 rounded-none border border-pink-300 text-pink-600 text-[11px] font-bold bg-white hover:bg-pink-50 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        招待
                      </button>
                    </div>
                  </div>
                ) : (
                  // 未招待
                  // ★ 招待するボタンは薄いピンクの背景の【右上】（2026-09-11・カッキーさんの指示）。
                  //   ★ 説明文はボタンの【左真横】。★ メール入力バーは下の行・幅3分の2・右端。
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <p className="text-[11px] font-normal text-slate-400/90 min-w-0">
                        セラピストアカウントに招待
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInviteCast(t.id)}
                        disabled={inviteBusyId === t.id}
                        className="px-4 py-1.5 rounded-none text-white text-[11px] font-bold shadow-sm disabled:opacity-50 flex-shrink-0"
                        style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
                      >
                        {inviteBusyId === t.id ? '送信中...' : '招待する'}
                      </button>
                    </div>
                    {/* ★ 入力バーはカードの端まで幅いっぱい（2026-09-11・カッキーさんの指示）。 */}
                    <input
                      type="email"
                      inputMode="email"
                      placeholder="本人のメールアドレスを入力"
                      value={inviteEmails[t.id] ?? ''}
                      onChange={(e) => setInviteEmails(prev => ({ ...prev, [t.id]: e.target.value }))}
                      className="w-full min-w-0 px-3 py-1.5 rounded-none border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 placeholder:text-slate-300"
                    />
                  </div>
                )}
              </div>
              </div>{/* ★ 右側ここまで */}
            </div>
          ))}
        </div>

        {/* ── タブ5: 写メ日記 ── */}
        <div className={`${activeTab === 'diary' ? '' : 'hidden'}`}>
          <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-700 mb-1">写メ日記の投稿</h2>
            </div>

            {/* ★ 名前でしぼり込む（2026-09-06・カッキーさんの指示）。★ 出勤・セラピストと同じ規則。 */}
            {therapists.length > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={diaryQuery}
                  onChange={(e) => setDiaryQuery(e.target.value)}
                  placeholder="セラピスト名で探す"
                  className="flex-1 px-3 py-2 rounded-none border border-slate-200 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                {diaryQuery && (
                  <button
                    type="button"
                    onClick={() => setDiaryQuery('')}
                    className="px-3 py-2 rounded-none border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
                  >
                    クリア
                  </button>
                )}
              </div>
            )}
            {diaryQuery && (
              <p className="-mt-2 text-[11px] text-slate-400">{diaryTherapists.length}名が見つかりました</p>
            )}

            {/* セラピスト選択 */}
            {therapists.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-none">
                登録されているセラピストがいません
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {diaryTherapists.map((t) => {
                  const selected = diaryTherapistId === String(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectDiaryTherapist(String(t.id))}
                      className={`rounded-none border-2 overflow-hidden text-center transition-colors ${
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
              <div ref={diaryFormRef} className="border-t border-slate-100 pt-4 space-y-3 scroll-mt-28">
                {/* ★ 見出しの右に、そのセラピストの丸アイコン（第191便・2026-09-07・カッキーさんの指示）。
                    ★ 上の一覧と同じ profile_image_url。★ 写真が無ければ名前の1文字（一覧と同じ出し方）。
                    ★ 誰の日記を書いているかを、文字と絵の両方で見せる（★ 選び間違いに気づきやすくする）。 */}
                {(() => {
                  const dt = therapists.find(t => String(t.id) === diaryTherapistId);
                  const dtName = dt?.name ?? '';
                  return (
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-bold text-slate-400">投稿フォーム（{dtName}）</p>
                      <span className="inline-flex w-7 h-7 rounded-full overflow-hidden border border-pink-200 bg-slate-100 flex-none" aria-hidden="true">
                        {dt?.profile_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={dt.profile_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-slate-300 text-[11px] font-bold">
                            {(dtName || '?').charAt(0)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })()}

                {/* 画像（1枚） */}
                <div>
                  <label className={labelClass}>画像（1枚）</label>
                  <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
                  {diaryImage ? (
                    <div className="relative w-32 h-32 rounded-none overflow-hidden border border-pink-100 bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={diaryImage} alt="投稿画像" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setDiaryImage(null)}
                        aria-label="削除"
                        className="absolute top-1 right-1 w-6 h-6 rounded-none bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-32 rounded-none border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
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
                    className="px-6 py-2 rounded-none text-white font-bold text-xs shadow-sm disabled:opacity-50"
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


          {/* クーポン一覧（公開・非公開含む） */}
          {coupons.length === 0 ? (
            <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているクーポンがありません</p>
            </div>
          ) : (
            coupons.map((c) => {
              const form = couponForms[c.id] ?? {};
              // ★ 作成済みクーポンは畳んでおく（2026-09-06・カッキーさんの指示）。
              //   ★ 閉じているときは【色・公開状態・タイトル】だけ。★ 開くと今までの編集画面がそのまま出る。
              const isOpen = expandedSections.has(`coupon-${c.id}`);
              return (
                <div key={c.id} className="bg-white rounded-none border border-pink-100 shadow-sm overflow-hidden">
                  {/* ── 閉じているときのバー ── */}
                  <button
                    type="button"
                    onClick={() => toggleSection(`coupon-${c.id}`)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-pink-50/40 transition-colors"
                  >
                    <span
                      className="w-6 h-6 rounded-none border border-slate-200 flex-shrink-0"
                      style={{ background: getCouponColor(c.color).background }}
                      title={getCouponColor(c.color).label}
                    />
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-none flex-shrink-0 ${
                      c.is_published ? 'bg-pink-50 text-pink-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {c.is_published ? '公開中' : '非公開'}
                    </span>
                    <span className="text-sm font-bold text-slate-700 truncate min-w-0">
                      {c.title || '(タイトル未設定)'}
                    </span>
                    <svg
                      className={`ml-auto w-4 h-4 flex-shrink-0 text-pink-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* ── 開いたときの中身（★ 今までと同じもの） ── */}
                  <div className={isOpen ? 'px-5 pb-5 pt-4 space-y-3 border-t border-pink-100' : 'hidden'}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleCouponTogglePublish(c.id)}
                      className="px-3 py-1.5 rounded-none border border-pink-300 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors"
                    >
                      {c.is_published ? '非公開にする' : '公開にする'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCouponDelete(c.id)}
                      disabled={deletingCoupon === c.id}
                      className="px-3 py-1.5 rounded-none border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                    >
                      {deletingCoupon === c.id ? '削除中...' : '削除'}
                    </button>
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
                      rows={6}
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
                            className={`relative w-10 h-10 rounded-none border-2 transition-transform ${
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

                  {/* ★ お客様に見えるかたち（★ 公開ページと同じ CouponCard）。 */}
                  <div>
                    <p className={labelClass}>お客様に見えるかたち</p>
                    <CouponCard
                      title={(form.title as string) || '（タイトル）'}
                      discount={(form.discount as string) || '（割引内容）'}
                      conditions={(form.conditions as string) ?? null}
                      validUntil={(form.valid_until as string) ?? null}
                      color={(form.color as string) ?? DEFAULT_COUPON_COLOR_KEY}
                    />
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
                </div>
              );
            })
          )}

          {/* 新規追加フォーム */}
          <div className="bg-white rounded-none border border-pink-100 shadow-sm p-5 space-y-3">
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
                rows={6}
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
                      className={`relative w-10 h-10 rounded-none border-2 transition-transform ${
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

            {/* ★ お客様に見えるかたち（2026-09-06・カッキーさんの指示）。
                ★ 部品は公開ページ（/salon/{id}/coupon）と【同じ】CouponCard。★ 本物とずれない。 */}
            <div>
              <p className={labelClass}>お客様に見えるかたち</p>
              <CouponCard
                title={newCoupon.title || '（タイトル）'}
                discount={newCoupon.discount || '（割引内容）'}
                conditions={newCoupon.conditions}
                validUntil={newCoupon.valid_until}
                color={newCoupon.color}
              />
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
              <p className="text-[11px] text-slate-400">公開して新規発行すると、保存している会員に通知されます。内容が間違ってないか確認して追加してください。</p>
            </div>
          </div>
        </div>

        {/* ── タブ7: お知らせ ── */}
        <div className={`space-y-4 ${activeTab === 'news' ? '' : 'hidden'}`}>

          {/* ── 自動配信の状態（第69便・設計メモ 追記37 §192）──
              ★★ 周（/api/admin/announce-auto）と同じ判定から来た1行をそのまま出す。
                 画面が「今日は出ます」と言い、周は出さない、が起きうる形にしない。
              ★ 時刻は店舗IDから決まる（選べない）。設定項目を1つ増やさないため。 */}
          <div className="bg-white rounded-none border border-pink-100 shadow-sm p-5 space-y-1.5">
            <h3 className="text-xs font-black text-pink-600">自動でお知らせを回す（1日1投稿）</h3>
            {announceState ? (
              <>
                <p className="text-[11px] text-slate-600 leading-relaxed">{announceState.message}</p>
                {/* ★★ 周期の1行と、仕組みの説明は消した（2026-09-06・カッキーさんの指示）。
                    ★ 見出しの「（1日1投稿）」と、上の1行（自動配信設定◯件）で足りる、という判断。
                    ★ cycleMessage は作る側（announceAuto.ts）に残してある。★ 戻すならここに1行。 */}
              </>
            ) : (
              // ★ 読めていないことを「お休みです」と書き替えない（作法3-5）
              <p className="text-[11px] text-slate-400">自動配信の状態を読み込み中です…</p>
            )}
          </div>


          {/* 再投稿の確認モーダル（標準confirmの置き換え）。文言は既存confirmと同一。
              その下に fukuX 同時投稿チェック（未連携なら disabled＋注記）。 */}
          {repostModalId && (
            <div
              style={mainZoom === 1 ? undefined : { zoom: 1 / mainZoom }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => { if (!repostingAnnouncement) setRepostModalId(null); }}
            >
              <div
                style={mainZoom === 1 ? undefined : { zoom: mainZoom }}
                className="bg-white rounded-none shadow-xl w-full max-w-sm p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-bold text-slate-700 whitespace-pre-line leading-relaxed">
                  {`このお知らせを再投稿しますか？\n投稿日時が現在時刻に更新され、一覧の先頭に表示されます。\n（元の投稿日時は失われ、再び新着「NEW!!」扱いになります）\n★ 再投稿しても、保存している会員には通知されません。`}
                </p>
                {/* ★★ 押す前に言う（第68便・§191 守り3）。押したあとに知らせると「壊れている」に見える。
                    ★ ボタンを灰色にして押させないのではなく、押せるまま・理由を先に出す（作法3-7）。 */}
                <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 rounded-none p-3">
                  {`同じ内容の再投稿でトップの新着が上がるのは、30分に1回までです。\n内容を書き替えた場合は、すぐに上がります。`}
                </p>
                {renderCrosspostChecks(repostCrosspostX, setRepostCrosspostX, repostCrosspostNoReplies, setRepostCrosspostNoReplies)}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRepostModalId(null)}
                    disabled={!!repostingAnnouncement}
                    className="px-4 py-2 rounded-none border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
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
            <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">登録されているお知らせがありません</p>
            </div>
          ) : (
            announcements.map((a) => {
              const form = announcementForms[a.id] ?? {};
              // ★ 作成済みのお知らせは畳んでおく。★ 開くと今までの編集画面がそのまま出る。
              const isAnnOpen = expandedSections.has(`announcement-${a.id}`);
              return (
                <div key={a.id} className="bg-white rounded-none border border-pink-100 shadow-sm overflow-hidden">
                  {/* ── 閉じているときのバー（★ 公開状態・タイトル・公開日時）──
                      ★ クーポンと同じ形（2026-09-06・カッキーさんの指示）。★ お知らせに色は無い。 */}
                  <button
                    type="button"
                    onClick={() => toggleSection(`announcement-${a.id}`)}
                    aria-expanded={isAnnOpen}
                    className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-pink-50/40 transition-colors"
                  >
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-none flex-shrink-0 ${
                      a.is_published ? 'bg-pink-50 text-pink-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {a.is_published ? '公開中' : '非公開'}
                    </span>
                    {/* ★ 自動配信のローテに乗っているか（2026-09-06・カッキーさんの指示）。
                        ★ 印（auto_rotate）が付いているだけ＝回る対象。★ 実際に今日出たかは別（記録は周が持つ）。 */}
                    {a.auto_rotate && (
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-none flex-shrink-0 border ${
                          a.is_published
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-white text-emerald-300 border-emerald-100'
                        }`}
                        title={a.is_published ? '自動配信のローテに乗っています' : '印は付いていますが、非公開なので回りません'}
                      >
                        自動配信中
                      </span>
                    )}
                    <span className="text-sm font-bold text-slate-700 truncate min-w-0">
                      {a.title || '(タイトル未設定)'}
                    </span>
                    <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:inline text-[10px] text-slate-400">{formatPublishedAt(a.published_at)}</span>
                      <svg
                        className={`w-4 h-4 text-pink-400 transition-transform duration-200 ${isAnnOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>

                  {/* ── 開いたときの中身（★ 今までと同じもの） ── */}
                  <div className={isAnnOpen ? 'px-5 pb-5 pt-4 space-y-3 border-t border-pink-100' : 'hidden'}>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => handleAnnouncementTogglePublish(a.id)}
                        className="px-3 py-1.5 rounded-none border border-pink-300 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors"
                      >
                        {a.is_published ? '非公開にする' : '公開にする'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnnouncementRepost(a.id)}
                        disabled={repostingAnnouncement === a.id}
                        title="投稿日時を現在時刻に更新して再投稿します（保存している会員には通知されません）"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-none border border-emerald-300 text-emerald-600 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
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
                        className="px-3 py-1.5 rounded-none border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                      >
                        {deletingAnnouncement === a.id ? '削除中...' : '削除'}
                      </button>
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
                      <div className="relative w-32 h-32 rounded-none overflow-hidden border border-pink-100 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.image_url as string} alt="お知らせ画像" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAnnouncementForms(prev => ({ ...prev, [a.id]: { ...prev[a.id], image_url: null } }))}
                          aria-label="削除"
                          className="absolute top-1 right-1 w-6 h-6 rounded-none bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-32 h-32 rounded-none border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
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
                  {/* ★ 自動配信のローテに乗せるか（第69便）。★ 既定はオフ——黙って回さない。
                      ★ 季節外れ（年末年始の告知が3月に出る）を防ぐ。有効期限は作らない。 */}
                  <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={(form.auto_rotate as boolean | undefined) ?? false}
                      onChange={(e) => setAnnouncementForms(prev => ({ ...prev, [a.id]: { ...prev[a.id], auto_rotate: e.target.checked } }))}
                      className="w-4 h-4 accent-pink-500 flex-shrink-0 mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="text-xs font-bold text-slate-600">自動で回す</span>
                      <span className="block text-[10px] text-slate-400 leading-relaxed">
                        印を付けたお知らせを、1日1回・順番に1本ずつ自動で出します（「保存」で確定します）
                      </span>
                    </span>
                  </label>

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
                </div>
              );
            })
          )}

          {/* 新規追加フォーム */}
          <div className="bg-white rounded-none border border-pink-100 shadow-sm p-5 space-y-3">
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
                <div className="relative w-32 h-32 rounded-none overflow-hidden border border-pink-100 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={newAnnouncement.image_url} alt="お知らせ画像" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setNewAnnouncement(p => ({ ...p, image_url: null }))}
                    aria-label="削除"
                    className="absolute top-1 right-1 w-6 h-6 rounded-none bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-32 h-32 rounded-none border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
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
              <p className="text-[11px] text-slate-400">公開して新規投稿すると、保存している会員に通知されます。内容が間違ってないか確認して追加してください。</p>
            </div>
          </div>
        </div>

        {/* ── VIPレタータブ ── */}
        <div className={`space-y-4 ${activeTab === 'vipletter' ? '' : 'hidden'}`}>
          {salon ? (
            <>
              <VipLetterForm salonId={Number(salon.id)} onSent={() => setVipSentReload(v => v + 1)} />
              {/* ★ 送信済みの一覧（2026-09-06・カッキーさんの指示）。★ 何を・いつ・何人に・何人が開いたか */}
              <VipLetterSentList salonId={Number(salon.id)} reloadKey={vipSentReload} />
            </>
          ) : (
            <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400">店舗情報を読み込み中です…</p>
            </div>
          )}
        </div>

        {/* ★★ 旧・求人タブ（フクエスワーク）は第220便で専用サイト /mypage/jobs に移した。
            ★ ここには本文を置かない。★ ?tab=jobs で来た人は上の useEffect が新しい場所へ送る。 */}

        {/* ── 旧・店舗装飾タブの4つ ──
            ★★ タブを廃止し、サイドバーの4つの画面に割った（2026-09-06・カッキーさんの指示）。
            ★ 中身と保存先は変えていない。★ 1画面に1つだけ出す。 */}
        <div className={`space-y-4 ${activeTab === 'theme' ? '' : 'hidden'}`}>
          {/* ── テーマ（背景壁紙）。保存で salons.theme を更新 ── */}
          <AccordionCard title="テーマ（背景壁紙）" defaultOpen>
          {/* ── テーマ（壁紙） ── */}
          <div>
            <p className="mt-1 mb-2 text-[11px] leading-relaxed text-slate-400">店舗詳細ページの背景に敷かれる壁紙を選べます。</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {SALON_THEMES.map((t) => {
                const selected = (salonForm.theme ?? 'white') === t.key;
                const wallpaper = themeWallpapers[t.key];
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSalonForm((p) => ({ ...p, theme: t.key as ThemeKey }))}
                    className={`group rounded-none border-2 overflow-hidden text-left transition-colors ${
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
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-none bg-pink-500 text-white text-[11px] font-bold flex items-center justify-center shadow">
                          ✓
                        </span>
                      )}
                    </div>
                    {/* ラベル */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${selected ? 'bg-pink-50' : 'bg-white'}`}>
                      <span
                        className="w-3.5 h-3.5 rounded-none flex-shrink-0"
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
              className="w-full py-2.5 rounded-none bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 disabled:opacity-50"
            >
              {savingTheme ? '保存中…' : 'テーマを保存する'}
            </button>
          </AccordionCard>
        </div>

        {/* ── 詳細ページ バナー（最大3・出勤セラピストの下に縦表示） ── */}
        <div className={`space-y-4 ${activeTab === 'banner' ? '' : 'hidden'}`}>
          <AccordionCard title="詳細ページ バナー（最大3）" defaultOpen>
            {/* ★ 「表示する」は枠の一番上（2026-09-06・カッキーさんの指示）。 */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={detailEnabled} onChange={(e) => setDetailEnabled(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                <span className="text-sm font-bold text-slate-700">店舗詳細ページに表示する</span>
              </label>
            </div>
            {/* ★ 灰色の注意書きの枠は消して、説明文にまとめた（2026-09-06・カッキーさんの指示）。 */}
            <div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                「本日の出勤セラピスト」の下に表示されます。（形式：JPEG・PNG・WebP／各5MBまで）<br />
                端末の横幅によって上下または左右が数％切れるため、<span className="text-pink-500 font-bold">文字やロゴは端から10%ほど内側</span>に置いてください。
              </p>
            </div>
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="rounded-none border border-slate-100 p-3 space-y-2">
                <p className="text-[11px] font-bold text-slate-500">バナー {slot + 1}</p>

                {/* PC・タブレット用（従来の1枚。640px以上で表示される） */}
                <p className="text-[10px] font-bold text-slate-400">
                  🖥 {DETAIL_BANNER_SIZE.pc.label}（{DETAIL_BANNER_SIZE.pc.ratio}・推奨 {DETAIL_BANNER_SIZE.pc.example}）
                </p>
                <div className="rounded-none border border-slate-200 overflow-hidden bg-slate-50 aspect-[31/9] flex items-center justify-center">
                  {detailBanners[slot] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detailBanners[slot] as string} alt={`バナー${slot + 1}プレビュー`} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-slate-400">未設定</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-block">
                    <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-none text-[11px] font-bold ${uploadingDetailKey === `${slot}:pc` ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-pink-50 text-pink-600 border border-pink-300 hover:bg-pink-100 cursor-pointer'}`}>
                      {uploadingDetailKey === `${slot}:pc` ? 'アップロード中…' : (detailBanners[slot] ? '画像を差し替える' : '画像をアップロード')}
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleDetailImageUpload(slot, 'pc', e)} disabled={uploadingDetailKey === `${slot}:pc`} />
                  </label>
                  {detailBanners[slot] && (
                    <button type="button" onClick={() => handleDetailImageDelete(slot, 'pc')} className="text-[11px] text-slate-400 hover:text-red-500 underline">
                      画像を削除
                    </button>
                  )}
                </div>

                {/* スマホ用（任意。未登録ならPC用画像がそのまま使われる） */}
                <p className="pt-1 text-[10px] font-bold text-slate-400">
                  📱 {DETAIL_BANNER_SIZE.sp.label}（{DETAIL_BANNER_SIZE.sp.ratio}・推奨 {DETAIL_BANNER_SIZE.sp.example}）
                </p>
                <div className="rounded-none border border-slate-200 overflow-hidden bg-slate-50 aspect-[3/1] flex items-center justify-center">
                  {detailBannersSp[slot] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detailBannersSp[slot] as string} alt={`バナー${slot + 1}スマホ用プレビュー`} className="w-full h-full object-cover" />
                  ) : detailBanners[slot] ? (
                    // 未登録のときはPC用画像がスマホでどう見えるかをそのまま見せる（実際の表示と同じ切り取り）。
                    <div className="relative w-full h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={detailBanners[slot] as string} alt={`バナー${slot + 1}スマホ表示プレビュー`} className="w-full h-full object-cover opacity-60" />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-500">PC用画像を使用中</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">未設定</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-block">
                    <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-none text-[11px] font-bold ${uploadingDetailKey === `${slot}:sp` ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-sky-50 text-sky-600 border border-sky-300 hover:bg-sky-100 cursor-pointer'}`}>
                      {uploadingDetailKey === `${slot}:sp` ? 'アップロード中…' : (detailBannersSp[slot] ? 'スマホ用を差し替える' : 'スマホ用をアップロード')}
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleDetailImageUpload(slot, 'sp', e)} disabled={uploadingDetailKey === `${slot}:sp`} />
                  </label>
                  {detailBannersSp[slot] && (
                    <button type="button" onClick={() => handleDetailImageDelete(slot, 'sp')} className="text-[11px] text-slate-400 hover:text-red-500 underline">
                      スマホ用を削除
                    </button>
                  )}
                </div>

                <label className="block pt-1 text-[10px] text-slate-500">クリック時のリンク先</label>
                <select
                  value={detailLinks[slot]}
                  onChange={(e) => setDetailLinks(prev => prev.map((l, i) => (i === slot ? e.target.value : l)))}
                  className="w-full rounded-none border border-slate-200 px-3 py-2 text-xs bg-white focus:outline-none focus:border-pink-300"
                >
                  {(salon ? popupLinkOptions(salon.id, therapists, freePagesForLinks) : [{ label: 'リンクなし', value: '' }]).map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" onClick={handleDetailSave} disabled={savingDetail} className="w-full py-2.5 rounded-none bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 disabled:opacity-50">
              {savingDetail ? '保存中…' : '保存する'}
            </button>
          </AccordionCard>
        </div>

        <div className={`space-y-4 ${activeTab === 'popup' ? '' : 'hidden'}`}>
          <AccordionCard title="ポップアップ画像" defaultOpen>
            {/* ★ 表示ON/OFF は枠の一番上（2026-09-06・カッキーさんの指示）。 */}
            <div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} className="w-4 h-4 accent-pink-500 mt-0.5 flex-shrink-0" />
                {/* ★ スマホでは補足を次の行へ（sm 以上は横に並べる・2026-09-06）。 */}
                <span>
                  <span className="text-sm font-bold text-slate-700">店舗詳細ページに表示する</span>
                  <span className="block sm:inline sm:ml-2 text-[11px] text-slate-400">（最大3枚・1MB以下／JPEG・PNG・WebP）</span>
                </span>
              </label>
            </div>
            <div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                店舗詳細ページを下にスクロールすると、左下から画像が「ポンっ」と跳ねて出ます（スマホ表示のみ）。<span className="text-slate-500 font-bold">1枚がランダムで表示</span>されます。<span className="text-pink-500 font-bold">背景を透過したPNG（切り抜き画像）</span>にすると、背景に自然に溶け込みます。
              </p>
            </div>

            {/* 画像スロット×3（各：プレビュー＋アップロード＋削除＋個別リンク） */}
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="rounded-none border border-slate-100 p-3 space-y-2">
                <p className="text-[11px] font-bold text-slate-500">画像 {slot + 1}<span className="ml-2 font-normal text-slate-400">縦長・約2:3（推奨 800×1200px）</span></p>
                <div className="flex items-start gap-3">
                  <div className="w-20 h-28 rounded-none border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center flex-shrink-0">
                    {popupImages[slot] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={popupImages[slot] as string} alt={`ポップアップ画像${slot + 1}プレビュー`} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 text-center px-2">未設定</span>
                    )}
                  </div>
                  <div className="space-y-2 min-w-0 flex-1">
                    <label className="inline-block">
                      <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-none text-[11px] font-bold ${uploadingPopupSlot === slot ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-pink-50 text-pink-600 border border-pink-300 hover:bg-pink-100 cursor-pointer'}`}>
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
                      className="w-full rounded-none border border-slate-200 px-3 py-2 text-xs bg-white focus:outline-none focus:border-pink-300"
                    >
                      {(salon ? popupLinkOptions(salon.id, therapists, freePagesForLinks) : [{ label: 'リンクなし', value: '' }]).map((opt) => (
                        <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handlePopupSave}
              disabled={savingPopup}
              className="w-full py-2.5 rounded-none bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 disabled:opacity-50"
            >
              {savingPopup ? '保存中…' : '保存する'}
            </button>
          </AccordionCard>
        </div>

        <div className={`space-y-4 ${activeTab === 'freepage' ? '' : 'hidden'}`}>
          {salon && (
            <AccordionCard title="フリーページ（最大3）" defaultOpen>
              <SalonFreePagesManager
                salonId={Number(salon.id)}
                onToast={showToast}
                onPagesChange={setFreePagesForLinks}
                bare
              />
            </AccordionCard>
          )}
        </div>

        {/* ── 媒体連携 ──
            ★★★ 第55便（㉜）で専用ページ /mypage/media へ移した。ここには描かない。
            ★ 移した先は【フクエスリンク】として6画面に割ってある（第56〜65便）。
              ホーム／セラピスト一覧／出勤を送る／写メ日記の投稿先／ログイン情報／連携の記録。
            ★ ここに残っているのは入口（タブ列のリンク）と見張り（トップの赤い箱）だけ。 */}

        {/* ── 運営から（お知らせ受信＋お問い合わせ） ── */}
        {/* 常時マウント（hidden 切替）＝未読件数をタブバッジへ即時反映。タブを開くと既読化される。 */}
        <div className={`${activeTab === 'support' ? '' : 'hidden'}`}>
          <SupportTab
            salonId={salon ? Number(salon.id) : null}
            salonName={salon?.name ?? ''}
            active={activeTab === 'support'}
            onUnreadChange={setSupportUnread}
            onToast={showToast}
          />
        </div>

      </main>

      {/* ★★ 画面下に貼り付く保存バー（第226便・2026-09-09・カッキーさんの指示）。
          ★ 出るのは【店舗情報】と【ネット予約】のときだけ。★ 押すのは各タブにあったのと同じ handleSalonSave
            （★ 新しい保存の道は作らない・第37便）。★ セラピスト編集ページ（/mypage/therapist/[id]）と同じ形。
          ★ PC ではサイドバー（288px）の右だけに出す（md:left-[288px]）。★ スマホは全幅。
          ★ 端末の下端（ホームバー）に隠れないよう safe-area ぶんの余白を足す。
          ★ 本文の下端に余白（pb-28）を足してあるので、いちばん下のカードがバーに隠れない。 */}
      {(activeTab === 'salon' || activeTab === 'booking') && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[288px] z-40 bg-white/95 backdrop-blur border-t border-slate-100 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          {/* ★ 未保存の目印（第226便）。★ 「押し忘れ」を防ぐ。★ 触っていなければ何も出さない。 */}
          {salonDirty && (
            <p className="max-w-2xl mx-auto px-4 pt-2 text-[11px] font-bold text-rose-500">
              未保存の変更があります
            </p>
          )}
          {/* ★ 「← 戻る」と「保存する」を横に並べる（セラピスト編集ページと同じ形）。
              ★ 戻るは【前の画面】へ（履歴が無ければ /mypage のトップへ）。★ 保存が残りの幅を取る（flex-1）。 */}
          <div className="max-w-2xl mx-auto px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3">
            <button
              type="button"
              onClick={handleSalonBack}
              className="flex-none px-4 py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-bold hover:border-pink-300 hover:text-pink-500 transition-colors whitespace-nowrap"
            >
              ← 戻る
            </button>
            <button
              type="button"
              onClick={handleSalonSave}
              disabled={saving}
              className="flex-1 px-8 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-black text-base shadow-md disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
