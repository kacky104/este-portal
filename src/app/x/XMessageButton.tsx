'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import type { XProfile } from './xProfile';

const sb = createClient();

// プロフィールの「メッセージ」ボタン。表示条件：ログイン済み ∧ can_act(=非BAN) ∧ 自分以外 ∧
// 自分→相手 または 相手→自分 のフォローが1本でもある。最終防御は x_start_conversation の例外。
export function XMessageButton({
  viewerProfile,
  target,
  isOwnProfile,
}: {
  viewerProfile: XProfile | null;
  target: XProfile;
  isOwnProfile: boolean;
}) {
  const router = useRouter();
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const canEvaluate = !!viewerProfile && !isOwnProfile && viewerProfile.status !== 'rejected';

  useEffect(() => {
    if (!canEvaluate || !viewerProfile) return;
    let alive = true;
    (async () => {
      // どちら向きでもフォローが1本あれば可（.or() を使わず2クエリで判定）。
      const [a, b] = await Promise.all([
        sb
          .from('x_follows')
          .select('follower_profile_id', { head: true, count: 'exact' })
          .eq('follower_profile_id', viewerProfile.id)
          .eq('followee_profile_id', target.id),
        sb
          .from('x_follows')
          .select('follower_profile_id', { head: true, count: 'exact' })
          .eq('follower_profile_id', target.id)
          .eq('followee_profile_id', viewerProfile.id),
      ]);
      if (alive) setEligible((a.count ?? 0) > 0 || (b.count ?? 0) > 0);
    })();
    return () => {
      alive = false;
    };
  }, [canEvaluate, viewerProfile, target.id]);

  if (!canEvaluate || !eligible) return null;

  const start = async () => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await sb.rpc('x_start_conversation', { p_other: target.id });
    setBusy(false);
    if (error || data == null) {
      setToast(error?.message ?? '会話を開始できませんでした');
      window.setTimeout(() => setToast(''), 2800);
      return;
    }
    router.push(`/x/messages/${data}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="whitespace-nowrap shrink-0 text-sm font-bold px-3 py-1.5 rounded-full border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
      >
        {busy ? '…' : 'メッセージ'}
      </button>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
