'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { SALON_THEMES, type ThemeKey } from '@/app/lib/themes';
import { COUPON_COLORS, getCouponColor, DEFAULT_COUPON_COLOR_KEY, type CouponColorKey } from '@/app/lib/couponColors';
import { getBusinessDateJST, getBusinessDateRangeJST } from '@/lib/dutyStatus';
import { MyDiaryList } from './MyDiaryList';

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
    .select('id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text, is_available_now, available_until')
    .eq('salon_id', salonId);
  if (!error) return (data ?? []) as Therapist[];
  console.warn('[mypage] クエリ失敗（カラム未作成の可能性）:', error.message);
  const { data: fb } = await supabase
    .from('therapists')
    .select('id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text')
    .eq('salon_id', salonId);
  return (fb ?? []).map(t => ({ ...(t as Omit<Therapist, 'is_available_now' | 'available_until'>), is_available_now: false, available_until: null }));
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
): Array<{ name: string; duration: string; price: string }> {
  const result: Array<{ name: string; duration: string; price: string }> = [];
  for (const g of groups) {
    for (const item of g.items) {
      const priceNum = parseInt(item.price.replace(/[^\d]/g, ''), 10);
      const priceStr = isNaN(priceNum) ? item.price : `¥${priceNum.toLocaleString('ja-JP')}`;
      result.push({ name: g.name, duration: item.duration ? `${item.duration}分` : '', price: priceStr });
    }
  }
  for (const item of otherItems) {
    if (!item.label && !item.price) continue;
    const priceNum = parseInt(item.price.replace(/[^\d]/g, ''), 10);
    const priceStr = isNaN(priceNum) ? item.price : `¥${priceNum.toLocaleString('ja-JP')}`;
    result.push({ name: 'その他', duration: item.label, price: priceStr });
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
  therapist_count: number | null;
  therapist_types: string[] | null;
  therapist_profile: string | null;
  phone: string | null;
  address: string | null;
  access: string | null;
  closed_days: string | null;
  note: string | null;
  courses: unknown;
  theme: string | null;
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
};

type DaySchedule = {
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
};

export default function MyPage() {
  const router = useRouter();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [salonForm, setSalonForm] = useState<Partial<Salon>>({});
  const [therapistForms, setTherapistForms] = useState<Record<string, Partial<Therapist>>>({});
  const [schedules, setSchedules] = useState<Record<string, Record<string, DaySchedule>>>({});
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'salon' | 'schedule' | 'profile' | 'available' | 'diary' | 'coupon' | 'news'>('salon');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [newTherapistName, setNewTherapistName] = useState('');
  const [newTherapistIsNew, setNewTherapistIsNew] = useState(false);
  const [addingTherapist, setAddingTherapist] = useState(false);
  const [addError, setAddError] = useState('');
  const [deletingTherapist, setDeletingTherapist] = useState<string | null>(null);
  const [courseGroups, setCourseGroups] = useState<CourseGroup[]>([{ name: '', items: [{ duration: '', price: '' }] }]);
  const [otherItems,   setOtherItems]   = useState<OtherItem[]>([{ label: '', price: '' }]);
  const [salonImages,    setSalonImages]    = useState<SalonImage[]>([]);
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
  const [uploadingNewAnnouncementImage, setUploadingNewAnnouncementImage] = useState(false);
  const [uploadingAnnouncementImageId, setUploadingAnnouncementImageId] = useState<string | null>(null);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // 営業日基準（午前5時始まり）の7日間。
  // 0:00〜4:59 は前日を1日目、5:00以降は当日を1日目として表示する。
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
        router.push('/login');
        return;
      }

      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .select('id, name, rating, review_count, tags, price, area, hours, description, appeal, therapist_count, therapist_types, therapist_profile, phone, address, access, closed_days, note, courses, theme')
        .eq('owner_id', user.id)
        .single();

      if (salonError || !salonData) {
        setLoadError('サロン情報が見つかりません');
        return;
      }

      setSalon(salonData);
      setSalonForm(salonData);
      setCourseGroups(parseCourseGroups(salonData.courses));
      setOtherItems(parseOtherItems(salonData.courses));

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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

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

  const validateImageFile = (file: File): string | null => {
    if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
    return null;
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

    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false });
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

    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false });
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

    const { error: uploadError } = await supabase.storage.from('salon-images').upload(path, file, { upsert: false });
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
    showToast('スマホ用画像をアップロードしました');
  };

  // スマホ用画像を削除
  const handleMobileImageDelete = async (imgId: string, mobileUrl: string) => {
    if (!window.confirm('スマホ用画像を削除しますか？')) return;
    storageRemove(mobileUrl);
    await supabase.from('salon_images').update({ mobile_image_url: null }).eq('id', imgId);
    setSalonImages(prev => prev.map(img => img.id === imgId ? { ...img, mobile_image_url: null } : img));
    showToast('スマホ用画像を削除しました');
  };

  // スロットごと削除（PC + スマホ両方）
  const handleImageDelete = async (id: string, imageUrl: string, mobileImageUrl: string | null) => {
    if (!window.confirm('この画像スロットを削除しますか？')) return;
    storageRemove(imageUrl);
    if (mobileImageUrl) storageRemove(mobileImageUrl);
    await supabase.from('salon_images').delete().eq('id', id);
    setSalonImages(prev => prev.filter(img => img.id !== id));
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
  };

  const handleSalonSave = async () => {
    if (!salon) return;
    setSaving(true);
    const { error } = await supabase
      .from('salons')
      .update({
        courses: buildCoursesJson(courseGroups, otherItems),
        price: buildRepresentativePrice(courseGroups),
        hours: salonForm.hours,
        description: salonForm.description,
        appeal: salonForm.appeal,
        phone: salonForm.phone,
        address: salonForm.address,
        access: salonForm.access,
        closed_days: salonForm.closed_days,
        note: salonForm.note,
        theme: salonForm.theme ?? 'white',
      })
      .eq('id', salon.id);
    setSaving(false);
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
    showToast('セラピストを追加しました');
  };

  const handleTherapistDelete = async (id: string, name: string | null) => {
    const displayName = name ?? 'このセラピスト';
    if (!window.confirm(`「${displayName}」を削除しますか？\nこの操作は取り消せません。`)) return;

    setDeletingTherapist(id);
    console.log('[delete] start id=', id, 'type=', typeof id);

    // ON DELETE CASCADE 未設定の場合も安全なよう schedules を先に削除
    const { error: schedErr } = await supabase
      .from('therapist_schedules')
      .delete()
      .eq('therapist_id', id);
    console.log('[delete] therapist_schedules result: error=', schedErr);

    // .select() を付けて実際に削除された行を取得（RLSブロック時は0行返る）
    const { data: deleted, error } = await supabase
      .from('therapists')
      .delete()
      .eq('id', id)
      .select('id');
    console.log('[delete] therapists result: deleted=', deleted, 'error=', error);

    setDeletingTherapist(null);

    if (error) {
      console.error('[delete] error:', error);
      showToast(`削除に失敗しました: ${error.message}`);
      return;
    }

    if (!deleted || deleted.length === 0) {
      console.warn('[delete] 0 rows deleted — RLSポリシーにより削除が拒否された可能性があります');
      showToast('削除できませんでした（権限エラーの可能性があります）');
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
    showToast('セラピストを削除しました');
  };

  const handleAvailableNowSave = async () => {
    setSavingAvailable(true);
    // 「今すぐ」を付けられるのは「本日出勤中」かつ「チェック済み」のセラピストのみ。最大3名。
    // 出勤外・期限切れの古いフラグはここで確実にfalseへリセットする（3名制限の抜け穴対策）。
    const liveIds = new Set(
      onDutyTherapists
        .map(t => String(t.id))
        .filter(sid => availableNow[sid])
        .slice(0, 3)
    );
    const availableUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    for (const t of therapists) {
      const sid = String(t.id);
      const isLive = liveIds.has(sid);
      await supabase
        .from('therapists')
        .update({
          is_available_now: isLive,
          available_until: isLive ? availableUntil : null,
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

    const { error } = await supabase.storage.from('diary-images').upload(path, file);
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
    const { error } = await supabase.storage.from('announcement-images').upload(path, file);
    if (error) {
      showToast(`アップロードに失敗しました: ${error.message}`);
      setUploadingNewAnnouncementImage(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('announcement-images').getPublicUrl(path);
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
    const { error } = await supabase.storage.from('announcement-images').upload(path, file);
    if (error) {
      showToast(`アップロードに失敗しました: ${error.message}`);
      setUploadingAnnouncementImageId(null); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('announcement-images').getPublicUrl(path);
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

  // お知らせ：新規追加（published_at は DB の default now() で自動設定）
  const handleAnnouncementAdd = async () => {
    if (!salon || !newAnnouncement.title.trim() || !newAnnouncement.content.trim()) return;
    setAddingAnnouncement(true);
    const { error } = await supabase.from('announcements').insert({
      salon_id:     Number(salon.id),
      title:        newAnnouncement.title.trim(),
      content:      newAnnouncement.content.trim(),
      is_published: newAnnouncement.is_published,
      image_url:    newAnnouncement.image_url || null,
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
    setNewAnnouncement({ title: '', content: '', is_published: true, image_url: null });
    setAddingAnnouncement(false);
    showToast('お知らせを追加しました');
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
    setAnnouncements(prev => prev.map(a => a.id === id
      ? { ...a, title: form.title!.trim(), content, is_published, image_url }
      : a));
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
    showToast(next ? '公開にしました' : '非公開にしました');
  };

  // お知らせ：削除（確認あり）
  const handleAnnouncementDelete = async (id: string) => {
    if (!window.confirm('このお知らせを削除しますか？\nこの操作は取り消せません。')) return;
    setDeletingAnnouncement(id);
    const { data: deleted, error } = await supabase.from('announcements').delete().eq('id', id).select('id');
    setDeletingAnnouncement(null);
    if (error) { showToast(`削除に失敗しました: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) {
      showToast('削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    setAnnouncementForms(prev => { const n = { ...prev }; delete n[id]; return n; });
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
            <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors">
              ログアウト
            </button>
          </div>
        </header>

        {/* タブナビゲーション */}
        <div className="max-w-2xl mx-auto px-4 flex">
          {([
            ['salon',     '店舗情報'],
            ['schedule',  '出勤設定'],
            ['available', '今すぐ'],
            ['profile',   'セラピスト情報'],
            ['diary',     '写メ日記'],
            ['coupon',    'クーポン'],
            ['news',      'お知らせ'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2.5 text-[11px] font-bold border-b-2 transition-colors ${
                activeTab === key
                  ? 'text-pink-600 border-pink-500'
                  : 'text-slate-400 border-transparent hover:text-slate-600 hover:border-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
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
          <p className="mt-1 text-[11px] text-slate-400">※ サロン名の変更は管理者のみ行えます。変更が必要な場合はお問い合わせください。</p>
        </div>

        {/* ── サロン情報編集 ── */}
        <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 ${activeTab === 'salon' ? '' : 'hidden'}`}>
          <h2 className="text-sm font-black text-slate-700">サロン情報の編集</h2>

          {/* ── テーマ（壁紙） ── */}
          <div>
            <label className={labelClass}>テーマ（背景壁紙）</label>
            <p className="mb-2 text-[11px] text-slate-400">サロン詳細ページの背景に敷かれる壁紙を選べます。壁紙未設定のテーマは背景色のみになります。</p>
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
                      <div key={ii} className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder="60"
                          value={item.duration}
                          onChange={(e) => setCourseGroups(prev => prev.map((g, gi2) => gi2 === gi ? { ...g, items: g.items.map((it, ii2) => ii2 === ii ? { ...it, duration: e.target.value } : it) } : g))}
                          className="w-20 px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 text-center"
                        />
                        <span className="text-xs text-slate-500 flex-shrink-0">分 / ¥</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="8000"
                          value={item.price}
                          onChange={(e) => setCourseGroups(prev => prev.map((g, gi2) => gi2 === gi ? { ...g, items: g.items.map((it, ii2) => ii2 === ii ? { ...it, price: e.target.value } : it) } : g))}
                          className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
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
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="メニュー名（例：延長30分）"
                      value={item.label}
                      onChange={(e) => setOtherItems(prev => prev.map((it, ii) => ii === i ? { ...it, label: e.target.value } : it))}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                    />
                    <span className="text-xs text-slate-500 flex-shrink-0">/ ¥</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="料金"
                      value={item.price}
                      onChange={(e) => setOtherItems(prev => prev.map((it, ii) => ii === i ? { ...it, price: e.target.value } : it))}
                      className="w-28 px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
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
            <label className={labelClass}>サロン紹介</label>
            <textarea rows={4} className={textareaClass} value={salonForm.description ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>備考</label>
            <textarea rows={2} className={textareaClass} value={salonForm.note ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, note: e.target.value }))} />
          </div>

          {/* ── サロン画像 ── */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>サロン画像（最大3枚）</label>
              <span className="text-[10px] text-slate-400">{salonImages.length} / 3</span>
            </div>

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
                        <label className={`flex items-center justify-center cursor-pointer py-1 px-2 rounded-lg border text-[10px] font-bold transition-colors ${
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

                    {/* 並び替え・スロット削除 */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-pink-100">
                      <span className="text-[10px] text-slate-400">スロット {i + 1}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => handleImageMove(i, 'up')} disabled={i === 0}
                          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors">↑</button>
                        <button type="button" onClick={() => handleImageMove(i, 'down')} disabled={i === salonImages.length - 1}
                          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors">↓</button>
                        <button type="button" onClick={() => handleImageDelete(img.id, img.image_url, img.mobile_image_url)}
                          className="w-7 h-7 rounded-lg border border-rose-100 text-rose-400 text-xs flex items-center justify-center hover:bg-rose-50 transition-colors">✕</button>
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
              // 「今すぐ」判定は営業日基準（深夜0〜5時は前日のスケジュールを参照）
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
                    const remainingMin = t.available_until
                      ? Math.floor((new Date(t.available_until).getTime() - now.getTime()) / 60000)
                      : 0;
                    return (
                      <label key={sid} className={`flex items-center gap-3 p-3 rounded-2xl border bg-slate-50/50 transition-colors ${
                        !isChecked && atLimit ? 'border-slate-100 opacity-50 cursor-not-allowed' : 'border-slate-100 cursor-pointer hover:border-pink-200'
                      }`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-pink-500 flex-shrink-0"
                          checked={isChecked}
                          disabled={!isChecked && atLimit}
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
            <div className="flex justify-end">
              <button
                className={saveBtn}
                onClick={handleCouponAdd}
                disabled={addingCoupon || !newCoupon.title.trim() || !newCoupon.discount.trim()}
              >
                {addingCoupon ? '追加中...' : '+ クーポンを追加'}
              </button>
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
            <div className="flex justify-end">
              <button
                className={saveBtn}
                onClick={handleAnnouncementAdd}
                disabled={addingAnnouncement || !newAnnouncement.title.trim() || !newAnnouncement.content.trim()}
              >
                {addingAnnouncement ? '追加中...' : '+ お知らせを追加'}
              </button>
            </div>
          </div>

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
                  {/* ヘッダー：公開状態・公開日時・ワンタップ切替・削除 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                        a.is_published ? 'bg-pink-50 text-pink-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {a.is_published ? '公開中' : '非公開'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">{formatPublishedAt(a.published_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAnnouncementTogglePublish(a.id)}
                        className="px-3 py-1.5 rounded-xl border border-pink-300 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors"
                      >
                        {a.is_published ? '非公開にする' : '公開にする'}
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

      </main>
    </div>
  );
}