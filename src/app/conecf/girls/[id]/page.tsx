'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ConecfShell } from '../../ConecfShell';
import { useConecfHref } from '../../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import { cleanupTherapistPhotos, setTherapistActive } from '@/app/actions/therapistAdmin';
import {
  getConecfGirl, saveConecfGirl, saveConecfGirlImages, saveConecfGirlTargets, type ConecfGirlDetail,
} from '@/app/actions/conecfGirls';
import {
  CONECF_CUPS, CONECF_BLOOD_TYPES, CONECF_STYLES, CONECF_LOOK_TYPES, CONECF_MAX_IMAGES, CONECF_NAME_MAX, ageFromBirthDate,
} from '@/lib/conecfGirl';

// コネックエフ「女性プロフィール編集」（第398便・1c・2026-09-17）。
// ★ タブはベンリーに寄せた：基本情報／画像／送り先サイト。★ タブごとに保存（★ 押したタブのぶんだけ書く）。
// ★ 保存した値はフクエスの表示にそのまま出る（therapists を直接更新）。

const supabase = createClient();
const BUCKET = 'therapist-photos';
const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const INPUT = 'w-full border border-slate-200 bg-white px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200';
type Tab = 'basic' | 'images' | 'sites';
type Form = ConecfGirlDetail['form'];

function Field({ label, badge, children }: { label: string; badge?: '必須' | '推奨'; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-1.5 sm:gap-3 items-start py-2.5 border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-1.5 pt-2">
        {badge && (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 ${badge === '必須' ? 'text-rose-600 bg-rose-50' : 'text-amber-600 bg-amber-50'}`}>{badge}</span>
        )}
        <span className="text-[14px] font-bold text-slate-600">{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function EditBody({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [d, setD] = useState<ConecfGirlDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('basic');
  const [form, setForm] = useState<Form | null>(null);
  const [ageFromBirth, setAgeFromBirth] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [sites, setSites] = useState<ConecfGirlDetail['sites']>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [sessionUploads, setSessionUploads] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    getConecfGirl({ id }).then((res) => {
      if (!alive) return;
      if (!res.ok) { setError(res.error); return; }
      setD(res.data); setForm(res.data.form); setImages(res.data.images); setSites(res.data.sites);
    }).catch(() => { if (alive) setError('読み込めませんでした'); });
    return () => { alive = false; };
  }, [id]);

  if (error) {
    return (
      <div className={`${CARD} p-5 space-y-2`}>
        <p className="text-[14px] text-slate-500">{error}</p>
        <Link href={href('/girls')} className="text-[14px] font-bold text-indigo-600 underline">女性一覧へ戻る</Link>
      </div>
    );
  }
  if (!d || !form) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;

  const set = (k: keyof Form, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const autoAge = ageFromBirth ? ageFromBirthDate(form.birthDate, new Date()) : null;

  const onSaveBasic = async () => {
    setSaving(true);
    const res = await saveConecfGirl({ id, values: { ...form, ageFromBirth } });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    setForm((f) => (f ? { ...f, age: res.data.age ?? '' } : f));
    void revalidateSalon(d.salonId); void revalidateTherapist(id);
    onToast('保存しました（フクエスにも反映しました）');
  };

  const onToggleActive = async () => {
    const next = !form.isActive;
    setSaving(true);
    const res = await setTherapistActive({ therapistId: id, salonId: d.salonId, isActive: next, via: 'conecf' });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    set('isActive', next);
    void revalidateSalon(d.salonId); void revalidateTherapist(id);
    onToast(next ? '公開にしました' : '非公開にしました（今すぐと、この先の出勤は外しました）');
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: number) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(slot);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    setUploading(null);
    if (upErr) { onToast('アップロードに失敗しました: ' + upErr.message); return; }
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    setSessionUploads((p) => [...p, url]);
    setImages((prev) => {
      const next = [...prev];
      if (slot < next.length) next[slot] = url; else next.push(url);
      return next.slice(0, CONECF_MAX_IMAGES);
    });
    onToast('アップロードしました（保存を押すと反映されます）');
  };

  const onSaveImages = async () => {
    setSaving(true);
    const before = d.images;
    const res = await saveConecfGirlImages({ id, images });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    const keep = new Set(res.data.images);
    const removed = [...new Set([...before, ...sessionUploads])].filter((u) => !keep.has(u));
    if (removed.length > 0) void cleanupTherapistPhotos({ therapistId: String(id), salonId: d.salonId, urls: removed }).catch(() => {});
    setSessionUploads([]);
    setD((x) => (x ? { ...x, images: res.data.images } : x));
    void revalidateSalon(d.salonId); void revalidateTherapist(id);
    onToast('写真を保存しました（1枚目がトップ画像です）');
  };

  const move = (i: number, dir: -1 | 1) => setImages((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const onSaveSites = async () => {
    setSaving(true);
    const res = await saveConecfGirlTargets({ id, targets: sites });
    setSaving(false);
    onToast(res.ok ? '送り先を保存しました' : res.error);
  };

  const TABS: Array<[Tab, string]> = [['basic', '基本情報'], ['images', '画像'], ['sites', '送り先サイト']];
  const saveBtn = (onClick: () => void, label = '保存する') => (
    <div className="sticky bottom-0 bg-white/90 backdrop-blur border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-3">
      {!enabled && <span className="text-[12.5px] text-amber-700">保存するには、ホームで「コネックエフに切り替える」を押してください</span>}
      <button type="button" disabled={saving || !enabled} onClick={onClick}
        className="px-8 py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[15px] font-bold disabled:opacity-50">
        {saving ? '保存しています…' : label}
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link href={href('/girls')} className="text-[14px] font-bold text-slate-500 hover:text-indigo-600">‹ 女性一覧へ</Link>
        <button type="button" disabled={saving || !enabled} onClick={() => void onToggleActive()}
          className={`px-3 py-1.5 text-[13px] font-bold border ${form.isActive ? 'text-indigo-700 border-indigo-300 bg-indigo-50' : 'text-slate-500 border-slate-300 bg-white'} disabled:opacity-50`}>
          {form.isActive ? '公開中（押すと非公開）' : '非公開（押すと公開）'}
        </button>
      </div>

      <div className="flex border-b border-slate-200">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-[14.5px] font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'basic' && (
        <div className={CARD}>
          <div className="px-4 py-2">
            <Field label="女性名" badge="必須">
              <input className={INPUT} value={form.name} maxLength={CONECF_NAME_MAX} onChange={(e) => set('name', e.target.value)} />
              <p className="text-[12px] text-slate-400 mt-1">{[...form.name].length}/{CONECF_NAME_MAX}文字。★ 変えても駅ちか・エステ魂の登録名は変わりません。</p>
            </Field>
            <Field label="カタカナ"><input className={INPUT} value={form.nameKana} onChange={(e) => set('nameKana', e.target.value)} /></Field>
            <Field label="ひらがな"><input className={INPUT} value={form.nameHira} onChange={(e) => set('nameHira', e.target.value)} /></Field>
            <Field label="ローマ字"><input className={INPUT} value={form.nameRomaji} onChange={(e) => set('nameRomaji', e.target.value)} /></Field>
            <Field label="入店日" badge="推奨">
              <div className="flex flex-wrap items-center gap-3">
                <input type="date" className={`${INPUT} max-w-[200px]`} value={form.joinedOn} onChange={(e) => set('joinedOn', e.target.value)} />
                <label className="flex items-center gap-1.5 text-[14px] text-slate-600">
                  <input type="checkbox" checked={form.isNewFace} onChange={(e) => set('isNewFace', e.target.checked)} className="accent-indigo-600" />
                  新人に設定する
                </label>
              </div>
            </Field>
            <Field label="年齢" badge="推奨">
              <div className="flex flex-wrap items-center gap-3">
                <input inputMode="numeric" className={`${INPUT} max-w-[100px]`} disabled={ageFromBirth}
                  value={ageFromBirth ? (autoAge ?? '') : form.age} onChange={(e) => set('age', e.target.value)} />
                <span className="text-[14px] text-slate-500">歳</span>
                <label className="flex items-center gap-1.5 text-[14px] text-slate-600">
                  <input type="checkbox" checked={ageFromBirth} onChange={(e) => setAgeFromBirth(e.target.checked)} className="accent-indigo-600" />
                  生年月日と連動させる
                </label>
              </div>
            </Field>
            <Field label="生年月日">
              <input type="date" className={`${INPUT} max-w-[200px]`} value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              <p className="text-[12px] text-slate-400 mt-1">公開ページには出しません。</p>
            </Field>
            <Field label="3サイズ" badge="推奨">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([['bust', 'B'], ['waist', 'W'], ['hip', 'H'], ['height', 'T']] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-slate-500 w-4">{l}</span>
                    <input inputMode="numeric" className={INPUT} value={form[k]} onChange={(e) => set(k, e.target.value)} />
                  </label>
                ))}
              </div>
            </Field>
            <Field label="カップ" badge="必須">
              <select className={`${INPUT} max-w-[140px]`} value={form.cup} onChange={(e) => set('cup', e.target.value)}>
                <option value="">未選択</option>
                {CONECF_CUPS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="体重"><input inputMode="numeric" className={`${INPUT} max-w-[100px]`} value={form.weight} onChange={(e) => set('weight', e.target.value)} /></Field>
            <Field label="血液型">
              <select className={`${INPUT} max-w-[140px]`} value={form.bloodType} onChange={(e) => set('bloodType', e.target.value)}>
                <option value="">未選択</option>
                {CONECF_BLOOD_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="スタイル">
              <select className={`${INPUT} max-w-[220px]`} value={form.style} onChange={(e) => set('style', e.target.value)}>
                <option value="">未選択</option>
                {CONECF_STYLES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="タイプ">
              <select className={`${INPUT} max-w-[220px]`} value={form.lookType} onChange={(e) => set('lookType', e.target.value)}>
                <option value="">未選択</option>
                {CONECF_LOOK_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          {saveBtn(() => void onSaveBasic())}
        </div>
      )}

      {tab === 'images' && (
        <div className={CARD}>
          <div className="p-4 space-y-3">
            <p className="text-[14px] text-slate-500">最大{CONECF_MAX_IMAGES}枚。1枚目がトップ画像です（駅ちか・エステ魂へ登録するときも1枚目を送ります）。</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Array.from({ length: Math.min(images.length + 1, CONECF_MAX_IMAGES) }).map((_, i) => {
                const url = images[i];
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="aspect-[3/4] bg-slate-100 border border-slate-200 overflow-hidden relative">
                      {url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={url} alt="" className="w-full h-full object-cover" />
                        : <span className="absolute inset-0 grid place-items-center text-[12px] text-slate-400">No.{i + 1}</span>}
                      {i === 0 && url && <span className="absolute top-1 left-1 text-[11px] font-bold text-white bg-indigo-600 px-1.5 py-0.5">トップ</span>}
                    </div>
                    <label className="block text-center text-[12.5px] font-bold text-indigo-600 border border-indigo-200 py-1 cursor-pointer hover:bg-indigo-50">
                      {uploading === i ? 'アップロード中…' : url ? '差し替え' : '画像を選択'}
                      <input type="file" accept="image/*" className="hidden" disabled={uploading !== null} onChange={(e) => void onUpload(e, i)} />
                    </label>
                    {url && (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="flex-1 text-[12px] border border-slate-200 py-0.5 disabled:opacity-30">←</button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} className="flex-1 text-[12px] border border-slate-200 py-0.5 disabled:opacity-30">→</button>
                        <button type="button" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="flex-1 text-[12px] border border-slate-200 py-0.5 text-rose-600">削除</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {saveBtn(() => void onSaveImages(), '写真を保存する')}
        </div>
      )}

      {tab === 'sites' && (
        <div className={CARD}>
          <div className="p-4 space-y-3">
            <p className="text-[14px] text-slate-500 leading-relaxed">
              この方の出勤などを送るサイトを選びます。フクエスには常に反映されます。
            </p>
            <ul className="border border-slate-200 divide-y divide-slate-100">
              <li className="flex items-center gap-3 px-3 py-2.5">
                <input type="checkbox" checked disabled className="accent-indigo-600" />
                <b className="text-[15px] font-bold text-slate-700">フクエス</b>
                <span className="text-[12.5px] text-slate-400">常に反映</span>
              </li>
              {sites.map((s, i) => (
                <li key={s.provider + '#' + s.slot} className="flex items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" checked={s.enabled} className="accent-indigo-600"
                    onChange={(e) => setSites((p) => p.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} />
                  <b className="text-[15px] font-bold text-slate-700">{s.label}</b>
                </li>
              ))}
            </ul>
            {sites.length === 0 && (
              <p className="text-[13.5px] text-slate-500">
                ID・PASSを登録したサイトがまだありません。<Link href={href('/sites')} className="font-bold text-indigo-600 underline">ID・PASS登録</Link>
              </p>
            )}
          </div>
          {sites.length > 0 && saveBtn(() => void onSaveSites(), '送り先を保存する')}
        </div>
      )}
    </div>
  );
}

export default function ConecfGirlEditPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="girls" title="女性プロフィール編集" toast={toast}>
      {(a) => (Number.isInteger(id) && id > 0 ? <EditBody id={id} enabled={!!a.enabledAt} onToast={showToast} /> : <p className="text-slate-500">女性の指定が正しくありません。</p>)}
    </ConecfShell>
  );
}
