'use client';

// /salons（掲載店舗一覧）の「無料掲載枠」テキスト行の管理（店名・地域・電話番号のみ）。
// free_salon_listings テーブルへ直接 CRUD する（RLS: admin_all_free_salon_listings＝ADMIN_UUID のみ書込可）。
// /salons はリクエスト毎レンダリング（cookie 読取クライアント）のため revalidate 配線は不要＝保存後すぐ反映。

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { AREA_ORDER, ALL_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

type Row = {
  id: string;
  name: string;
  area: string;
  phone: string;
  website: string; // 公式ホームページURL（任意・/salons の2行目右カラムに表示）
  displayOrder: number;
  isActive: boolean;
};

// 手入力行の地域選択肢（「福岡全域」センチネルは除外）。
const AREA_CHOICES = AREA_ORDER.filter((a) => a !== ALL_AREA);

export default function FreeSalonListingsManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // 追加フォーム
  const [name, setName] = useState('');
  const [area, setArea] = useState<string>(AREA_CHOICES[0]);
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  // 行内編集
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWebsite, setEditWebsite] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('free_salon_listings')
      .select('id, name, area, phone, website_url, display_order, is_active')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      setErrorMsg('free_salon_listings テーブルが見つかりません。先に SQL マイグレーション（20260722_free_salon_listings.sql）を実行してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setRows(
      (data ?? []).map((r) => ({
        id: r.id as string,
        name: (r.name as string) ?? '',
        area: (r.area as string) ?? '',
        phone: (r.phone as string) ?? '',
        website: (r.website_url as string) ?? '',
        displayOrder: (r.display_order as number) ?? 0,
        isActive: (r.is_active as boolean) ?? true,
      })),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) { onToast('店名を入力してください'); return; }
    setBusy(true);
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.displayOrder), 0);
    const { error } = await supabase.from('free_salon_listings').insert({
      name: trimmed, area, phone: phone.trim(), website_url: website.trim(), display_order: maxOrder + 1,
    });
    setBusy(false);
    if (error) { onToast(`追加に失敗しました: ${error.message}`); return; }
    setName(''); setPhone(''); setWebsite('');
    onToast('無料掲載枠に追加しました');
    fetchRows();
  };

  const startEdit = (r: Row) => {
    setEditId(r.id);
    setEditName(r.name);
    setEditArea(r.area || AREA_CHOICES[0]);
    setEditPhone(r.phone);
    setEditWebsite(r.website);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const trimmed = editName.trim();
    if (!trimmed) { onToast('店名を入力してください'); return; }
    setBusy(true);
    const { error } = await supabase
      .from('free_salon_listings')
      .update({ name: trimmed, area: editArea, phone: editPhone.trim(), website_url: editWebsite.trim() })
      .eq('id', editId);
    setBusy(false);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    setEditId(null);
    onToast('保存しました');
    fetchRows();
  };

  const toggleActive = async (r: Row) => {
    setBusy(true);
    const { error } = await supabase
      .from('free_salon_listings')
      .update({ is_active: !r.isActive })
      .eq('id', r.id);
    setBusy(false);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: !r.isActive } : x)));
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`「${r.name}」を削除しますか？`)) return;
    setBusy(true);
    const { error } = await supabase.from('free_salon_listings').delete().eq('id', r.id);
    setBusy(false);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    onToast('削除しました');
    fetchRows();
  };

  // 表示順の入れ替え（隣の行と display_order をスワップ）。
  const move = async (idx: number, dir: -1 | 1) => {
    const a = rows[idx];
    const b = rows[idx + dir];
    if (!a || !b) return;
    setBusy(true);
    const [ra, rb] = await Promise.all([
      supabase.from('free_salon_listings').update({ display_order: b.displayOrder }).eq('id', a.id),
      supabase.from('free_salon_listings').update({ display_order: a.displayOrder }).eq('id', b.id),
    ]);
    setBusy(false);
    if (ra.error || rb.error) { onToast('並び替えに失敗しました'); return; }
    fetchRows();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        /salons（掲載店舗一覧）にテキストのみ（店名・地域・電話番号）で載せる無料掲載枠です。
        掲載中サロンは自動で /salons に表示されるため、ここへの登録は不要です。
      </p>

      {errorMsg && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorMsg}</p>
      )}

      {/* 追加フォーム */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="店名（必須）"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          >
            {AREA_CHOICES.map((a) => (
              <option key={a} value={a}>{areaLabel(a)}</option>
            ))}
          </select>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="電話番号（任意）"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="公式ホームページURL（任意・https://〜）"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="px-4 py-2 rounded-full bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 transition-colors disabled:opacity-50"
        >
          追加する
        </button>
      </div>

      {/* 一覧 */}
      {loading ? (
        <p className="text-sm text-slate-400">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">無料掲載枠はまだありません</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white">
          {rows.map((r, i) => (
            <li key={r.id} className={`p-3 ${r.isActive ? '' : 'opacity-50'}`}>
              {editId === r.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                    />
                    <select
                      value={editArea}
                      onChange={(e) => setEditArea(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm bg-white"
                    >
                      {AREA_CHOICES.map((a) => (
                        <option key={a} value={a}>{areaLabel(a)}</option>
                      ))}
                    </select>
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="電話番号"
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                    />
                    <input
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      placeholder="公式ホームページURL"
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEdit} disabled={busy} className="px-3 py-1.5 rounded-full bg-pink-500 text-white text-xs font-bold disabled:opacity-50">保存</button>
                    <button type="button" onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-500">キャンセル</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold text-sm text-slate-800">{r.name}</span>
                  <span className="text-xs text-slate-500">{areaLabel(r.area) || '—'}</span>
                  <span className="text-xs text-slate-500">{r.phone || '—'}</span>
                  <span className="text-xs text-slate-400">{r.website ? '公式HPあり' : '公式HPなし'}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} className="w-7 h-7 rounded-full border border-slate-200 text-xs text-slate-500 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={busy || i === rows.length - 1} className="w-7 h-7 rounded-full border border-slate-200 text-xs text-slate-500 disabled:opacity-30">↓</button>
                    <button
                      type="button"
                      onClick={() => toggleActive(r)}
                      disabled={busy}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${r.isActive ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : 'border-slate-200 text-slate-400'}`}
                    >
                      {r.isActive ? '表示中' : '非表示'}
                    </button>
                    <button type="button" onClick={() => startEdit(r)} className="px-2.5 py-1 rounded-full border border-slate-200 text-xs font-bold text-slate-500">編集</button>
                    <button type="button" onClick={() => remove(r)} disabled={busy} className="px-2.5 py-1 rounded-full border border-red-100 text-xs font-bold text-red-400">削除</button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
