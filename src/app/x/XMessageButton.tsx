'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import type { XProfile } from './xProfile';
import { useXToast } from './useXToast';
import { XOfficialContactModal } from './XOfficialContactModal';

const sb = createClient();

// プロフィールの「メッセージ」ボタン。表示条件：ログイン済み ∧ can_act(=非BAN) ∧ 自分以外 ∧
// 自分→相手 または 相手→自分 のフォローが1本でもある。最終防御は x_start_conversation の例外。
// ※オファー経由のフォローなしDMは /x/offers の「オファーを送る」ボタン専用の導線（ここでは免除しない）。
//
// 運営(official)まわりの例外は2つ（DB側でも x_start_conversation / dm_disabled ガードを免除済み）:
//   A. 相手が運営 → 誰でも常に表示。押すとDMスレッドではなく「お問い合わせフォーム」を開く。
//   B. 自分が運営 → フォロー関係なしに誰にでも表示（通常どおりスレッドへ遷移）。
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
  const [contactOpen, setContactOpen] = useState(false);
  const { toast, showToast } = useXToast(2800);

  const targetIsOfficial = target.kind === 'official';
  const viewerIsOfficial = viewerProfile?.kind === 'official';

  // どちらか一方でも DM受付オフなら開始不可（相手＝target・自分＝viewerProfile）。最終防御はDB側RPC。
  // 運営が絡む会話は dm_disabled を免除する（DB側のガードも同じ条件で免除済み）。
  const dmBlocked =
    targetIsOfficial || viewerIsOfficial ? false : target.dm_disabled || !!viewerProfile?.dm_disabled;
  const canEvaluate = !!viewerProfile && !isOwnProfile && viewerProfile.status !== 'rejected' && !dmBlocked;

  // 運営が絡む場合はフォロー判定そのものが不要（常に可）。
  const skipFollowCheck = targetIsOfficial || viewerIsOfficial;

  useEffect(() => {
    // 運営が絡む場合はフォロー判定不要＝クエリを投げない（表示可否は下の show で判断）。
    if (!canEvaluate || !viewerProfile || skipFollowCheck) return;
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
  }, [canEvaluate, viewerProfile, target.id, skipFollowCheck]);

  // 運営が絡むなら無条件で表示、それ以外はフォロー1本以上のときだけ表示。
  const show = canEvaluate && (skipFollowCheck || eligible);
  if (!show) return null;

  const start = async () => {
    if (busy) return;
    // 相手が運営のときはスレッドへ行かず、お問い合わせフォームを開く。
    if (targetIsOfficial) {
      setContactOpen(true);
      return;
    }
    setBusy(true);
    const { data, error } = await sb.rpc('x_start_conversation', { p_other: target.id });
    setBusy(false);
    if (error || data == null) {
      showToast(error?.message ?? '会話を開始できませんでした');
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
        className="whitespace-nowrap shrink-0 text-sm font-bold px-3 py-1.5 rounded-full border border-indigo-300 text-[color:var(--x-accent)] hover:bg-indigo-50 transition-colors disabled:opacity-50"
      >
        {busy ? '…' : 'メッセージ'}
      </button>
      {targetIsOfficial && viewerProfile && (
        <XOfficialContactModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          officialProfileId={target.id}
          myProfileId={viewerProfile.id}
          myHandle={viewerProfile.handle}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
