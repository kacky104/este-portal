'use client';

// サロンカード「優先表示」設定（リンクバナー設置特典）。
// card_boost=true にしたサロンは、トップ／地域ページのカード「30分ごとランダム表示」で
// 一覧の上側（半数より上）に来やすくなる（src/lib/shuffle の重み付きシャッフル）。
// 更新は salons テーブルへの直接 UPDATE（RLS: salons_update_admin＝ADMIN_UUID のみ）。
// 保存後は revalidateTopAndAreas() でトップ／全エリアの ISR を即時更新する。

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { areaLabel } from '@/app/lib/areaLabel';

type Row = {
  id: number;
  name: string;
  area: string;
  cardBoost: boolean;
  isHidden: boolean;
};

export default function CardBoostManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('salons')
      .select('id, name, area, card_boost, is_hidden')
      .order('name', { ascending: true });
    if (error) {
      // card_boost 列が無い＝マイグレーション未適用の可能性。
      setErrorMsg('card_boost 列が見つかりません。先に SQL マイグレーション（20260713_salons_card_boost.sql）を実行してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setRows(
      (data ?? []).map((r) => ({
        id: r.id as number,
        name: (r.name as string) ?? '',
        area: (r.area as string) ?? '',
        cardBoost: (r.card_boost as boolean) ?? false,
        isHidden: (r.is_hidden as boolean) ?? false,
      })),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const toggle = async (row: Row) => {
    const next = !row.cardBoost;
    setSavingId(row.id);
    const { error } = await supabase.from('salons').update({ card_boost: next }).eq('id', row.id);
    setSavingId(null);
    if (error) {
      onToast(`更新に失敗しました: ${error.message}`);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, cardBoost: next } : r)));
    // 公開側（トップ・全エリア）の ISR を即時更新して反映のズレを防ぐ。
    revalidateTopAndAreas();
    onToast(next ? `「${row.name}」を優先表示に設定しました` : `「${row.name}」の優先表示を解除しました`);
  };

  const boostedCount = rows.filter((r) => r.cardBoost).length;
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500 leading-relaxed mb-3">
        リンクバナー設置特典の設定です。オンにしたサロンは、トップ・地域ページのサロンカード（30分ごとランダム表示）で
        <span className="font-bold text-pink-600">一覧の上側（半数より上）に来やすく</span>なります。
        順位を固定するものではなく、当たりやすさが上がる仕組みです。設置をやめた店舗はオフに戻してください。
      </p>

      {errorMsg ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMsg}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="店舗名で検索"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-pink-300"
            />
            <span className="flex-shrink-0 text-xs font-bold text-pink-600 bg-pink-50 border border-pink-200 rounded-full px-3 py-1">
              優先表示 {boostedCount}店
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">読み込み中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">該当する店舗がありません</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {filtered.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {row.name || '（無名）'}
                      {row.isHidden && <span className="ml-2 text-[10px] text-slate-400 font-normal">非表示中</span>}
                    </p>
                    {row.area && <p className="text-[11px] text-slate-400">{areaLabel(row.area)}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(row)}
                    disabled={savingId === row.id}
                    aria-pressed={row.cardBoost}
                    className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      row.cardBoost ? 'bg-pink-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        row.cardBoost ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
