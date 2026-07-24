'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { suggestStoresForEntry } from '@/app/actions/workMatch';
import { EXPERIENCE_LABEL, PICKUP_LABEL, type SuggestedStore } from '@/app/lib/workMatch';
import { featureLabel } from '@/app/lib/jobs';

// /admin「店舗管理」タブの「求職マッチング エントリー」一覧（work_match_entries）。
// /jobs/matching の公開フォームから送られた求職エントリーを、掲載お問い合わせと同じ作法で管理する
// （未対応を先頭・未対応⇔対応済みトグル・削除）。RLS: 運営のみ全操作可。
// 各エントリーで「条件に合う店舗を提案」を押すと、希望エリアで絞りつつ“応募が少ない掲載店”を
// 上位に並べた候補（suggestStoresForEntry）を表示。運営が上位3店ほどを選んで本人に連絡・斡旋する。
type WorkMatchEntry = {
  id: string;
  display_name: string | null;
  age: number;
  experience: 'none' | 'has';
  current_job: string | null;
  desired_areas: string[] | null;
  wants_pickup: 'want' | 'no' | 'either';
  desired_features: string[] | null;
  contact_phone: string | null;
  contact_line: string | null;
  contact_email: string | null;
  note: string | null;
  status: 'open' | 'done';
  created_at: string;
};

type SuggestState = { loading: boolean; error: string; stores: SuggestedStore[] | null };

function formatDateTimeJST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export default function WorkMatchManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [entries, setEntries] = useState<WorkMatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Record<string, SuggestState>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('work_match_entries')
      .select('id, display_name, age, experience, current_job, desired_areas, wants_pickup, desired_features, contact_phone, contact_line, contact_email, note, status, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setErrorMsg('work_match_entries テーブルの読み込みに失敗しました。マイグレーションを適用したか確認してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setEntries((data ?? []) as WorkMatchEntry[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const toggleStatus = async (q: WorkMatchEntry) => {
    const next = q.status === 'open' ? 'done' : 'open';
    setBusyId(q.id);
    const { error } = await supabase.from('work_match_entries').update({ status: next }).eq('id', q.id);
    setBusyId(null);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    setEntries((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: next } : x)));
  };

  const deleteEntry = async (q: WorkMatchEntry) => {
    const who = q.display_name || `${q.age}歳の方`;
    if (!window.confirm(`「${who}」のエントリーを削除しますか？\nこの操作は取り消せません。`)) return;
    setBusyId(q.id);
    const { data: deleted, error } = await supabase.from('work_match_entries').delete().eq('id', q.id).select('id');
    setBusyId(null);
    if (error || !deleted || deleted.length === 0) {
      onToast(error ? `削除に失敗しました: ${error.message}` : '削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    setEntries((prev) => prev.filter((x) => x.id !== q.id));
    onToast('エントリーを削除しました');
  };

  const runSuggest = async (q: WorkMatchEntry) => {
    setSuggest((prev) => ({ ...prev, [q.id]: { loading: true, error: '', stores: prev[q.id]?.stores ?? null } }));
    const res = await suggestStoresForEntry(q.id);
    if (!res.ok) {
      setSuggest((prev) => ({ ...prev, [q.id]: { loading: false, error: res.error, stores: null } }));
      return;
    }
    setSuggest((prev) => ({ ...prev, [q.id]: { loading: false, error: '', stores: res.stores } }));
  };

  const openCount = entries.filter((q) => q.status === 'open').length;
  // 未対応を先頭に（同状態内は新着順のまま＝取得順を保持する安定ソート）。
  const sorted = [...entries].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));

  const contactLine = (q: WorkMatchEntry): string => {
    const parts: string[] = [];
    if (q.contact_phone) parts.push(`電話: ${q.contact_phone}`);
    if (q.contact_line) parts.push(`LINE: ${q.contact_line}`);
    if (q.contact_email) parts.push(`メール: ${q.contact_email}`);
    return parts.join('／') || '(連絡先なし)';
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          /jobs/matching（お仕事マッチング）のフォームから送られた求職エントリーの一覧です。「条件に合う店舗を提案」で、希望エリアに合う掲載店（応募が少ない店を優先）の候補が出ます。対応したら「対応済み」に切り替えてください。
        </p>
        {openCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-black leading-none">
            未対応{openCount}件
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          求職エントリーはまだありません。
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((q) => {
            const s = suggest[q.id];
            return (
              <div key={q.id} className={`rounded-xl border p-3 ${q.status === 'open' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100'}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] text-slate-400">{formatDateTimeJST(q.created_at)}</span>
                  {q.status === 'open' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">未対応</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">対応済み</span>
                  )}
                  <button
                    onClick={() => toggleStatus(q)}
                    disabled={busyId === q.id}
                    className="ml-auto flex-shrink-0 text-[11px] font-bold text-slate-400 hover:text-pink-600 disabled:opacity-40 transition-colors"
                  >
                    {busyId === q.id ? '更新中…' : q.status === 'open' ? '対応済みにする' : '未対応に戻す'}
                  </button>
                  <button
                    onClick={() => deleteEntry(q)}
                    disabled={busyId === q.id}
                    className="flex-shrink-0 text-[11px] font-bold text-rose-400 hover:text-rose-500 disabled:opacity-40 transition-colors"
                  >
                    削除
                  </button>
                </div>

                <p className="text-xs font-bold text-slate-700">
                  {q.display_name || '(お名前未記入)'}
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">{q.age}歳</span>
                  <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">{EXPERIENCE_LABEL[q.experience]}</span>
                  {q.current_job && <span className="ml-1 text-[10px] text-slate-400">／{q.current_job}</span>}
                </p>

                <p className="text-[11px] text-slate-500 mt-1">
                  希望エリア: {q.desired_areas && q.desired_areas.length > 0 ? q.desired_areas.join('、') : '（こだわらない）'}
                  <span className="ml-2">送迎: {PICKUP_LABEL[q.wants_pickup]}</span>
                </p>
                {q.desired_features && q.desired_features.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-0.5">希望条件: {q.desired_features.map(featureLabel).join('、')}</p>
                )}
                <p className="text-[11px] text-slate-600 mt-1 font-medium">{contactLine(q)}</p>
                {q.note && <p className="text-[11px] text-slate-500 whitespace-pre-wrap break-words mt-1 rounded-lg bg-slate-50 px-2 py-1.5">{q.note}</p>}

                {/* 斡旋支援：条件に合う店舗を提案 */}
                <div className="mt-2 pt-2 border-t border-dashed border-slate-200">
                  <button
                    onClick={() => runSuggest(q)}
                    disabled={s?.loading}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-500 disabled:opacity-40 transition-colors"
                  >
                    {s?.loading ? '提案を計算中…' : s?.stores ? '↻ 店舗提案を再計算' : '🐾 条件に合う店舗を提案する'}
                  </button>

                  {s?.error && <p className="text-[11px] text-rose-400 mt-1">⚠ {s.error}</p>}

                  {s?.stores && (
                    s.stores.length === 0 ? (
                      <p className="text-[11px] text-slate-400 mt-1">条件に合う掲載店舗が見つかりませんでした（希望エリアの掲載店が無い可能性があります）。</p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] text-slate-400">
                          応募が少ない掲載店を優先し、希望条件の一致が多い順に並べています。上位3店ほどをご案内候補にどうぞ。
                        </p>
                        {s.stores.map((st, i) => (
                          <div
                            key={st.jobId}
                            className={`rounded-lg border p-2 ${i < 3 ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100'}`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {i < 3 && <span className="text-[10px] font-black text-emerald-600">おすすめ{i + 1}</span>}
                              <span className="text-xs font-bold text-slate-700">{st.salonName}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white text-emerald-600 border border-emerald-200">{st.area}</span>
                              <span className="ml-auto text-[10px] text-slate-400">応募{st.appCount}件 / 一致{st.overlap}</span>
                            </div>
                            {st.matchedFeatures.length > 0 && (
                              <p className="text-[10px] text-slate-400 mt-0.5">一致: {st.matchedFeatures.join('、')}</p>
                            )}
                            <p className="text-[10px] mt-0.5 flex gap-3">
                              <a href={`/jobs/${st.jobId}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">求人を見る</a>
                              <a href={`/salon/${st.salonId}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">店舗ページ</a>
                            </p>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
