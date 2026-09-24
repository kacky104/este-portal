import type { createServiceClient } from '@/app/lib/supabase/service';
import { normalizeArticlePhotoIds, pickArticlePhoto } from '@/lib/articlePhotoPick';

// フクエスお知らせの【写真の箱】（第775便・2026-09-24・カッキーさん）。
//
// ★ 駅ちか新着情報の写真の箱（第373便）と同じ考え方。★ 箱はフクエス用に別（salon_announce_state）。
// ★★ 出すたび（自動・再投稿・新規公開）に、画像なしのお知らせにだけ箱から1枚を入れる。
//   ・自分で付けた画像（announcement-images）… 触らない（カッキーさんの決定）
//   ・前回ランダムで入った写真（therapist-photos）… 入れ替える
//   ・画像なし … 入れる
//   ・箱が空 … 何もしない
// ★★ SQL（20260924_announce_photo_pool.sql）の前は列が読めない → 何もしない（★ 投稿は止めない）。
// ★ 失敗しても投稿そのものは失敗にしない（★ 写真はおまけ。出たものは出た）。

type Svc = ReturnType<typeof createServiceClient>;

export const ANNOUNCE_OWN_IMAGE_BUCKET = 'announcement-images';
export const ANNOUNCE_POOL_PHOTO_BUCKET = 'therapist-photos';

/** 自分で付けた画像か（★ これは入れ替えない） */
export function isOwnAnnounceImage(url: string | null | undefined): boolean {
  return String(url ?? '').includes('/' + ANNOUNCE_OWN_IMAGE_BUCKET + '/');
}

/** この店の方で、フクエスに写真が入っている方（名前順）。★ 箱に入れられるのはこの方たちだけ */
export async function listAnnouncePhotoTherapists(
  svc: Svc,
  salonId: number,
): Promise<Array<{ id: number; name: string; photoUrl: string }>> {
  const { data } = await svc
    .from('therapists').select('id, name, profile_image_url')
    .eq('salon_id', salonId)
    .order('name', { ascending: true });
  return (data ?? [])
    .filter((r) => String(r.profile_image_url ?? '').includes('/' + ANNOUNCE_POOL_PHOTO_BUCKET + '/'))
    .map((r) => ({ id: Number(r.id), name: String(r.name ?? ''), photoUrl: String(r.profile_image_url ?? '') }));
}

/**
 * 出した1本に、箱から写真を1枚入れる。
 * @returns changed … image_url を書き換えたか（★ 書き換えたら呼ぶ側で revalidate する）
 */
export async function applyAnnouncePhoto(
  svc: Svc,
  salonId: number,
  announcementId: string,
): Promise<{ changed: boolean }> {
  try {
    const { data: ann, error: annErr } = await svc
      .from('announcements').select('id, image_url')
      .eq('id', announcementId).eq('salon_id', salonId).maybeSingle();
    if (annErr || !ann) return { changed: false };
    // ★ 自分で付けた画像は触らない
    if (isOwnAnnounceImage(ann.image_url as string | null)) return { changed: false };

    const { data: st, error: stErr } = await svc
      .from('salon_announce_state').select('photo_therapist_ids, last_photo_therapist_id')
      .eq('salon_id', salonId).maybeSingle();
    // ★ SQL 前（列が無い）・行が無い → 何もしない
    if (stErr || !st) return { changed: false };

    const photos = await listAnnouncePhotoTherapists(svc, salonId);
    // ★ 写真が消された方は箱から落として選ぶ（★ 無い写真を入れない）
    const ids = normalizeArticlePhotoIds(st.photo_therapist_ids).filter((id) => photos.some((p) => p.id === id));
    const last = st.last_photo_therapist_id == null ? null : Number(st.last_photo_therapist_id);
    const pick = pickArticlePhoto(ids, last, Math.random());
    if (pick.kind === 'keep') return { changed: false };
    const url = photos.find((p) => p.id === pick.id)?.photoUrl;
    if (!url) return { changed: false };

    const { error: upErr } = await svc
      .from('announcements').update({ image_url: url })
      .eq('id', announcementId).eq('salon_id', salonId);
    if (upErr) { console.error('[announce-photo] 写真を入れられませんでした:', upErr.message); return { changed: false }; }

    const { error: lastErr } = await svc
      .from('salon_announce_state')
      .update({ last_photo_therapist_id: pick.id, updated_at: new Date().toISOString() })
      .eq('salon_id', salonId);
    if (lastErr) console.error('[announce-photo] 直前の1枚を残せませんでした:', lastErr.message);
    return { changed: true };
  } catch (e) {
    console.error('[announce-photo] 失敗:', e);
    return { changed: false };
  }
}
