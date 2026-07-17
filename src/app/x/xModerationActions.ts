'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';

// fukuX モデレーション操作（投稿カードの「…」ドロワーから）。
// - muteProfile  : x_mutes に行を追加（相手に通知されない・自分のタイムラインから非表示）。
// - blockProfile : x_blocks に行を追加＋相互フォローを自動解除。相手→自分のフォロー行の削除は
//                  RLS（follower本人のみ削除可）を越える必要があるため、その1操作のみ service_role を使う。
// - reportPost   : x_reports に保存（RLS: reporter本人のみINSERT可）。メール通知はしない
//                  （/x/admin「通報」タブで確認する運用・2026-07-17 仕様変更）。
// いずれも Cookie セッション（authenticated）＋RLS を基本とする（xSukiActions と同方針）。

export type ModerationResult = { ok: true } | { ok: false; error: string };

// 認証 → 自分の x_profiles.id を解決（未ログイン/未開設は null）。
async function resolveMyProfileId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase
    .from('x_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  return me ? (me.id as string) : null;
}

export async function muteProfile(targetProfileId: string): Promise<ModerationResult> {
  if (!targetProfileId) return { ok: false, error: '対象が不正です。' };
  const supabase = await createClient();
  const myId = await resolveMyProfileId(supabase);
  if (!myId) return { ok: false, error: 'ログインとアカウント開設が必要です。' };
  if (myId === targetProfileId) return { ok: false, error: '自分はミュートできません。' };

  const { error } = await supabase
    .from('x_mutes')
    .upsert(
      { muter_profile_id: myId, muted_profile_id: targetProfileId },
      { onConflict: 'muter_profile_id,muted_profile_id', ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: 'ミュートに失敗しました。時間をおいてお試しください。' };
  return { ok: true };
}

export async function blockProfile(targetProfileId: string): Promise<ModerationResult> {
  if (!targetProfileId) return { ok: false, error: '対象が不正です。' };
  const supabase = await createClient();
  const myId = await resolveMyProfileId(supabase);
  if (!myId) return { ok: false, error: 'ログインとアカウント開設が必要です。' };
  if (myId === targetProfileId) return { ok: false, error: '自分はブロックできません。' };

  const { error } = await supabase
    .from('x_blocks')
    .upsert(
      { blocker_profile_id: myId, blocked_profile_id: targetProfileId },
      { onConflict: 'blocker_profile_id,blocked_profile_id', ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: 'ブロックに失敗しました。時間をおいてお試しください。' };

  // 相互フォローの自動解除。自分→相手はセッション（RLS: follower本人）で消せる。
  await supabase
    .from('x_follows')
    .delete()
    .eq('follower_profile_id', myId)
    .eq('followee_profile_id', targetProfileId);
  // 相手→自分は RLS 上セッションでは消せないため service_role で削除（この1操作のみ）。
  try {
    const service = createServiceClient();
    await service
      .from('x_follows')
      .delete()
      .eq('follower_profile_id', targetProfileId)
      .eq('followee_profile_id', myId);
  } catch (e) {
    // フォロー解除の失敗はブロック成立自体には影響させない（非表示は x_blocks で既に有効）。
    console.error('[xModeration] 相手側フォロー解除に失敗:', e);
  }
  return { ok: true };
}

const REPORT_REASONS = ['スパム・宣伝', '不適切な内容', 'その他'] as const;

export async function reportPost(input: {
  targetProfileId: string;
  postId: string | null;
  reason: string;
}): Promise<ModerationResult> {
  const { targetProfileId, postId, reason } = input;
  if (!targetProfileId) return { ok: false, error: '対象が不正です。' };
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { ok: false, error: '通報理由が不正です。' };

  const supabase = await createClient();
  const myId = await resolveMyProfileId(supabase);
  if (!myId) return { ok: false, error: 'ログインとアカウント開設が必要です。' };
  if (myId === targetProfileId) return { ok: false, error: '自分の投稿は通報できません。' };

  const { error } = await supabase.from('x_reports').insert({
    reporter_profile_id: myId,
    target_profile_id: targetProfileId,
    post_id: postId,
    reason,
  });
  if (error) return { ok: false, error: '通報の送信に失敗しました。時間をおいてお試しください。' };
  return { ok: true };
}
