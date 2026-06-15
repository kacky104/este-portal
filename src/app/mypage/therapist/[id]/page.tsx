'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';

const supabase = createClient();

type BodyParts = { height: string; bust: string; cup: string; waist: string; hip: string };

function parseBodyType(raw: string | null): BodyParts {
  if (!raw) return { height: '', bust: '', cup: '', waist: '', hip: '' };
  const hMatch   = raw.match(/T(\d+)/);
  const bMatch   = raw.match(/B(\d+)\(([A-Za-z]+)\)/);
  const wMatch   = raw.match(/W(\d+)/);
  const hipMatch = raw.match(/H(\d+)/);
  return {
    height: hMatch?.[1]   ?? '',
    bust:   bMatch?.[1]   ?? '',
    cup:    bMatch?.[2]   ?? '',
    waist:  wMatch?.[1]   ?? '',
    hip:    hipMatch?.[1] ?? '',
  };
}

function buildBodyType(p: BodyParts): string {
  const parts: string[] = [];
  if (p.height) parts.push(`T${p.height}`);
  if (p.bust && p.cup) parts.push(`B${p.bust}(${p.cup.toUpperCase()})`);
  else if (p.bust) parts.push(`B${p.bust}`);
  if (p.waist) parts.push(`W${p.waist}`);
  if (p.hip)   parts.push(`H${p.hip}`);
  return parts.join(' ');
}

type Therapist = {
  id: string;
  salon_id: number;
  name: string | null;
  profile_image_url: string | null;
  age: string | null;
  body_type: string | null;
  profile_text: string | null;
};

export default function TherapistEditPage() {
  const router = useRouter();
  const params = useParams();
  const therapistId = params.id as string;

  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [form, setForm] = useState<Partial<Therapist>>({});
  const [bodyParts, setBodyParts] = useState<BodyParts>({ height: '', bust: '', cup: '', waist: '', hip: '' });
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: tData, error: tError } = await supabase
        .from('therapists')
        .select('id, salon_id, name, profile_image_url, age, body_type, profile_text')
        .eq('id', therapistId)
        .single();

      if (tError || !tData) {
        setLoadError('セラピストが見つかりません');
        return;
      }

      // 自分のサロンのセラピストか確認
      const { data: salonData } = await supabase
        .from('salons')
        .select('id')
        .eq('id', tData.salon_id)
        .eq('owner_id', user.id)
        .single();

      if (!salonData) {
        setLoadError('このセラピストを編集する権限がありません');
        return;
      }

      setTherapist(tData);
      setForm(tData);
      setBodyParts(parseBodyType(tData.body_type));
    })();
  }, [therapistId, router]);

  const updateBodyPart = (key: keyof BodyParts, value: string) => {
    setBodyParts(prev => {
      const updated = { ...prev, [key]: value };
      setForm(f => ({ ...f, body_type: buildBodyType(updated) }));
      return updated;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !therapist) return;

    setUploading(true);

    const ext = file.name.split('.').pop();
    const fileName = `${therapist.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('therapist-photos')
      .upload(fileName, file);

    if (uploadError) {
      showToast('アップロードに失敗しました: ' + uploadError.message);
      setUploading(false);
      e.target.value = '';
      return;
    }

    const { data: urlData } = supabase.storage
      .from('therapist-photos')
      .getPublicUrl(fileName);

    setForm(f => ({ ...f, profile_image_url: urlData.publicUrl }));
    setUploading(false);
    e.target.value = '';
    showToast('画像をアップロードしました(保存ボタンを押して反映してください)');
  };

  const handleSave = async () => {
    if (!therapist) return;
    setSaving(true);

    const { error } = await supabase
      .from('therapists')
      .update({
        profile_image_url: form.profile_image_url ?? null,
        age:               form.age ?? null,
        body_type:         form.body_type ?? null,
        profile_text:      form.profile_text ?? null,
      })
      .eq('id', therapist.id);

    setSaving(false);
    showToast(error ? '保存に失敗しました' : '保存しました');
  };

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
  const textareaClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none';
  const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
  const saveBtn = 'px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50';

  if (loadError) {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-rose-100 shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <p className="text-sm text-slate-500">{loadError}</p>
          <Link href="/mypage" className="text-xs text-pink-500 font-bold hover:underline">
            マイページに戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!therapist) {
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
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/mypage" className="text-slate-400 hover:text-pink-500 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-black text-slate-800 tracking-wide">
            {therapist.name ?? 'セラピスト'} のプロフィール編集
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* プロフィール画像 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">プロフィール画像</h2>

          <div className="flex items-center gap-4">
            {form.profile_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.profile_image_url}
                alt="プロフィール画像"
                className="w-24 h-24 object-cover rounded-2xl border border-pink-100"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 text-xs">
                画像なし
              </div>
            )}

            <div className="space-y-1">
              <label className="inline-block bg-white border border-pink-300 text-pink-600 px-4 py-2 rounded-xl cursor-pointer text-xs font-bold hover:bg-pink-50 transition-colors">
                {uploading ? 'アップロード中...' : '画像を選択'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              <p className="text-[10px] text-slate-400">JPEG / PNG / WebP、5MBまで</p>
            </div>
          </div>
        </div>

        {/* 年齢 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">年齢</h2>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="18"
              max="99"
              className={`${inputClass} max-w-[120px]`}
              placeholder="22"
              value={(form.age ?? '').replace(/[^0-9]/g, '') || ''}
              onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
            />
            <span className="text-sm text-slate-500 font-medium">歳</span>
          </div>
        </div>

        {/* スタイル */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">スタイル</h2>
          <div className="grid grid-cols-5 gap-2">
            {(
              [
                { key: 'height', label: 'T',   placeholder: '160', type: 'number' },
                { key: 'bust',   label: 'B',   placeholder: '85',  type: 'number' },
                { key: 'cup',    label: 'CUP', placeholder: 'D',   type: 'text'   },
                { key: 'waist',  label: 'W',   placeholder: '58',  type: 'number' },
                { key: 'hip',    label: 'H',   placeholder: '85',  type: 'number' },
              ] as { key: keyof BodyParts; label: string; placeholder: string; type: string }[]
            ).map(({ key, label, placeholder, type }) => (
              <div key={key} className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-bold text-slate-400">{label}</span>
                <input
                  type={type}
                  placeholder={placeholder}
                  value={bodyParts[key] ?? ''}
                  onChange={(e) => updateBodyPart(key, e.target.value)}
                  className="w-full px-1.5 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 text-center"
                />
              </div>
            ))}
          </div>
          {form.body_type && (
            <p className="text-[10px] text-slate-400">
              保存値: <span className="font-mono text-slate-600">{form.body_type}</span>
            </p>
          )}
        </div>

        {/* 詳細プロフィール */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">詳細プロフィール</h2>
          <textarea
            rows={5}
            className={textareaClass}
            placeholder="セラピストの自己紹介文を入力してください"
            value={form.profile_text ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, profile_text: e.target.value }))}
          />
        </div>

        <div className="flex justify-end pb-4">
          <button className={saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </main>
    </div>
  );
}