// セラピストを消す本体（行の削除＋ storage の掃除）。★ サーバー専用。service_role で動く。
//
// ★ 第1279便（2026-10-07）: actions/therapistAdmin.ts の deleteTherapistWithCleanup から、中身だけをここへ移した。
//   ★ 中身は1文字も変えていない。変えたのは置き場所だけ。
//   ★ なぜ移したか: コネックエフの削除は「各サイトから消えたことを確かめてから消す」ようにした。
//     確かめ終わるのは中継の流れの中（＝店舗様のログインが居ない場所）なので、
//     権限の確認（assertOwner）と中身を分ける必要があった。
// ★★ 権限は【呼ぶ側】が確かめること。ここは確かめない。
//     ・actions/therapistAdmin.ts … assertOwner のあとで呼ぶ
//     ・app/lib/conecf/girlDeleteFinish.ts … 店舗様が押した削除（権限を確かめて積んだ流れ）の続きとして呼ぶ

import type { createServiceClient } from '@/app/lib/supabase/service';

type Svc = ReturnType<typeof createServiceClient>;

const THERAPIST_BUCKET = 'therapist-photos';
const DIARY_BUCKET = 'diary-images';

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
 * 行削除の順序は schedules → diary_posts → therapists（FK が CASCADE 未設定でも安全な順）。
 * storage 掃除は行削除成功後に best-effort で実行する。
 */
export async function deleteTherapistCore(
  svc: Svc,
  input: { therapistId: string; salonId: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const therapistId = String(input.therapistId ?? '').trim();
  const salonId = Number(input.salonId);
  if (!therapistId) return { ok: false, error: '対象セラピストが不正です' };

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
    if (rmErr) console.error('[deleteTherapistCore] therapist-photos remove failed:', rmErr.message);
  }

  const diaryPaths = (diaries ?? [])
    .flatMap((d) => (Array.isArray(d.images) ? (d.images as string[]) : []))
    .map((u) => bucketPathFromPublicUrl(u, DIARY_BUCKET))
    .filter((p): p is string => !!p);
  if (diaryPaths.length > 0) {
    const { error: rmErr } = await svc.storage
      .from(DIARY_BUCKET)
      .remove([...new Set(diaryPaths)]);
    if (rmErr) console.error('[deleteTherapistCore] diary-images remove failed:', rmErr.message);
  }

  return { ok: true };
}
