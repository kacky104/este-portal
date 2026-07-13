'use client';

// 求人カード「優先表示」設定（リンクバナー設置特典・求人版）。
// job_boost=true にした求人は、フクエスワークの求人一覧（/jobs・エリア・エリア×タグ・タグ・出張）の
// 「30分ごとランダム表示」で一覧の上側（半数より上）に来やすくなる（src/app/lib/shuffleJobs の重み付きシャッフル）。
// 読み書きはサーバーアクション（adminListJobBoosts / adminSetJobBoost）経由＝admin判定＋RLS。
// 保存成功時はサーバーアクション側で公開側ISR（/jobs 系）を revalidate 済み。

import { useState, useEffect, useCallback } from 'react';
import { adminListJobBoosts, adminSetJobBoost, type JobBoostRow } from '@/app/actions/jobs';

export default function JobBoostManager({ onToast }: { onToast: (msg: string) => void }) {
  const [rows, setRows] = useState<JobBoostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const res = await adminListJobBoosts();
    if (!res.ok) {
      setErrorMsg(res.error);
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setRows(res.jobs);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const toggle = async (row: JobBoostRow) => {
    const next = !row.jobBoost;
    setSavingId(row.id);
    const res = await adminSetJobBoost(row.id, next);
    setSavingId(null);
    if (!res.ok) {
      onToast(`更新に失敗しました: ${res.error}`);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, jobBoost: next } : r)));
    onToast(next ? `「${row.title}」を優先表示に設定しました` : `「${row.title}」の優先表示を解除しました`);
  };

  const boostedCount = rows.filter((r) => r.jobBoost).length;
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) => r.title.toLowerCase().includes(q) || r.salonName.toLowerCase().includes(q),
  );

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500 leading-relaxed mb-3">
        リンクバナー設置特典（求人版）の設定です。オンにした求人は、フクエスワークの求人一覧（30分ごとランダム表示）で
        <span className="font-bold text-emerald-600">一覧の上側（半数より上）に来やすく</span>なります。
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
              placeholder="求人タイトル・店舗名で検索"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-emerald-300"
            />
            <span className="flex-shrink-0 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              優先表示 {boostedCount}件
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">読み込み中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">該当する求人がありません</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {filtered.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {row.title || '（無題）'}
                      {!row.isActive && <span className="ml-2 text-[10px] text-slate-400 font-normal">非公開</span>}
                      {row.salonHidden && <span className="ml-2 text-[10px] text-slate-400 font-normal">店舗非表示中</span>}
                    </p>
                    {row.salonName && <p className="text-[11px] text-slate-400 truncate">{row.salonName}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(row)}
                    disabled={savingId === row.id}
                    aria-pressed={row.jobBoost}
                    className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      row.jobBoost ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        row.jobBoost ? 'translate-x-5' : 'translate-x-0.5'
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
