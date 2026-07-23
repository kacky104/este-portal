'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// fukuX 運営パネル限定：表示中アカウントのログインメール（auth.users.email）を取得する。
//
// ⚠ セキュリティ（厳守）:
//  - service_role はこのサーバー専用モジュール内でのみ使用（'use server'）。クライアントへ出さない。
//  - 呼び出しのたびに auth.uid() === ADMIN_UUID を再検証（/x/admin のガードに加えて二重化）。
//    運営以外には何も返さない（空オブジェクト）。
//  - 取得したメールは戻り値として運営にだけ返す。DB（x_profiles 等）には保存・複製しない。
//  - admin API listUsers をページングし、必要な auth_user_id ぶんだけ id→email の辞書にする（N+1回避）。
export async function getXAccountEmails(authUserIds: string[]): Promise<Record<string, string>> {
  // 二重ガード：運営UUIDでなければ取得処理に到達させない。
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_UUID) return {};

  const want = new Set(authUserIds.filter(Boolean));
  if (want.size === 0) return {};

  const svc = createServiceClient();
  const out: Record<string, string> = {};
  const perPage = 200;

  // listUsers をページングして必要分が揃うまで走査（安全のため上限ページ数を設ける）。
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const users = data?.users ?? [];
    for (const u of users) {
      if (want.has(u.id) && u.email) out[u.id] = u.email;
    }
    if (Object.keys(out).length >= want.size) break; // 必要分が揃った
    if (users.length < perPage) break; // 最終ページ
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 運営による削除（storage 掃除つき）。
// 従来は XAdmin.tsx からクライアント直 delete（RLSの運営ポリシー）だったが、
// x-images の画像が残置され URL 直打ちで見え続けるため、server action 化して
// 行削除の前にストレージも掃除する（本人退会 deleteMyXAccount と同じ方針）。
// storage 掃除は best-effort：失敗しても行削除は続行（孤児は残るが公開面は消える）。
// ─────────────────────────────────────────────────────────────

const X_IMAGES_BUCKET = 'x-images';

export type XAdminDeleteResult = { ok: true } | { ok: false; error: string };

// 運営ガード（各 action の先頭で毎回再検証。/x/admin のページガードに加えて二重化）。
async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && user.id === ADMIN_UUID;
}

// 運営によるプロフィール削除：x-images/{auth_user_id}/ を掃除 → x_profiles 行を削除（CASCADE）。
export async function adminDeleteXProfile(profileId: string): Promise<XAdminDeleteResult> {
  if (!(await requireAdmin())) return { ok: false, error: '権限がありません。' };
  if (!profileId) return { ok: false, error: '対象が不正です。' };

  const svc = createServiceClient();
  const { data: prof, error: profErr } = await svc
    .from('x_profiles')
    .select('id, auth_user_id')
    .eq('id', profileId)
    .maybeSingle();
  if (profErr) return { ok: false, error: 'アカウント情報の取得に失敗しました。' };
  if (!prof) return { ok: false, error: '対象アカウントが見つかりません。' };

  // 画像フォルダ掃除（アバター・ヘッダー・投稿・ストーリー画像はすべて {uid}/ 配下）。
  if (prof.auth_user_id) await deleteXImagesFolder(svc, prof.auth_user_id);

  const { error: delErr } = await svc.from('x_profiles').delete().eq('id', profileId);
  if (delErr) return { ok: false, error: `削除に失敗しました：${delErr.message}` };
  return { ok: true };
}

// 運営による投稿削除：x_posts.images（公開URL）から storage パスを復元して掃除 → 行削除。
// タイムライン固定（ピン止め）の設定/解除。pinned_at はRLSで一般更新不可のため service_role で更新
// （adminDeleteXPost と同じ二重ガード方針）。固定は運用上少数（表示側は最新3件のみ使用）。
export async function adminSetXPostPinned(postId: string, pinned: boolean): Promise<XAdminDeleteResult> {
  if (!(await requireAdmin())) return { ok: false, error: '権限がありません。' };
  if (!postId) return { ok: false, error: '対象が不正です。' };

  const svc = createServiceClient();
  // リプライは固定不可（タイムラインに出ないため）。
  const { data: post, error: postErr } = await svc
    .from('x_posts')
    .select('id, parent_post_id')
    .eq('id', postId)
    .maybeSingle();
  if (postErr) return { ok: false, error: '投稿の取得に失敗しました。' };
  if (!post) return { ok: false, error: '対象投稿が見つかりません。' };
  if (post.parent_post_id) return { ok: false, error: 'リプライは固定できません。' };

  const { error } = await svc
    .from('x_posts')
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq('id', postId);
  if (error) return { ok: false, error: `更新に失敗しました：${error.message}` };
  return { ok: true };
}

export async function adminDeleteXPost(postId: string): Promise<XAdminDeleteResult> {
  if (!(await requireAdmin())) return { ok: false, error: '権限がありません。' };
  if (!postId) return { ok: false, error: '対象が不正です。' };

  const svc = createServiceClient();
  const { data: post, error: postErr } = await svc
    .from('x_posts')
    .select('id, images')
    .eq('id', postId)
    .maybeSingle();
  if (postErr) return { ok: false, error: '投稿の取得に失敗しました。' };
  if (!post) return { ok: false, error: '対象投稿が見つかりません。' };

  const paths = ((post.images as string[] | null) ?? [])
    .map(publicUrlToXImagePath)
    .filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmErr } = await svc.storage.from(X_IMAGES_BUCKET).remove(paths);
    if (rmErr) console.error('[adminDeleteXPost] x-images remove failed:', rmErr.message); // best-effort
  }

  const { error: delErr } = await svc.from('x_posts').delete().eq('id', postId);
  if (delErr) return { ok: false, error: `削除に失敗しました：${delErr.message}` };
  return { ok: true };
}

// 公開URL（.../storage/v1/object/public/x-images/{uid}/{file}）→ バケット内パス（{uid}/{file}）。
// x-images 以外のURL（外部画像等）は null を返して触らない。
function publicUrlToXImagePath(url: string): string | null {
  const marker = `/${X_IMAGES_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

// x-images/{uid}/ 直下を list → remove（xAccount.ts の deleteUserXImages と同ロジック。
// 'use server' モジュールのため export できず、svc 引数つきヘルパーの共有は不可＝ここに複製）。
async function deleteXImagesFolder(
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
        console.error('[adminDeleteXProfile] x-images list failed:', error.message);
        return;
      }
      if (!files || files.length === 0) return;
      const paths = files.filter((f) => f.id !== null).map((f) => `${uid}/${f.name}`);
      if (paths.length === 0) return;
      const { error: rmErr } = await bucket.remove(paths);
      if (rmErr) {
        console.error('[adminDeleteXProfile] x-images remove failed:', rmErr.message);
        return; // 無限ループ回避のため打ち切り
      }
    }
  } catch (e) {
    console.error('[adminDeleteXProfile] deleteXImagesFolder error:', e);
  }
}
