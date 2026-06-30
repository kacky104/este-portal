'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';

// fukuX アカウント（本人）の完全削除。
//
// ⚠ 最高リスクの不可逆操作。設計の要点（厳守）:
//  - service_role はこの 'use server' モジュール内に閉じ込め、クライアントへ出さない（既存 actions と同じ作法）。
//  - 本人性検証：auth.getUser() のログイン id と、削除対象 x_profiles.auth_user_id の一致を必須化。
//    一致しない／未ログインなら何も消さない（他人削除・なりすまし防止）。
//  - 触ってよいのは「自分の x_profiles 行」と「x-images/{auth_user_id}/ 配下」だけ。
//    auth.users・therapists・diary-images バケットには一切書き込み/削除しない（フクエス本体を維持）。
//  - x_profiles.id 参照の FK は全て ON DELETE CASCADE 済み＝本人行を1件消せば
//    x_posts/リプライ/x_likes/x_post_saves/x_follows/x_notifications/
//    x_affiliation_requests/x_conversations/x_messages/x_conversation_reads が連鎖削除される。

const X_IMAGES_BUCKET = 'x-images'; // fukuX のアバター/ヘッダー/投稿画像はすべてこのバケットの {uid}/ 配下

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

export async function deleteMyXAccount(): Promise<DeleteAccountResult> {
  // 1. 本人性検証：Cookie セッションの現在ユーザー。
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です。' };

  // 2. 削除対象 x_profiles を auth_user_id で取得（service_role）。
  const svc = createServiceClient();
  const { data: prof, error: profErr } = await svc
    .from('x_profiles')
    .select('id, auth_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (profErr) return { ok: false, error: 'アカウント情報の取得に失敗しました。' };
  if (!prof) return { ok: false, error: 'fukuX アカウントが見つかりません。' };

  // 二重ガード：取得した行の所有者がログインユーザー本人であることを再確認。
  if (prof.auth_user_id !== user.id) return { ok: false, error: '権限がありません。' };

  // 3a. ストレージ x-images/{uid}/ を削除（best-effort）。失敗しても本体削除は止めない（ログのみ）。
  //     diary-images バケットには一切アクセスしない。
  await deleteUserXImages(svc, user.id);

  // 3b. 本人の x_profiles を1件 delete（auth_user_id 一致で WHERE）。CASCADE で fukuX 関連データが連鎖削除。
  const { error: delErr } = await svc.from('x_profiles').delete().eq('auth_user_id', user.id);
  if (delErr) return { ok: false, error: `削除に失敗しました：${delErr.message}` };

  return { ok: true };
}

// x-images バケットの {uid}/ 直下を list → remove。フラット運用（{uid}/{ts}.ext）前提。
// 消したぶんを毎回 offset 0 から再 list して空になるまで繰り返す（ページング・上限つき安全弁）。
async function deleteUserXImages(
  svc: ReturnType<typeof createServiceClient>,
  uid: string
): Promise<void> {
  const bucket = svc.storage.from(X_IMAGES_BUCKET);
  const PAGE = 100;
  try {
    for (let guard = 0; guard < 100; guard++) {
      // 1万件で安全弁
      const { data: files, error } = await bucket.list(uid, { limit: PAGE });
      if (error) {
        console.error('[deleteMyXAccount] x-images list failed:', error.message);
        return;
      }
      if (!files || files.length === 0) return;
      // フォルダ（id=null）を除いた実ファイルのみを対象に。
      const paths = files.filter((f) => f.id !== null).map((f) => `${uid}/${f.name}`);
      if (paths.length === 0) return;
      const { error: rmErr } = await bucket.remove(paths);
      if (rmErr) {
        console.error('[deleteMyXAccount] x-images remove failed:', rmErr.message);
        return; // 無限ループ回避のため打ち切り（残ファイルは孤児になるが本体削除は続行）
      }
    }
  } catch (e) {
    console.error('[deleteMyXAccount] deleteUserXImages error:', e);
  }
}
