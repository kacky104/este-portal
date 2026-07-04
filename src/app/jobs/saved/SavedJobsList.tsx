'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSavedSalons, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import { fetchActiveJobsBySalonIds, type JobListItem } from '@/app/lib/jobs';
import { JobCard } from '../JobCard';
import { SaveButton } from '@/app/components/SaveButton';

// 保存した求人一覧（クライアント）。
// フロー: saveStore の保存サロンID群を購読 → その公開求人を fetch → 求人カードで表示。
// 保存トグル（本ページのカード上の解除ボタン／別タブ）に即応するため SAVED_SALONS_EVENT と storage を購読。
// 未ログイン=localStorage / ログイン中=DB の切替は saveStore 側が吸収する（getSavedSalons 経由）。
export function SavedJobsList() {
  // null = まだ購読前（ハイドレーション直後）。同期後に number[] が入る。
  const [salonIds, setSalonIds] = useState<number[] | null>(null);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 保存サロンID群を購読（保存トグルで即時反映＝解除したお店の求人が消える）。
  useEffect(() => {
    const sync = () => setSalonIds(getSavedSalons().map((s) => s.id));
    sync();
    window.addEventListener(SAVED_SALONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_SALONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // ID群が変わるたびに公開求人を取得。idsKey で内容変化時のみ再フェッチ。
  const idsKey = salonIds === null ? null : salonIds.join(',');
  useEffect(() => {
    if (salonIds === null) return;
    if (salonIds.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchActiveJobsBySalonIds(salonIds)
      .then((list) => {
        if (!cancelled) {
          setJobs(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJobs([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // salonIds の内容変化のみを検知（配列参照の揺れは idsKey で吸収）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // 読み込み中（初回同期前含む）。
  if (salonIds === null || loading) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-slate-400 text-sm shadow-sm">
        読み込み中…
      </div>
    );
  }

  // 空状態：保存0件 or 保存はあるが公開中求人が無い。
  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center shadow-sm">
        <p className="text-slate-500 text-sm">保存した求人はまだありません</p>
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1 mt-4 text-sm font-bold hover:opacity-80 transition-opacity"
          style={{ color: '#059669' }}
        >
          求人一覧を見る
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {jobs.map((job) => (
        <li key={job.id} className="relative">
          <JobCard job={job} reserveTopRight />
          {/* カード上の保存解除（緑肉球・小サイズ）。Link の外側の兄弟要素なので入れ子リンクにならない。
              解除すると saveStore が更新→上の購読が発火→そのお店の求人がリストから消える。 */}
          <div className="absolute top-2.5 right-2.5 z-10">
            <SaveButton
              kind="salon"
              item={{ id: job.salon.id, name: job.salon.name }}
              variant="paw"
              size={28}
              imageSrc="/logo-fukuwork.png"
              imageSavedSrc="/logo-fukuwork-saved.png"
              burstColor="#10B981"
              savedBg="#FFFFFF"
              shadow
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
