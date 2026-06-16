'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';

const MAX_FEATURED = 5;

type FeaturedItem = {
  id:           string;
  salonId:      number;
  salonName:    string;
  salonArea:    string;
  displayOrder: number;
};

type SalonOption = {
  id:   number;
  name: string;
  area: string;
};

export default function FeaturedSalonsManager({ allSalons }: { allSalons: SalonOption[] }) {
  const supabase = createClient();
  const [items,            setItems]           = useState<FeaturedItem[]>([]);
  const [selectedSalonId,  setSelectedSalonId] = useState<number | ''>('');
  const [loading,          setLoading]         = useState(true);
  const [saving,           setSaving]          = useState(false);
  const [errorMsg,         setErrorMsg]        = useState('');

  const fetchFeatured = useCallback(async () => {
    const sb = createClient();

    const { data: featuredData, error } = await sb
      .from('featured_salons')
      .select('id, salon_id, display_order')
      .order('display_order', { ascending: true });

    if (error) {
      setErrorMsg('テーブルがまだ作成されていない可能性があります。SQLマイグレーションを実行してください。');
      setLoading(false);
      return;
    }

    const rows = featuredData ?? [];

    // salon_id からサロン名を直接取得
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
      displayOrder: row.display_order as number,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchFeatured(); }, [fetchFeatured]);

  const handleAdd = async () => {
    if (selectedSalonId === '' || items.length >= MAX_FEATURED) return;
    const nextOrder = items.length + 1;
    setSaving(true);
    const { error } = await supabase.from('featured_salons').insert({
      salon_id:      selectedSalonId,
      display_order: nextOrder,
    });
    setSaving(false);
    if (!error) {
      setSelectedSalonId('');
      await fetchFeatured();
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    await supabase.from('featured_salons').delete().eq('id', id);
    setSaving(false);
    await fetchFeatured();
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    // Swap in array, then re-sequence all display_orders
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
  };

  const featuredIds   = new Set(items.map(i => i.salonId));
  const availableSalons = allSalons.filter(s => !featuredIds.has(s.id));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-black text-slate-700">ピックアップサロン設定</h2>
        <span className="text-xs text-slate-400">{items.length} / {MAX_FEATURED}件</span>
      </div>

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
              ピックアップサロンが未設定です
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-pink-50/40 rounded-2xl px-4 py-3 border border-pink-100/70"
                >
                  <span className="text-xs font-black text-pink-400 w-4 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{item.salonName}</p>
                    <p className="text-[10px] text-slate-400">{item.salonArea}</p>
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
                <option value="">サロンを選択...</option>
                {availableSalons.map(s => (
                  <option key={s.id} value={s.id}>{s.name}（{s.area}）</option>
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
