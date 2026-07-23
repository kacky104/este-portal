'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateFeaturedArea } from '@/app/lib/revalidateTop';
import { AREA_ORDER, ALL_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

const MAX_FEATURED = 5;
const BUCKET = 'featured-salon-images';

type FeaturedItem = {
  id:              string;
  salonId:         number;
  salonName:       string;
  salonArea:       string;
  displayOrder:    number;
  imageUrl:        string | null;
  mobileImageUrl:  string | null;
};

type SalonOption = {
  id:   number;
  name: string;
  area: string;
};

// 設定対象セットの選択肢：トップ共通（null）＋ 全域以外の6エリア。
const AREA_TABS: { label: string; value: string | null }[] = [
  { label: 'トップ(共通)', value: null },
  ...AREA_ORDER.filter(a => a !== ALL_AREA).map(a => ({ label: areaLabel(a), value: a })),
];

export default function FeaturedSalonsManager({ allSalons }: { allSalons: SalonOption[] }) {
  const supabase = createClient();
  const [items,            setItems]           = useState<FeaturedItem[]>([]);
  const [selectedSalonId,  setSelectedSalonId] = useState<number | ''>('');
  const [selectedArea,     setSelectedArea]    = useState<string | null>(null);
  const [loading,          setLoading]         = useState(true);
  const [saving,           setSaving]          = useState(false);
  const [errorMsg,         setErrorMsg]        = useState('');

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const uploadTargetId  = useRef<string | null>(null);
  const uploadKind      = useRef<'pc' | 'sp'>('pc'); // アップロード対象がPC用かスマホ用か

  const fetchFeatured = useCallback(async () => {
    setLoading(true);
    const sb = createClient();

    const baseQuery = sb
      .from('featured_salons')
      .select('id, salon_id, display_order, image_url, mobile_image_url')
      .order('display_order', { ascending: true });
    const { data: featuredData, error } = await (
      selectedArea === null ? baseQuery.is('area', null) : baseQuery.eq('area', selectedArea)
    );

    if (error) {
      setErrorMsg('テーブルがまだ作成されていない可能性があります。SQLマイグレーションを実行してください。');
      setLoading(false);
      return;
    }

    const rows = featuredData ?? [];

    let nameMap: Record<number, { name: string; area: string }> = {};
    const salonIds = [...new Set(rows.map(r => r.salon_id as number))];
    if (salonIds.length > 0) {
      const { data: salonData } = await sb
        .from('salons')
        .select('id, name, area')
        .in('id', salonIds);
      nameMap = Object.fromEntries(
        (salonData ?? []).map(s => [
          s.id as number,
          { name: (s.name as string) ?? '', area: (s.area as string) ?? '' },
        ])
      );
    }

    setErrorMsg('');
    setItems(rows.map(row => ({
      id:           row.id           as string,
      salonId:      row.salon_id     as number,
      salonName:    nameMap[row.salon_id as number]?.name ?? '',
      salonArea:    nameMap[row.salon_id as number]?.area ?? '',
      displayOrder:   row.display_order as number,
      imageUrl:       (row.image_url as string | null) ?? null,
      mobileImageUrl: (row.mobile_image_url as string | null) ?? null,
    })));
    setLoading(false);
  }, [selectedArea]);

  useEffect(() => { fetchFeatured(); }, [fetchFeatured]);

  const handleAdd = async () => {
    if (selectedSalonId === '' || items.length >= MAX_FEATURED) return;
    const nextOrder = items.length + 1;
    setSaving(true);
    // トップ共通（null）は area キーを送らない＝マイグレーション前でも従来どおり動く。
    // 地域別（値あり）は area 列が必要なため、マイグレーション後に有効。
    const { error } = await supabase.from('featured_salons').insert({
      salon_id:      selectedSalonId,
      display_order: nextOrder,
      ...(selectedArea !== null ? { area: selectedArea } : {}),
    });
    setSaving(false);
    if (!error) {
      setSelectedSalonId('');
      revalidateFeaturedArea(selectedArea); // 成功時：対象ページのISRを即時更新
      await fetchFeatured();
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const { error } = await supabase.from('featured_salons').delete().eq('id', id);
    if (error) { setSaving(false); alert(`削除に失敗しました。\n${error.message}`); return; }
    // 行削除時に紐づく画像ファイルもstorageから掃除（残置ファイル対策）。DB削除成功後に実施。
    const removed = items.find(i => i.id === id);
    // PC用・スマホ用の両ファイルを掃除。
    const oldPaths = [removed?.imageUrl ?? null, removed?.mobileImageUrl ?? null]
      .map(u => (u ? u.split(`/${BUCKET}/`)[1] : null))
      .filter((pth): pth is string => Boolean(pth));
    if (oldPaths.length > 0) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(oldPaths);
      if (removeError) console.error('[FeaturedSalons] 行削除に伴う画像の削除に失敗:', oldPaths, removeError);
    }
    setSaving(false);
    revalidateFeaturedArea(selectedArea);
    await fetchFeatured();
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[swapIdx]] = [reordered[swapIdx], reordered[index]];

    setSaving(true);
    await Promise.all(
      reordered.map((item, i) =>
        supabase.from('featured_salons').update({ display_order: i + 1 }).eq('id', item.id)
      )
    );
    setSaving(false);
    setItems(reordered.map((item, i) => ({ ...item, displayOrder: i + 1 })));
    revalidateFeaturedArea(selectedArea);
  };

  const triggerImageUpload = (itemId: string, kind: 'pc' | 'sp' = 'pc') => {
    uploadTargetId.current = itemId;
    uploadKind.current = kind;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = uploadTargetId.current;
    if (!file || !itemId) return;

    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // パスは timestamp でユニーク化（salons/{id}/{timestamp}.{ext}）。固定名＋upsertだと差し替えても
    // public URL が不変でCDN/ブラウザが旧画像をキャッシュし続ける（＝「変更しても前回の画像」バグ）。
    // 毎回URLが変わるようにして確実に反映させる。
    // salons/ プレフィックスで求人分(jobs/)と分離。削除は image_url から '/{BUCKET}/' 以降を
    // 切り出す方式のため、プレフィックス無しの旧オブジェクトも引き続き削除可能。
    const kind = uploadKind.current;
    // スマホ用は sp- プレフィックスで分離。PC用は従来どおり。
    const path = kind === 'sp'
      ? `salons/${itemId}/sp-${Date.now()}.${ext}`
      : `salons/${itemId}/${Date.now()}.${ext}`;

    setSaving(true);

    // 差し替え前の旧ファイルパスを控えておく（新規アップロード成功後に掃除する）。
    const oldUrl = kind === 'sp' ? item.mobileImageUrl : item.imageUrl;
    const oldPath = oldUrl ? oldUrl.split(`/${BUCKET}/`)[1] : null;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      alert(`画像のアップロードに失敗しました。\n${uploadError.message}\n\nSupabaseのストレージポリシーを確認してください。`);
      e.target.value = '';
      uploadTargetId.current = null;
      setSaving(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: updateError } = await supabase
      .from('featured_salons')
      .update(kind === 'sp' ? { mobile_image_url: publicUrl } : { image_url: publicUrl })
      .eq('id', itemId);

    if (updateError) {
      console.error('DB update error:', updateError);
      alert(`画像URLの保存に失敗しました。\n${updateError.message}`);
    } else if (oldPath && oldPath !== path) {
      // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (removeError) console.error('[FeaturedSalons] 旧画像の削除に失敗:', oldPath, removeError);
    }

    e.target.value = '';
    uploadTargetId.current = null;
    setSaving(false);
    if (!updateError) revalidateFeaturedArea(selectedArea);
    await fetchFeatured();
  };

  const handleDeleteImage = async (item: FeaturedItem, kind: 'pc' | 'sp' = 'pc') => {
    const targetUrl = kind === 'sp' ? item.mobileImageUrl : item.imageUrl;
    if (!targetUrl) return;
    if (kind === 'sp' && !window.confirm('スマホ用画像を削除しますか？\nスマホではPC用画像の表示に戻ります。')) return;
    setSaving(true);
    const storagePath = targetUrl.split(`/${BUCKET}/`)[1];
    if (storagePath) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath]);
      if (removeError) console.error('[FeaturedSalons] 画像の削除に失敗:', storagePath, removeError);
    }
    await supabase.from('featured_salons').update(kind === 'sp' ? { mobile_image_url: null } : { image_url: null }).eq('id', item.id);
    setSaving(false);
    revalidateFeaturedArea(selectedArea);
    await fetchFeatured();
  };

  const featuredIds     = new Set(items.map(i => i.salonId));
  const availableSalons = allSalons.filter(s => !featuredIds.has(s.id));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">推奨画像サイズ: PC用 横1440×縦540px／スマホ用（任意）横1080×縦540px</span>
        </div>
        <span className="text-xs text-slate-400">{items.length} / {MAX_FEATURED}件</span>
      </div>

      {/* 設定対象セットの切り替え（トップ共通 / 各地域ページ） */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {AREA_TABS.map(tab => {
          const active = selectedArea === tab.value;
          return (
            <button
              key={tab.label}
              onClick={() => { if (!active) { setSelectedSalonId(''); setSelectedArea(tab.value); } }}
              disabled={saving}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-40 ${
                active
                  ? 'bg-pink-500 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-pink-300 hover:text-pink-500'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        {selectedArea === null
          ? 'トップページ（/）に表示される共通のピックアップです。'
          : `「${areaLabel(selectedArea)}」の地域ページに表示されるピックアップです。`}
      </p>
      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        スマホ用画像（任意）を設定するとスマホではそちらが表示されます（未設定ならPC用が中央トリミングで表示）。スマホの表示枠は全幅×高さ約208px（約2:1）です。
      </p>

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">
          ⚠ {errorMsg}
        </div>
      ) : (
        <>
          {/* 登録済み一覧 */}
          {items.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl mb-4">
              ピックアップ店舗が未設定です
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="bg-pink-50/40 rounded-2xl px-4 py-3 border border-pink-100/70"
                >
                  {/* 上段: 番号・名前・操作ボタン */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-pink-400 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.salonName}</p>
                      <p className="text-[10px] text-slate-400">{areaLabel(item.salonArea)}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleMove(i, 'up')}
                        disabled={i === 0 || saving}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors"
                      >↑</button>
                      <button
                        onClick={() => handleMove(i, 'down')}
                        disabled={i === items.length - 1 || saving}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-pink-300 hover:text-pink-500 disabled:opacity-30 transition-colors"
                      >↓</button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={saving}
                        className="w-7 h-7 rounded-lg border border-rose-100 text-rose-400 text-xs flex items-center justify-center hover:bg-rose-50 disabled:opacity-30 transition-colors"
                      >✕</button>
                    </div>
                  </div>

                  {/* 下段: 画像設定（PC用／スマホ用） */}
                  <div className="mt-2 pl-7 space-y-2">
                    {/* PC用 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-400 w-12 flex-shrink-0 leading-tight">PC用</span>
                      {item.imageUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.imageUrl} alt="PC用スライダー画像" className="w-16 h-10 object-cover rounded-lg border border-pink-100" />
                          <button onClick={() => triggerImageUpload(item.id, 'pc')} disabled={saving} className="text-[10px] text-pink-500 font-semibold border border-pink-200 rounded-lg px-2.5 py-1 hover:bg-pink-50 disabled:opacity-40 transition-colors">変更</button>
                          <button onClick={() => handleDeleteImage(item, 'pc')} disabled={saving} className="text-[10px] text-rose-400 font-semibold border border-rose-100 rounded-lg px-2.5 py-1 hover:bg-rose-50 disabled:opacity-40 transition-colors">画像を削除</button>
                        </>
                      ) : (
                        <button onClick={() => triggerImageUpload(item.id, 'pc')} disabled={saving} className="text-[10px] text-slate-500 font-semibold border border-dashed border-slate-300 rounded-lg px-3 py-1.5 hover:border-pink-300 hover:text-pink-500 disabled:opacity-40 transition-colors">📷 画像をアップロード</button>
                      )}
                    </div>
                    {/* スマホ用（任意） */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-400 w-12 flex-shrink-0 leading-tight">スマホ用<br />（任意）</span>
                      {item.mobileImageUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.mobileImageUrl} alt="スマホ用スライダー画像" className="w-16 h-10 object-cover rounded-lg border border-pink-100" />
                          <button onClick={() => triggerImageUpload(item.id, 'sp')} disabled={saving} className="text-[10px] text-pink-500 font-semibold border border-pink-200 rounded-lg px-2.5 py-1 hover:bg-pink-50 disabled:opacity-40 transition-colors">変更</button>
                          <button onClick={() => handleDeleteImage(item, 'sp')} disabled={saving} className="text-[10px] text-rose-400 font-semibold border border-rose-100 rounded-lg px-2.5 py-1 hover:bg-rose-50 disabled:opacity-40 transition-colors">画像を削除</button>
                        </>
                      ) : (
                        <button onClick={() => triggerImageUpload(item.id, 'sp')} disabled={saving} className="text-[10px] text-slate-500 font-semibold border border-dashed border-slate-300 rounded-lg px-3 py-1.5 hover:border-pink-300 hover:text-pink-500 disabled:opacity-40 transition-colors">📷 スマホ用をアップロード</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 追加フォーム */}
          {items.length < MAX_FEATURED ? (
            <div className="flex gap-2">
              <select
                value={selectedSalonId}
                onChange={e => setSelectedSalonId(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
              >
                <option value="">店舗を選択...</option>
                {availableSalons.map(s => (
                  <option key={s.id} value={s.id}>{s.name}（{areaLabel(s.area)}）</option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                disabled={selectedSalonId === '' || saving}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {saving ? '...' : '追加'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2 border border-dashed border-slate-200 rounded-xl">
              最大{MAX_FEATURED}件まで登録可能です。削除してから追加してください。
            </p>
          )}
        </>
      )}
    </div>
  );
}
