'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

// フクエスワーク（/mypage/jobs）の入口の判定。★ フクエスリンクの useMediaGate と同じ役割。
//
// ★★★ なぜ1か所にまとめるか（第220便・2026-09-08）
//   フクエスワークの画面は4枚（ホーム／求人内容／応募／新着情報）。
//   ★ 「掲載契約（jobs_enabled）がある店だけ」の判定がページごとに書かれると、
//     画面を増やすたびに書き忘れが出る。★ それはタブ単位の出し分けで踏んだ穴そのもの。
//   → ページが何枚に増えても、入口の判定は【このフック1つ】。
//
// ★ 3値で返す。★ 'wait'（まだ分からない）で追い出さないことが要。
//   まだ読み込めていないだけの店を /mypage へ弾いてしまうと、契約店が入れなくなる。

const supabase = createClient();

export type JobsPageDecision = 'wait' | 'show' | 'leave';

export type JobsSalonLite = {
  id: number;
  name: string | null;
  /** フクエスワーク掲載の契約（salons.jobs_enabled） */
  jobsEnabled: boolean;
};

export function useJobsGate(): {
  decision: JobsPageDecision;
  salon: JobsSalonLite | null;
  loadError: string;
} {
  const router = useRouter();

  const [salon, setSalon] = useState<JobsSalonLite | null>(null);
  const [loadError, setLoadError] = useState('');
  /** ★ 店舗の読み込みが済んだか（見つからなかった場合も済んだ扱い） */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname));
        return;
      }

      // ★ /mypage・フクエスリンクと同じ引き方。★ .single() を使わない理由も同じ
      //   （同じオーナーで2件ヒットしうる）。
      const { data, error } = await supabase
        .from('salons')
        .select('id, name, jobs_enabled')
        .eq('owner_id', user.id)
        .order('is_hidden', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setLoadError(`店舗情報が見つかりません\nログイン中: ${user.email ?? user.id}`);
        setReady(true);
        return;
      }

      setSalon({
        id: Number(data.id),
        name: (data.name as string | null) ?? null,
        jobsEnabled: Boolean(data.jobs_enabled),
      });
      setReady(true);
    })();
  }, [router]);

  // ★ 読み込み前・読み込み失敗は 'wait'（外枠が「読み込み中」や理由を出す）。
  //   ★ 契約が無い店だけ 'leave'。
  const decision: JobsPageDecision =
    !ready || loadError ? 'wait' : salon?.jobsEnabled ? 'show' : 'leave';

  // ★ 契約が無い相手は黙って /mypage へ。★ replace なので「戻る」で戻ってこない
  useEffect(() => {
    if (decision === 'leave') router.replace('/mypage');
  }, [decision, router]);

  return { decision, salon, loadError };
}
