'use client';

import { useEffect, useState } from 'react';
import { getJobApplications, updateApplicationStatus, deleteApplication, type JobApplication } from '@/app/actions/jobs';

// mypage 求人タブ内の「応募一覧」セクション。予約カードの作法を踏襲
// （service_role 取得はサーバーアクション側・ここは表示と操作のみ）。

// 応募日時を JST の "M/D(曜) HH:MM" に整形。
function formatAppliedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const md = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(d);
  const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${md}(${wd}) ${hm}`;
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'contacted':
      return { label: '連絡済み', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
    case 'closed':
      return { label: 'クローズ', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
    default:
      return { label: '新規', cls: 'bg-pink-50 text-pink-600 border-pink-200' };
  }
}

export function JobApplications({ salonId }: { salonId: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getJobApplications(salonId)
      .then((res) => {
        if (!alive) return;
        if (!res.ok) setError(res.error);
        else setApps(res.applications);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [salonId]);

  const handleStatus = async (id: string, next: 'new' | 'contacted' | 'closed') => {
    setBusyId(id);
    const res = await updateApplicationStatus(id, next);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? '更新に失敗しました');
      return;
    }
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この応募を削除しますか？\nこの操作は取り消せません。')) return;
    setBusyId(id);
    const res = await deleteApplication(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? '削除に失敗しました');
      return;
    }
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700">応募一覧</h2>
        <span className="text-[11px] text-slate-400">{apps.length}件</span>
      </div>

      {error ? (
        <p className="text-xs text-rose-600">応募一覧でエラー：{error}</p>
      ) : loading ? (
        <p className="text-xs text-slate-400">読み込み中です…</p>
      ) : apps.length === 0 ? (
        <p className="text-xs text-slate-400">まだ応募はありません。</p>
      ) : (
        <ul className="space-y-2.5">
          {apps.map((a) => {
            const st = statusBadge(a.status);
            const busy = busyId === a.id;
            return (
              <li key={a.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-800 text-sm break-words">{a.name}</span>
                    {a.age != null && <span className="text-xs text-slate-400">{a.age}歳</span>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0">{formatAppliedAt(a.createdAt)}</span>
                </div>

                <a href={`tel:${a.tel}`} className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: '#059669' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  {a.tel}
                </a>

                {a.note && (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap break-words bg-white rounded-lg border border-slate-100 p-2.5">{a.note}</p>
                )}

                {/* 操作（予約カードの作法：現在ステータスに応じて選択肢を出し分け） */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {a.status === 'new' && (
                    <button onClick={() => handleStatus(a.id, 'contacted')} disabled={busy} className="text-[11px] font-bold px-3 py-1 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                      連絡済みにする
                    </button>
                  )}
                  {(a.status === 'new' || a.status === 'contacted') && (
                    <button onClick={() => handleStatus(a.id, 'closed')} disabled={busy} className="text-[11px] font-bold px-3 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50">
                      クローズ
                    </button>
                  )}
                  {a.status === 'closed' && (
                    <button onClick={() => handleStatus(a.id, 'new')} disabled={busy} className="text-[11px] font-bold px-3 py-1 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 transition-colors disabled:opacity-50">
                      新規に戻す
                    </button>
                  )}
                  <button onClick={() => handleDelete(a.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-50">
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
