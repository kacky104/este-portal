'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

const supabase = createClient();

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
};

type Therapist = {
  id: string;
  name: string | null;
  work_hours: string | null;
  area: string | null;
  comment: string | null;
};

export default function MyPage() {
  const router = useRouter();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [salonForm, setSalonForm] = useState<Partial<Salon>>({});
  const [therapistForms, setTherapistForms] = useState<Record<string, Partial<Therapist>>>({});
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingTherapist, setSavingTherapist] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .select('id, name, rating, review_count, tags, price, area, hours, description, appeal, therapist_count, therapist_types, therapist_profile, phone, address, access, closed_days, note')
        .eq('owner_id', user.id)
        .single();

      if (salonError || !salonData) {
        setLoadError('サロン情報が見つかりません');
        return;
      }

      setSalon(salonData);
      setSalonForm(salonData);

      const { data: therapistData } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment')
        .eq('salon_id', salonData.id);

      const list = therapistData ?? [];
      setTherapists(list);
      const forms: Record<string, Partial<Therapist>> = {};
      list.forEach((t) => { forms[t.id] = { work_hours: t.work_hours, comment: t.comment }; });
      setTherapistForms(forms);
    })();
  }, [router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSalonSave = async () => {
    if (!salon) return;
    setSaving(true);
    const { error } = await supabase
      .from('salons')
      .update({
        name: salonForm.name,
        price: salonForm.price,
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
    if (error) {
      showToast('保存に失敗しました');
    } else {
      showToast('保存しました');
    }
  };

  const handleTherapistSave = async (id: string) => {
    setSavingTherapist(id);
    const form = therapistForms[id];
    const { error } = await supabase
      .from('therapists')
      .update({ work_hours: form.work_hours, comment: form.comment })
      .eq('id', id);
    setSavingTherapist(null);
    if (error) {
      showToast('保存に失敗しました');
    } else {
      showToast('保存しました');
    }
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

      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-black text-slate-800 tracking-wide">マイページ</h1>
          <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors">
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-700">サロン情報の編集</h2>

          <div>
            <label className={labelClass}>サロン名</label>
            <input className={inputClass} value={salonForm.name ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>料金</label>
            <input className={inputClass} value={salonForm.price ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, price: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>営業時間</label>
            <input className={inputClass} value={salonForm.hours ?? ''} onChange={(e) => setSalonForm((p) => ({ ...p, hours: e.target.value }))} />
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

          <div className="pt-1 flex justify-end">
            <button className={saveBtn} onClick={handleSalonSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-700">セラピスト出勤情報</h2>

          {therapists.length === 0 && (
            <p className="text-xs text-slate-400">登録されているセラピストがいません</p>
          )}

          {therapists.map((t) => (
            <div key={t.id} className="rounded-2xl border border-slate-100 bg-pink-50/30 p-4 space-y-3">
              <p className="text-sm font-bold text-slate-700">{t.name ?? '(名前未設定)'}</p>
              <div>
                <label className={labelClass}>出勤時間</label>
                <input
                  className={inputClass}
                  value={therapistForms[t.id]?.work_hours ?? ''}
                  onChange={(e) => setTherapistForms((p) => ({ ...p, [t.id]: { ...p[t.id], work_hours: e.target.value } }))}
                />
              </div>
              <div>
                <label className={labelClass}>コメント</label>
                <input
                  className={inputClass}
                  value={therapistForms[t.id]?.comment ?? ''}
                  onChange={(e) => setTherapistForms((p) => ({ ...p, [t.id]: { ...p[t.id], comment: e.target.value } }))}
                />
              </div>
              <div className="flex justify-end">
                <button
                  className={saveBtn}
                  onClick={() => handleTherapistSave(t.id)}
                  disabled={savingTherapist === t.id}
                >
                  {savingTherapist === t.id ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
