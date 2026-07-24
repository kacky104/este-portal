'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJobApplicationStats } from '@/app/actions/workMatch';
import type { SalonAppStat } from '@/app/lib/workMatch';

// /admin「求人」タブの「フクエスワーク応募状況」テーブル。
// どのお店にフクエスワーク経由の応募が何件来ているか（＝どこが少ないか）を常時確認できる集計表。
// 掲載中（jobs_enabled）の店は応募0件でも必ず行を出す。並び替えは 応募少ない順（既定）⇔多い順、
// 補助情報として 直近30日・未対応（status='new'）・最新応募日・公開中求人本数 を出す。
// データ取得はサーバーアクション（fetchJobApplicationStats・運営のみ）。
type SortOrder = 'asc' | 'desc';

function formatDateJST(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
  }).format(d);
}

export default function WorkAppStats() {
  const [stats, setStats] = useState<SalonAppStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [order, setOrder] = useState<SortOrder>('asc'); // 既定＝応募が少ない順（斡旋優先の把握が目的）

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchJobApplicationStats();
    if (!res.ok) {
      setErrorMsg(res.error);
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setStats(res.stats);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) =>
      a.total !== b.total
        ? (order === 'asc' ? a.total - b.total : b.total - a.total)
        : a.salonName.localeCompare(b.salonName, 'ja'),
    );
    return arr;
  }, [stats, order]);

  const totalApps = stats.reduce((n, s) => n + s.total, 0);
  const totalNew = stats.reduce((n, s) => n + s.newCount, 0);
  const zeroCount = stats.filter((s) => s.total === 0).length;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <p className="text-[11px] text-slate-400 leading-relaxed flex-1 min-w-[220px]">
          フクエスワーク経由の応募（求人ページの応募フォーム）が、どのお店に何件来ているかの集計です。掲載中のお店は応募0件でも表示されます。求職マッチングのご案内先を考える際の参考にどうぞ。
        </p>
        <button
          onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
        >
          {order === 'asc' ? '↑ 応募が少ない順' : '↓ 応募が多い順'}
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-40 transition-colors"
        >
          ↻ 更新
        </button>
      </div>

      {/* サマリー */}
      {!loading && !errorMsg && (
        <div className="flex items-center gap-2 flex-wrap mb-3 text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold">応募合計 {totalApps}件</span>
          {totalNew > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-pink-50 text-pink-600 border border-pink-100 font-bold">未対応 {totalNew}件</span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-bold">応募0件のお店 {zeroCount}店</span>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          掲載中（求人利用ON）のお店がまだありません。
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left" style={{ minWidth: '560px' }}>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2 pr-3 text-[10px] font-bold text-slate-400">店舗</th>
                <th className="py-2 pr-3 text-[10px] font-bold text-slate-400">エリア</th>
                <th className="py-2 pr-3 text-[10px] font-bold text-slate-400 text-right">応募合計</th>
                <th className="py-2 pr-3 text-[10px] font-bold text-slate-400 text-right">直近30日</th>
                <th className="py-2 pr-3 text-[10px] font-bold text-slate-400 text-right">未対応</th>
                <th className="py-2 pr-3 text-[10px] font-bold text-slate-400">最新応募</th>
                <th className="py-2 text-[10px] font-bold text-slate-400 text-right">公開求人</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.salonId} className={`border-b border-slate-50 ${s.total === 0 ? 'bg-amber-50/40' : ''}`}>
                  <td className="py-2 pr-3">
                    <a href={`/salon/${s.salonId}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-700 hover:text-emerald-600 transition-colors">
                      {s.salonName}
                    </a>
                    {s.isHidden && (
                      <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200 align-middle">非表示中</span>
                    )}
                    {s.activeJobs === 0 && (
                      <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-400 border border-rose-100 align-middle">求人未公開</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-[11px] text-slate-500 whitespace-nowrap">{s.area || '—'}</td>
                  <td className={`py-2 pr-3 text-right text-xs font-black ${s.total === 0 ? 'text-amber-500' : 'text-slate-700'}`}>{s.total}</td>
                  <td className="py-2 pr-3 text-right text-[11px] text-slate-500">{s.last30d}</td>
                  <td className="py-2 pr-3 text-right text-[11px]">
                    {s.newCount > 0 ? <span className="font-black text-pink-500">{s.newCount}</span> : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="py-2 pr-3 text-[11px] text-slate-500 whitespace-nowrap">{formatDateJST(s.latestAt)}</td>
                  <td className="py-2 text-right text-[11px] text-slate-500">{s.activeJobs}本</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
