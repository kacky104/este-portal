'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { TimeRangePicker } from '@/components/TimeRangePicker';

const supabase = createClient();

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function parseCourseGroups(raw: unknown): CourseGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) return [{ name: '', items: [{ duration: '', price: '' }] }];
  const map = new Map<string, CourseItem[]>();
  for (const entry of raw as Record<string, string>[]) {
    const name       = String(entry.name ?? '');
    const durMatch   = String(entry.duration ?? '').match(/(\d+)/);
    const priceMatch = String(entry.price    ?? '').match(/([\d,]+)/);
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push({
      duration: durMatch?.[1]   ?? '',
      price:    priceMatch?.[1]?.replace(/,/g, '') ?? '',
    });
  }
  return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
}

function buildCoursesJson(groups: CourseGroup[]): Array<{ name: string; duration: string; price: string }> {
  const result: Array<{ name: string; duration: string; price: string }> = [];
  for (const g of groups) {
    for (const item of g.items) {
      const priceNum = parseInt(item.price.replace(/[^\d]/g, ''), 10);
      const priceStr = isNaN(priceNum) ? item.price : `¥${priceNum.toLocaleString('ja-JP')}`;
      result.push({ name: g.name, duration: item.duration ? `${item.duration}分` : '', price: priceStr });
    }
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
  id:            string;
  image_url:     string;
  display_order: number;
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
  const [activeTab, setActiveTab] = useState<'salon' | 'schedule' | 'profile'>('salon');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [newTherapistName, setNewTherapistName] = useState('');
  const [addingTherapist, setAddingTherapist] = useState(false);
  const [addError, setAddError] = useState('');
  const [deletingTherapist, setDeletingTherapist] = useState<string | null>(null);
  const [courseGroups, setCourseGroups] = useState<CourseGroup[]>([{ name: '', items: [{ duration: '', price: '' }] }]);
  const [salonImages,    setSalonImages]    = useState<SalonImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const sevenDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return toDateStr(d);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .select('id, name, rating, review_count, tags, price, area, hours, description, appeal, therapist_count, therapist_types, therapist_profile, phone, address, access, closed_days, note, courses')
        .eq('owner_id', user.id)
        .single();

      if (salonError || !salonData) {
        setLoadError('サロン情報が見つかりません');
        return;
      }

      setSalon(salonData);
      setSalonForm(salonData);
      setCourseGroups(parseCourseGroups(salonData.courses));

      const { data: imageData } = await supabase
        .from('salon_images')
        .select('id, image_url, display_order')
        .eq('salon_id', salonData.id)
        .order('display_order', { ascending: true });
      setSalonImages(imageData ?? []);

      const { data: therapistData } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text')
        .eq('salon_id', salonData.id);

      const list = therapistData ?? [];
      setTherapists(list);

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
        const today = new Date();
        const todayStr = toDateStr(today);
        const lastDay = new Date(today);
        lastDay.setDate(today.getDate() + 6);
        const lastStr = toDateStr(lastDay);

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !salon) return;

    if (file.size > 5 * 1024 * 1024) { showToast('5MB以下の画像を選択してください'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('JPEG・PNG・WebPのみ対応しています'); return;
    }

    setUploadingImage(true);
    const ext      = file.name.split('.').pop() ?? 'jpg';
    const salonId  = Number(salon.id);
    const path     = `${salonId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('salon-images')
      .upload(path, file, { upsert: false });

    if (uploadError) {
      console.error('[salon-images] storage upload error:', uploadError);
      showToast(`アップロードに失敗しました: ${uploadError.message}`);
      setUploadingImage(false);
      e.target.value = '';
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);

    const nextOrder = salonImages.length > 0
      ? Math.max(...salonImages.map(i => i.display_order)) + 1
      : 0;

    const { data: inserted, error: dbErr } = await supabase
      .from('salon_images')
      .insert({ salon_id: salonId, image_url: publicUrl, display_order: nextOrder })
      .select('id, image_url, display_order')
      .single();

    setUploadingImage(false);
    e.target.value = '';

    if (dbErr || !inserted) {
      console.error('[salon-images] db insert error:', dbErr);
      showToast(`DB保存に失敗しました: ${dbErr?.message ?? '不明なエラー'}`);
      // ストレージにアップロード済みのファイルをロールバック
      await supabase.storage.from('salon-images').remove([path]);
      return;
    }

    setSalonImages(prev => [...prev, inserted as SalonImage]);
    showToast('画像をアップロードしました');
  };

  const handleImageDelete = async (id: string, imageUrl: string) => {
    if (!window.confirm('この画像を削除しますか？')) return;

    // ストレージから削除（パスを URL から抽出）
    const marker = '/salon-images/';
    const markerIdx = imageUrl.indexOf(marker);
    if (markerIdx !== -1) {
      const storagePath = imageUrl.slice(markerIdx + marker.length);
      await supabase.storage.from('salon-images').remove([storagePath]);
    }

    await supabase.from('salon_images').delete().eq('id', id);
    setSalonImages(prev => prev.filter(img => img.id !== id));
    showToast('画像を削除しました');
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
        courses: buildCoursesJson(courseGroups),
        price: buildRepresentativePrice(courseGroups),
        hours: salonForm.hours,
        description: salonForm.description,
        appeal: salonForm.appeal,
        phone: salonForm.phone,
        address: salonForm.address,
        access: salonForm.access,
        closed_days: salonForm.closed_days,
        note: salonForm.note,
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
    const { data: therapistData } = await supabase
      .from('therapists')
      .select('id, name, work_hours, area, comment, profile_image_url, age, body_type, profile_text')
      .eq('salon_id', salon.id);

    const list = therapistData ?? [];
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
    setAddingTherapist(false);
    showToast('セラピストを追加しました');
  };

  const handleTherapistDelete = async (id: string, name: string | null) => {
    const displayName = name ?? 'このセラピスト';
    if (!window.confirm(`「${displayName}」を削除しますか？\nこの操作は取り消せません。`)) return;

    setDeletingTherapist(id);

    // ON DELETE CASCADE 未設定の場合も安全なよう schedules を先に削除
    await supabase.from('therapist_schedules').delete().eq('therapist_id', id);

    const { error } = await supabase.from('therapists').delete().eq('id', id);
    setDeletingTherapist(null);

    if (error) {
      showToast(`削除に失敗しました: ${error.message}`);
      return;
    }

    setTherapists(prev => prev.filter(t => t.id !== id));
    setTherapistForms(prev => { const n = { ...prev }; delete n[id]; return n; });
    setSchedules(prev => { const n = { ...prev }; delete n[id]; return n; });
    setExpandedSections(prev => {
      const n = new Set(prev);
      n.delete(`${id}-schedule`);
      return n;
    });
    showToast('セラピストを削除しました');
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
            ['salon',    '店舗情報'],
            ['schedule', '出勤設定'],
            ['profile',  'セラピスト情報'],
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

        {/* ── サロン情報編集 ── */}
        <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 ${activeTab === 'salon' ? '' : 'hidden'}`}>
          <h2 className="text-sm font-black text-slate-700">サロン情報の編集</h2>

          <div>
            <label className={labelClass}>サロン名</label>
            <div className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 text-sm cursor-not-allowed">
              {salonForm.name ?? ''}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">※ サロン名の変更は管理者のみ行えます。変更が必要な場合はお問い合わせください。</p>
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
            <label className={labelClass}>アピールポイント</label>
            <textarea rows={3} className={textareaClass} value={salonForm.appeal ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, appeal: e.target.value }))} />
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
              <div className="space-y-2">
                {salonImages.map((img, i) => (
                  <div key={img.id} className="flex items-center gap-3 bg-slate-50/60 rounded-xl border border-slate-100 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.image_url}
                      alt=""
                      className="w-20 h-14 object-cover rounded-lg border border-slate-200 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400 truncate">
                        {img.image_url.split('/').pop()}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleImageMove(i, 'up')}
                        disabled={i === 0}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors"
                      >↑</button>
                      <button
                        type="button"
                        onClick={() => handleImageMove(i, 'down')}
                        disabled={i === salonImages.length - 1}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors"
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => handleImageDelete(img.id, img.image_url)}
                        className="w-7 h-7 rounded-lg border border-rose-100 text-rose-400 text-xs flex items-center justify-center hover:bg-rose-50 transition-colors"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {salonImages.length < 3 && (
              <label className={`flex items-center gap-2 cursor-pointer w-full py-2.5 px-4 rounded-xl border-2 border-dashed text-xs font-bold transition-colors ${
                uploadingImage
                  ? 'border-pink-200 text-pink-300 cursor-not-allowed'
                  : 'border-pink-200 text-pink-500 hover:border-pink-400 hover:bg-pink-50/50'
              }`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={handleImageUpload}
                />
                {uploadingImage ? 'アップロード中...' : '+ 画像を追加（JPEG / PNG / WebP, 最大5MB）'}
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

        {/* ── タブ3: セラピスト情報 ── */}
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

      </main>
    </div>
  );
}