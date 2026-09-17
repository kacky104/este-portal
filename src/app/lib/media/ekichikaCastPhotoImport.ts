import type { SupabaseClient } from '@supabase/supabase-js';
import { readImageSize } from '@/lib/imageSize';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { shouldImportCastPhotos, planCastPhotoSave, type CastPhoto } from '@/lib/ekichikaCastPhotos';
import { THERAPIST_PHOTO_BUCKET, PHOTO_MAX_BYTES } from '@/app/lib/media/therapistPhotoFile';

// ★★ 駅ちかの個人ページの写真を、コネックエフ（therapist-photos・therapists.profile_images）へ取り込む（第427便・2026-09-17）。
//   ★ 呼ぶのは /api/import/ingest の「最初の1回」と「写真だけ取り込む」の道だけ。
//   ★ 決めごと（0枚の人だけ・詰める・記録は本当の枠）は src/lib/ekichikaCastPhotos.ts。★ ここは通信と保存だけ。
//   ★ 1枚でも取れなければ、その枠は飛ばす（★ 取れた枠だけで保存）。★ 1枚も取れなければ何も書かない。
//   ★ 記録（conecf_photo_pushes）が書けなくても写真は残す（★ 記録が無い枠は第426便で「触らない」側なので壊れない）

const FETCH_TIMEOUT_MS = 8000;

async function fetchImage(urls: string[]): Promise<{ buf: Uint8Array; type: string; ext: string } | null> {
  for (const u of urls) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(u, { signal: ctl.signal, cache: 'no-store', headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!res.ok) { clearTimeout(timer); continue; }
      const buf = new Uint8Array(await res.arrayBuffer());
      clearTimeout(timer);
      if (buf.byteLength === 0 || buf.byteLength > PHOTO_MAX_BYTES) continue;
      const size = readImageSize(buf);
      if (!size) continue;
      return { buf, type: size.type, ext: size.type === 'image/png' ? 'png' : 'jpg' };
    } catch {
      continue;
    }
  }
  return null;
}

export type CastPhotoImportResult =
  | { kind: 'skipped'; reason: 'has_photos' | 'no_photos' | 'read_failed' }
  | { kind: 'saved'; saved: number; failed: number[]; recordError: string | null }
  | { kind: 'failed'; failed: number[]; error: string };

export async function importEkichikaCastPhotos(
  svc: SupabaseClient,
  input: { therapistId: number; provider: string; slot: number; photos: CastPhoto[] },
): Promise<CastPhotoImportResult> {
  if (input.photos.length === 0) return { kind: 'skipped', reason: 'no_photos' };
  // ★ 直前にもう一度見る（★ 取り込み中に店舗様が写真を入れていたら触らない）
  const { data: th, error } = await svc.from('therapists').select('profile_images, profile_image_url').eq('id', input.therapistId).maybeSingle();
  if (error || !th) return { kind: 'skipped', reason: 'read_failed' };
  if (!shouldImportCastPhotos({ profileImages: th.profile_images, profileImageUrl: th.profile_image_url })) return { kind: 'skipped', reason: 'has_photos' };

  const stamp = Date.now();
  const results = await Promise.all(input.photos.map(async (p) => {
    const img = await fetchImage(p.urls);
    if (!img) return { n: p.n, url: null as string | null };
    const path = `${input.therapistId}-ekichika${p.n}-${stamp}.${img.ext}`;
    const { error: upErr } = await svc.storage.from(THERAPIST_PHOTO_BUCKET)
      .upload(path, img.buf, { contentType: img.type, cacheControl: STORAGE_CACHE_CONTROL, upsert: false });
    if (upErr) return { n: p.n, url: null };
    return { n: p.n, url: svc.storage.from(THERAPIST_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl };
  }));
  const ok = results.filter((r): r is { n: number; url: string } => !!r.url);
  const failed = results.filter((r) => !r.url).map((r) => r.n);
  if (ok.length === 0) return { kind: 'failed', failed, error: '駅ちかの写真を1枚も取れませんでした' };

  const plan = planCastPhotoSave(ok);
  const { error: upThErr } = await svc.from('therapists')
    .update({ profile_images: plan.profileImages, profile_image_url: plan.profileImageUrl })
    .eq('id', input.therapistId);
  if (upThErr) return { kind: 'failed', failed, error: '写真を保存できませんでした: ' + upThErr.message };

  const { error: recErr } = await svc.from('conecf_photo_pushes').upsert(
    plan.records.map((r) => ({
      therapist_id: input.therapistId, provider: input.provider, slot: input.slot,
      image_slot: r.imageSlot, source_url: r.sourceUrl, pushed_at: new Date().toISOString(),
    })),
    { onConflict: 'therapist_id,provider,slot,image_slot' },
  );
  return { kind: 'saved', saved: ok.length, failed, recordError: recErr ? recErr.message : null };
}
