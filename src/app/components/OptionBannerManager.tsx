'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 「オプションバナー」商品（option_banners）管理。authenticated クライアント直（RLSで admin UUID のみ許可）。
// /mypage「運営から」タブの「オプション申込」サブタブに、公開中（is_active=true）の商品が表示順で並ぶ。
// オーナーは各商品の「申込」ボタンから運営へ申込（owner_inquiries）を送るだけで、ここは商品の登録・編集のみ。
// 画像は持たず、商品名・説明・価格（円・整数／null＝「応相談」）・表示順・公開フラグのみ。
// 各行の編集はドラフトstate＋「保存」で確定（更新は該当列のみ送る＝undefinedオーバーライドガード遵守）。

type Product = {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  stock: number | null;
  display_order: number;
  is_active: boolean;
};

export default function OptionBannerManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // 追加フォーム
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addStock, setAddStock] = useState('');
  // 各行の編集ドラフト（「保存」で確定）
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string; price: string; stock: string }>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('option_banners')
      .select('id, title, description, price, stock, display_order, is_active')
      .order('display_order', { ascending: true });
    if (error) {
      setErrorMsg('option_banners テーブルの読み込みに失敗しました。マイグレーションを適用したか確認してください。');
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Product[];
    setErrorMsg('');
    setItems(list);
    setDrafts(Object.fromEntries(list.map((p) => [p.id, {
      title: p.title,
      description: p.description ?? '',
      price: p.price == null ? '' : String(p.price),
      stock: p.stock == null ? '' : String(p.stock),
    }])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 価格入力（文字列）を integer|null に正規化。空＝null（応相談）。数字以外は除去。
  const parsePrice = (s: string): number | null => {
    const digits = s.replace(/[^0-9]/g, '');
    return digits === '' ? null : Number(digits);
  };

  const handleAdd = async () => {
    const title = addTitle.trim();
    if (title === '') { onToast('商品名を入力してください'); return; }
    setBusy(true);
    const nextOrder = items.reduce((m, p) => Math.max(m, p.display_order), 0) + 1;
    const { error } = await supabase.from('option_banners').insert({
      title,
      description: addDesc.trim() || null,
      price: parsePrice(addPrice),
      stock: parsePrice(addStock),
      display_order: nextOrder,
      is_active: true,
    });
    setBusy(false);
    if (error) {
      onToast(error.code === '42501'
        ? 'RLSにより追加が拒否されました。admin権限でログインしているか確認してください。'
        : `追加に失敗しました: ${error.message}`);
      return;
    }
    setAddTitle(''); setAddDesc(''); setAddPrice(''); setAddStock('');
    await fetchList();
    onToast('オプション商品を追加しました');
  };

  const handleSave = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    const title = d.title.trim();
    if (title === '') { onToast('商品名を入力してください'); return; }
    const description = d.description.trim() || null;
    const price = parsePrice(d.price);
    const stock = parsePrice(d.stock);
    setBusy(true);
    const { error } = await supabase
      .from('option_banners')
      .update({ title, description, price, stock, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, title, description, price, stock } : p)));
    onToast('保存しました');
  };

  const handleToggleActive = async (id: string) => {
    const target = items.find((p) => p.id === id);
    if (!target) return;
    const next = !target.is_active;
    setBusy(true);
    const { error } = await supabase
      .from('option_banners')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`変更に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: next } : p)));
    onToast(next ? '公開にしました' : '非公開にしました');
  };

  // 並び替え（↑↓）：隣の行と display_order を入れ替え。
  const handleMove = async (id: string, dir: 'up' | 'down') => {
    const idx = items.findIndex((p) => p.id === id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx];
    const b = items[swapIdx];
    setBusy(true);
    const [r1, r2] = await Promise.all([
      supabase.from('option_banners').update({ display_order: b.display_order, updated_at: new Date().toISOString() }).eq('id', a.id),
      supabase.from('option_banners').update({ display_order: a.display_order, updated_at: new Date().toISOString() }).eq('id', b.id),
    ]);
    setBusy(false);
    if (r1.error || r2.error) { onToast(`並び替えに失敗しました: ${(r1.error ?? r2.error)?.message}`); await fetchList(); return; }
    await fetchList();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('このオプション商品を削除しますか？\nこの操作は取り消せません。')) return;
    setBusy(true);
    const { data: deleted, error } = await supabase.from('option_banners').delete().eq('id', id).select('id');
    setBusy(false);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) { onToast('削除できませんでした（権限エラーの可能性があります）'); return; }
    setItems((prev) => prev.filter((p) => p.id !== id));
    onToast('オプション商品を削除しました');
  };

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
        /mypage「運営から」→「オプション申込」に、公開中の商品が表示順で並びます。オーナーは各商品の「申込」ボタンから運営へ申込（お問い合わせとして届きます）。価格は円で入力（空欄なら「応相談」と表示）。
      </p>

      {/* 追加フォーム */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4 mb-4 space-y-2">
        <input className={inputClass} placeholder="商品名（例: トップバナー掲載）" value={addTitle} maxLength={100} onChange={(e) => setAddTitle(e.target.value)} />
        <textarea className={inputClass} placeholder="説明（任意）" value={addDesc} maxLength={1000} rows={2} onChange={(e) => setAddDesc(e.target.value)} />
        <input className={inputClass} placeholder="残り枠数（空欄=枠表示なし／0=売り切れ）" value={addStock} inputMode="numeric" onChange={(e) => setAddStock(e.target.value)} />
        <div className="flex gap-2">
          <input className={`flex-1 min-w-0 ${inputClass}`} placeholder="価格（円・数字のみ／空欄=応相談）" value={addPrice} inputMode="numeric" onChange={(e) => setAddPrice(e.target.value)} />
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy || addTitle.trim() === ''}
            className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            ＋ 追加
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          オプション商品がありません。上のフォームから追加してください。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p, i) => {
            const d = drafts[p.id] ?? { title: p.title, description: p.description ?? '', price: p.price == null ? '' : String(p.price), stock: p.stock == null ? '' : String(p.stock) };
            return (
              <div key={p.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                    {p.is_active ? '公開中' : '非公開'}
                  </span>
                  <span className="text-[10px] text-slate-400">表示順 {p.display_order}</span>
                  <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => handleMove(p.id, 'up')} disabled={busy || i === 0} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-100 disabled:opacity-30" aria-label="上へ">↑</button>
                    <button onClick={() => handleMove(p.id, 'down')} disabled={busy || i === items.length - 1} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-100 disabled:opacity-30" aria-label="下へ">↓</button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">商品名</label>
                  <input className={inputClass} value={d.title} maxLength={100} onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: { ...d, title: e.target.value } }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">説明（任意）</label>
                  <textarea className={inputClass} value={d.description} maxLength={1000} rows={2} onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: { ...d, description: e.target.value } }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">価格（円・空欄=応相談）</label>
                  <input className={inputClass} value={d.price} inputMode="numeric" onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: { ...d, price: e.target.value } }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">残り枠数（空欄=枠表示なし／0=売り切れ）</label>
                  <input className={inputClass} value={d.stock} inputMode="numeric" onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: { ...d, stock: e.target.value } }))} />
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button onClick={() => handleSave(p.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity">保存</button>
                  <button onClick={() => handleToggleActive(p.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors">{p.is_active ? '非公開にする' : '公開にする'}</button>
                  <button onClick={() => handleDelete(p.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 transition-colors ml-auto">削除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
