'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTop } from '@/app/lib/revalidateTop';
import {
  BADGE_CATEGORY_ORDER,
  BADGE_CATEGORY_LABELS,
  BADGE_CATEGORY_COLORS,
  BADGES_BY_CATEGORY,
  MAX_BADGES,
  sanitizeBadges,
} from '@/lib/therapistBadges';

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
  profile_images: string[] | null;
  age: string | null;
  body_type: string | null;
  profile_text: string | null;
  feature_badges: string[] | null;
};

const MAX_IMAGES = 5;

export default function TherapistEditPage() {
  const router = useRouter();
  const params = useParams();
  const therapistId = params.id as string;

  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [form, setForm] = useState<Partial<Therapist>>({});
  const [images, setImages] = useState<string[]>([]);
  const [bodyParts, setBodyParts] = useState<BodyParts>({ height: '', bust: '', cup: '', waist: '', hip: '' });
  const [badges, setBadges] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const { data: tData, error: tError } = await supabase
        .from('therapists')
        .select('id, salon_id, name, profile_image_url, profile_images, age, body_type, profile_text, feature_badges')
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
      // 複数画像：profile_images を優先、無ければ既存の単一画像を1枚目として扱う（互換性）
      const initialImages =
        Array.isArray(tData.profile_images) && tData.profile_images.length > 0
          ? tData.profile_images.filter(Boolean)
          : tData.profile_image_url
            ? [tData.profile_image_url]
            : [];
      setImages(initialImages.slice(0, MAX_IMAGES));
      setBodyParts(parseBodyType(tData.body_type));
      // 現在の特徴バッジをプリフィル（不正値除去・最大3つに正規化）
      setBadges(sanitizeBadges(tData.feature_badges));
    })();
  }, [therapistId, router]);

  const updateBodyPart = (key: keyof BodyParts, value: string) => {
    setBodyParts(prev => {
      const updated = { ...prev, [key]: value };
      setForm(f => ({ ...f, body_type: buildBodyType(updated) }));
      return updated;
    });
  };

  // slot が画像数と同じ＝末尾への追加、それ未満＝そのスロットの差し替え
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: number) => {
    const file = e.target.files?.[0];
    if (!file || !therapist) return;

    setUploadingSlot(slot);

    const ext = file.name.split('.').pop();
    const fileName = `${therapist.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('therapist-photos')
      .upload(fileName, file);

    if (uploadError) {
      showToast('アップロードに失敗しました: ' + uploadError.message);
      setUploadingSlot(null);
      e.target.value = '';
      return;
    }

    const { data: urlData } = supabase.storage
      .from('therapist-photos')
      .getPublicUrl(fileName);

    setImages(prev => {
      const next = [...prev];
      if (slot < next.length) next[slot] = urlData.publicUrl; // 差し替え
      else next.push(urlData.publicUrl);                       // 追加
      return next.slice(0, MAX_IMAGES);
    });
    setUploadingSlot(null);
    e.target.value = '';
    showToast('画像をアップロードしました(保存ボタンを押して反映してください)');
  };

  const handleImageRemove = (slot: number) => {
    setImages(prev => prev.filter((_, i) => i !== slot));
  };

  // 特徴バッジの選択トグル（最大 MAX_BADGES。上限到達後は未選択を追加しない）。
  const toggleBadge = (label: string) => {
    setBadges(prev => {
      if (prev.includes(label)) return prev.filter(b => b !== label);
      if (prev.length >= MAX_BADGES) return prev;
      return [...prev, label];
    });
  };

  const handleSave = async () => {
    if (!therapist) return;
    setSaving(true);

    const { error } = await supabase
      .from('therapists')
      .update({
        // profile_image_url は1枚目を保存して既存表示との互換性を維持
        profile_image_url: images[0] ?? null,
        profile_images:    images,
        age:               form.age ?? null,
        body_type:         form.body_type ?? null,
        profile_text:      form.profile_text ?? null,
        // 念のため保存前に正規化（既知バッジのみ・最大3つ）
        feature_badges:    sanitizeBadges(badges),
      })
      .eq('id', therapist.id);

    setSaving(false);
    if (!error) revalidateTop(); // 成功時：トップのISRを即時更新
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

        {/* プロフィール画像（最大5枚） */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">プロフィール画像</h2>
            <span className="text-[10px] text-slate-400">{images.length} / {MAX_IMAGES}枚</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {/* 既存スロット：プレビュー＋変更／削除 */}
            {images.map((url, i) => (
              <div key={i} className="space-y-1.5">
                <div className="relative aspect-square rounded-2xl border border-pink-100 overflow-hidden bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`プロフィール画像${i + 1}`} className="w-full h-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 bg-pink-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      メイン
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleImageRemove(i)}
                    aria-label="削除"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75 transition-colors"
                  >
                    ×
                  </button>
                </div>
                <label className="block text-center bg-white border border-slate-200 text-slate-500 text-[10px] font-bold py-1 rounded-lg cursor-pointer hover:border-pink-300 hover:text-pink-500 transition-colors">
                  {uploadingSlot === i ? '...' : '変更'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleImageUpload(e, i)}
                    disabled={uploadingSlot !== null}
                    className="hidden"
                  />
                </label>
              </div>
            ))}

            {/* 追加スロット（5枚未満のとき1つだけ表示） */}
            {images.length < MAX_IMAGES && (
              <div className="space-y-1.5">
                <label className="flex flex-col items-center justify-center aspect-square rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
                  {uploadingSlot === images.length ? (
                    <span className="text-[10px] font-bold">アップ中...</span>
                  ) : (
                    <>
                      <span className="text-2xl leading-none">＋</span>
                      <span className="text-[10px] font-bold mt-0.5">追加</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleImageUpload(e, images.length)}
                    disabled={uploadingSlot !== null}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-400">
            推奨：縦長（3:4）1080×1440px／JPEG・PNG・WebP、5MBまで。1枚目がメイン画像として一覧などに表示されます。
          </p>
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

        {/* 特徴バッジ（最大3つ） */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">
              特徴バッジ
              <span className="text-[11px] font-normal text-slate-400 ml-1">（最大{MAX_BADGES}つ）</span>
            </h2>
            <span className="text-[11px] font-bold text-slate-500">{badges.length} / {MAX_BADGES} 選択中</span>
          </div>

          {BADGE_CATEGORY_ORDER.map((cat) => {
            const colors = BADGE_CATEGORY_COLORS[cat];
            const atMax = badges.length >= MAX_BADGES;
            return (
              <div key={cat}>
                <p className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  {BADGE_CATEGORY_LABELS[cat]}
                  {/* カテゴリの色見本（fill=背景 / border=枠線。色は therapistBadges を参照） */}
                  <span
                    aria-hidden
                    className="inline-block w-4 h-2.5 rounded-full border"
                    style={{ backgroundColor: colors.fill, borderColor: colors.border }}
                  />
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BADGES_BY_CATEGORY[cat].map((label) => {
                    const selected = badges.includes(label);
                    const disabled = !selected && atMax;
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleBadge(label)}
                        className={`relative inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        style={
                          selected
                            ? { backgroundColor: colors.fill, color: colors.text, borderColor: colors.text }
                            : { backgroundColor: '#F9FAFB', color: '#9CA3AF', borderColor: '#E5E7EB' }
                        }
                        aria-pressed={selected}
                      >
                        {label}
                        {selected && (
                          <span
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: colors.text, color: '#ffffff' }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

       <div className="flex justify-between items-center pb-4">
          <Link
            href="/mypage"
            className="px-5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:border-pink-300 hover:text-pink-500 transition-colors"
          >
            ← マイページに戻る
          </Link>
          <button className={saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </main>
    </div>
  );
}