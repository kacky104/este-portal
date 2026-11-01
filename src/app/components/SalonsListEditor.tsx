'use client';

// ★ 第1710便（2026-11-01）: /admin「無料掲載」セクションの「店舗」タブ。
// /salons（掲載店舗一覧）に自動で載る店舗（salons テーブル）を、/salons に出る項目だけ編集する：
//   店名・地域・電話番号・公式ホームページURL・表示/非表示（is_hidden）。
// 有料プラン（listing_plan='standard'）と店舗カード無料枠（listing_plan='free'）をサブタブで分ける。
// 保存後は /salons（ISR 10分）と店舗詳細ページを revalidate する。

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { AREA_ORDER, ALL_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { revalidateSalonsList, revalidateSalon } from '@/app/lib/revalidateTop';

type Row = {
  id: number;
  name: string;
  area: string;
  phone: string;
  officialUrl: string;
  isHidden: boolean;
  listingPlan: 'standard' | 'free' | null;
};

const AREA_CHOICES = AREA_ORDER.filter((a) => a !== ALL_AREA);

// 地域の表示順（/salons と同じ）→ 店名順。
const areaIndex = (a: string) => {
  const i = (AREA_ORDER as readonly string[]).indexOf(a);
  return i < 0 ? AREA_ORDER.length : i;
};

export default function SalonsListEditor({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<'standard' | 'free'>('standard');

  // 行内編集
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('salons')
      .select('id, name, area, phone, official_url, is_hidden, listing_plan')
      .order('id');
    if (error) {
      onToast(`店舗の読み込みに失敗しました: ${error.message}`);
      setLoading(false);
      return;
    }
    setRows(
      (data ?? []).map((r) => ({
        id: r.id as number,
        name: (r.name as string) ?? '',
        area: (r.area as string) ?? '',
        phone: (r.phone as string) ?? '',
        officialUrl: (r.official_url as string) ?? '',
        isHidden: !!r.is_hidden,
        listingPlan: (r.listing_plan as Row['listingPlan']) ?? null,
      })),
    );
    setLoading(false);
  }, [supabase, onToast]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // listing_plan が null の店舗は有料プラン扱い（第368便より前に登録した店舗）。
  const shown = useMemo(
    () =>
      rows
        .filter((r) => (plan === 'free' ? r.listingPlan === 'free' : r.listingPlan !== 'free'))
        .sort((a, b) => {
          const ai = areaIndex(a.area);
          const bi = areaIndex(b.area);
          if (ai !== bi) return ai - bi;
          return a.name.localeCompare(b.name, 'ja');
        }),
    [rows, plan],
  );
  const countStandard = rows.filter((r) => r.listingPlan !== 'free').length;
  const countFree = rows.length - countStandard;

  const startEdit = (r: Row) => {
    setEditId(r.id);
    setEditName(r.name);
    setEditArea(r.area || AREA_CHOICES[0]);
    setEditPhone(r.phone);
    setEditUrl(r.officialUrl);
  };

  const saveEdit = async () => {
    if (editId == null) return;
    const trimmed = editName.trim();
    if (!trimmed) { onToast('店名を入力してください'); return; }
    const url = editUrl.trim();
    if (url && !/^https?:\/\//.test(url)) { onToast('公式ホームページURLは https:// から入力してください'); return; }
    setBusy(true);
    const { error } = await supabase
      .from('salons')
      .update({ name: trimmed, area: editArea, phone: editPhone.trim(), official_url: url || null })
      .eq('id', editId);
    setBusy(false);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    const id = editId;
    setEditId(null);
    void revalidateSalonsList();
    void revalidateSalon(id);
    onToast('保存しました');
    fetchRows();
  };

  const toggleHidden = async (r: Row) => {
    const next = !r.isHidden;
    if (next && !window.confirm(`「${r.name}」を非表示にしますか？（/salons・トップ・店舗ページから消えます）`)) return;
    setBusy(true);
    const { error } = await supabase.from('salons').update({ is_hidden: next }).eq('id', r.id);
    setBusy(false);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, isHidden: next } : x)));
    void revalidateSalonsList();
    void revalidateSalon(r.id);
    onToast(next ? '非表示にしました' : '表示に戻しました');
  };

  const tabBtn = (key: 'standard' | 'free', label: string, count: number) => (
    <button
      type="button"
      onClick={() => { setPlan(key); setEditId(null); }}
      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
        plan === key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
      <span className={`ml-1.5 px-1.5 rounded-full text-[10px] ${plan === key ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        /salons（掲載店舗一覧）に自動で載る店舗です。ここで直せるのは /salons に出る項目（店名・地域・電話番号・公式HP）と表示/非表示だけです。
        その他の項目は「掲載店舗一覧」から編集してください。
      </p>

      <div className="flex items-center gap-2">
        {tabBtn('standard', '有料プラン', countStandard)}
        {tabBtn('free', '店舗カード（無料枠）', countFree)}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">読み込み中…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-400">該当する店舗はありません</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white">
          {shown.map((r) => (
            <li key={r.id} className={`p-3 ${r.isHidden ? 'opacity-50' : ''}`}>
              {editId === r.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="店名"
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
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="公式ホームページURL（https://〜）"
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
                  <a href={`/salon/${r.id}`} target="_blank" rel="noopener" className="font-bold text-sm text-slate-800 hover:text-pink-600 hover:underline">
                    {r.name}
                  </a>
                  <span className="text-xs text-slate-500">{areaLabel(r.area) || '—'}</span>
                  <span className="text-xs text-slate-500">{r.phone || '—'}</span>
                  <span className="text-xs text-slate-400">{r.officialUrl ? '公式HPあり' : '公式HPなし'}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleHidden(r)}
                      disabled={busy}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${r.isHidden ? 'border-slate-200 text-slate-400' : 'border-emerald-200 text-emerald-600 bg-emerald-50'}`}
                    >
                      {r.isHidden ? '非表示' : '表示中'}
                    </button>
                    <button type="button" onClick={() => startEdit(r)} className="px-2.5 py-1 rounded-full border border-slate-200 text-xs font-bold text-slate-500">編集</button>
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
