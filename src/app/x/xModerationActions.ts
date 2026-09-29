'use server';

import { createClient } from '@/app/lib/supabase/server';

// fukuX モデレーション操作（投稿カードの「…」ドロワーから）。
// ★ 第990便（2026-09-30・カッキーさん）: ミュート・ブロック機能は廃止（画面・操作・一覧ページを削除）。
//   DB の x_mutes / x_blocks テーブルはそのまま残している（消すときは Supabase で drop）。
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
