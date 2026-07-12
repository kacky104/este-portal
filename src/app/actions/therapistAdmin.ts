'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// セラピスト削除・プロフィール画像掃除のサーバー専用処理（2026-07-12 新設）。
//
// 従来 /mypage からクライアント直 delete（RLS）だったが、
//  - therapist-photos のプロフィール画像（profile_image_url / profile_images 最大5枚）
//  - 写メ日記（diary-images）の画像
// が残置され URL 直打ちで見え続けるため、fukuX の adminDeleteXProfile と同方針で
// server action 化した（行削除成功後に storage を掃除）。
//
// ⚠ セキュリティ（厳守）:
//  - service_role はこのサーバー専用モジュール内でのみ使用。クライアントへ出さない。
//  - 全 action の先頭で assertOwner（salons.owner_id === auth.uid() または ADMIN_UUID）を再検証。
//  - storage 掃除は best-effort：失敗しても行削除は続行（孤児は残るが公開面は消える）。

const THERAPIST_BUCKET = 'therapist-photos';
const DIARY_BUCKET = 'diary-images';

type Result = { ok: true } | { ok: false; error: string };

// ログインユーザーがその salon の owner（または管理者UID）かをサーバー側で検証（castInvite.ts と同型）。
async function assertOwner(salonId: number): Promise<{ userId: string } | { error: string }> {
  if (!Number.isFinite(salonId)) return { error: '対象サロンが不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };

  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { error: 'サロンが見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { error: 'このサロンの操作権限がありません' };
  }
  return { userId: user.id };
}

// 公開URL（.../storage/v1/object/public/{bucket}/{path}）→ バケット内パス。
// 対象バケット以外のURL（外部画像等）は null を返して触らない（xAdmin.ts と同ロジック）。
function bucketPathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

/**
 * セラピストを削除する（storage 掃除つき）。
 * 行削除の順序は schedules → diary_posts → therapists（FK が CASCADE 未設定でも安全な順）。
 * storage 掃除は行削除成功後に best-effort で実行する。
 */
export async function deleteTherapistWithCleanup(input: {
  therapistId: string;
  salonId: number;
}): Promise<Result> {
  const therapistId = String(input.therapistId ?? '').trim();
  const salonId = Number(input.salonId);
  if (!therapistId) return { ok: false, error: '対象セラピストが不正です' };

  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();

  // 対象が当該サロン所属か検証しつつ、掃除対象のプロフィール画像URLを行削除前に控える。
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, profile_image_url, profile_images')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr) return { ok: false, error: `セラピストの取得に失敗しました: ${tErr.message}` };
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };

  // 写メ日記の画像URLも行削除前に控える（行が消えると辿れなくなる）。
  const { data: diaries } = await svc
    .from('diary_posts')
    .select('images')
    .eq('therapist_id', therapistId);

  // 行削除：schedules → diary_posts → therapists の順。
  const { error: schedErr } = await svc
    .from('therapist_schedules')
    .delete()
    .eq('therapist_id', therapistId);
  if (schedErr) return { ok: false, error: `出勤スケジュールの削除に失敗しました: ${schedErr.message}` };

  const { error: diaryErr } = await svc
    .from('diary_posts')
    .delete()
    .eq('therapist_id', therapistId);
  if (diaryErr) return { ok: false, error: `写メ日記の削除に失敗しました: ${diaryErr.message}` };

  const { error: delErr } = await svc
    .from('therapists')
    .delete()
    .eq('id', therapistId)
    .eq('salon_id', salonId);
  if (delErr) return { ok: false, error: `削除に失敗しました: ${delErr.message}` };

  // ── ここから storage 掃除（best-effort・失敗しても ok を返す） ──
  const profilePaths = [
    ...(Array.isArray(t.profile_images) ? (t.profile_images as string[]) : []),
    (t.profile_image_url as string | null) ?? null,
  ]
    .map((u) => bucketPathFromPublicUrl(u, THERAPIST_BUCKET))
    .filter((p): p is string => !!p);
  if (profilePaths.length > 0) {
    const { error: rmErr } = await svc.storage
      .from(THERAPIST_BUCKET)
      .remove([...new Set(profilePaths)]);
    if (rmErr) console.error('[deleteTherapistWithCleanup] therapist-photos remove failed:', rmErr.message);
  }

  const diaryPaths = (diaries ?? [])
    .flatMap((d) => (Array.isArray(d.images) ? (d.images as string[]) : []))
    .map((u) => bucketPathFromPublicUrl(u, DIARY_BUCKET))
    .filter((p): p is string => !!p);
  if (diaryPaths.length > 0) {
    const { error: rmErr } = await svc.storage
      .from(DIARY_BUCKET)
      .remove([...new Set(diaryPaths)]);
    if (rmErr) console.error('[deleteTherapistWithCleanup] diary-images remove failed:', rmErr.message);
  }

  return { ok: true };
}

/**
 * プロフィール画像の差し替え・スロット削除で不要になった旧ファイルを掃除する
 * （/mypage/therapist/[id] の保存成功後にクライアントから呼ぶ）。
 * 安全弁：
 *  - 現行プロフィール（profile_image_url / profile_images）で使用中のURLは削除しない。
 *  - ファイル名は `${therapistId}-${Date.now()}.{ext}` 規約のため、
 *    `${therapistId}-` プレフィックス以外のパスは削除しない（他セラピストの画像を守る）。
 */
export async function cleanupTherapistPhotos(input: {
  therapistId: string;
  salonId: number;
  urls: string[];
}): Promise<Result> {
  const therapistId = String(input.therapistId ?? '').trim();
  const salonId = Number(input.salonId);
  if (!therapistId) return { ok: false, error: '対象セラピストが不正です' };

  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, profile_image_url, profile_images')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr) return { ok: false, error: `セラピストの取得に失敗しました: ${tErr.message}` };
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };

  const inUse = new Set(
    [
      ...(Array.isArray(t.profile_images) ? (t.profile_images as string[]) : []),
      (t.profile_image_url as string | null) ?? '',
    ].filter(Boolean),
  );

  const paths = [...new Set(input.urls ?? [])]
    .filter((u) => typeof u === 'string' && !inUse.has(u))
    .map((u) => bucketPathFromPublicUrl(u, THERAPIST_BUCKET))
    .filter((p): p is string => !!p && p.startsWith(`${therapistId}-`));
  if (paths.length === 0) return { ok: true };

  const { error: rmErr } = await svc.storage.from(THERAPIST_BUCKET).remove(paths);
  if (rmErr) return { ok: false, error: rmErr.message };
  return { ok: true };
}
