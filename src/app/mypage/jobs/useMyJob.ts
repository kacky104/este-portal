'use client';

import { useEffect, useState } from 'react';
import { getMyJob, type MyJob } from '@/app/actions/jobs';

// 自店の求人（1店舗1件）を読む小さなフック（第220便）。
// ★ フクエスワークの4画面すべてが「求人が作られているか」で出し分けるので、読み方は1か所にする。
// ★ 取り方（getMyJob）は今までどおり。★ 画面を割っただけで、仕組みは変えていない。

export function useMyJob(salonId: number | null): {
  job: MyJob | null;
  setJob: (j: MyJob | null) => void;
  loading: boolean;
  loadError: string;
} {
  const [job, setJob] = useState<MyJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (salonId == null) return;
    let alive = true;
    setLoading(true);
    setLoadError('');
    getMyJob(salonId)
      .then((res) => {
        if (!alive) return;
        if (!res.ok) { setLoadError(res.error); return; }
        setJob(res.job);
      })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [salonId]);

  return { job, setJob, loading, loadError };
}
