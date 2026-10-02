import type { SupabaseClient } from '@supabase/supabase-js';
import { readImageSize } from '@/lib/imageSize';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { shouldImportCastPhotos, planCastPhotoSave, planCastPhotoFollow, type CastPhoto } from '@/lib/ekichikaCastPhotos';
import { THERAPIST_PHOTO_BUCKET, PHOTO_MAX_BYTES } from '@/app/lib/media/therapistPhotoFile';

// ★★ 駅ちかの個人ページの写真を、コネックエフ（therapist-photos・therapists.profile_images）へ取り込む（第427便・2026-09-17）。
//   ★ 呼ぶのは /api/import/ingest の「最初の1回」と「写真だけ取り込む」の道だけ。
//   ★ 決めごと（0枚の人だけ・詰める・記録は本当の枠）は src/lib/ekichikaCastPhotos.ts。★ ここは通信と保存だけ。
//   ★ 1枚でも取れなければ、その枠は飛ばす（★ 取れた枠だけで保存）。★ 1枚も取れなければ何も書かない。
//   ★ 第1101便（カッキーさん）: フクエスリンクの毎日の周では follow=true で呼ぶ＝駅ちか側の写真が変わった人は取り込み直す・0枚になった人は消す
//     （★ フクエスの写真がすべて駅ちかから取り込んだものの人だけ。決めごとは src/lib/ekichikaCastPhotos.ts の planCastPhotoFollow）
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
  | { kind: 'skipped'; reason: 'has_photos' | 'no_photos' | 'read_failed' | 'unchanged' | 'clear_held' }
  | { kind: 'saved'; saved: number; failed: number[]; recordError: string | null; refreshed: boolean }
  | { kind: 'cleared' }
  | { kind: 'failed'; failed: number[]; error: string };

/**
 * @param input.follow     ★ 第1101便: true なら、駅ちか側の写真が変わった人は取り込み直し、0枚になった人は消す
 *                           （★ フクエスの写真が【すべて駅ちかから取り込んだもの】の人だけ。決めごとは planCastPhotoFollow）。
 *                           省くと今までどおり「0枚の人だけ取り込む」（最初の1回・写真だけ取り込む の道）。
 * @param input.allowClear ★ follow のとき、消してよいか（呼ぶ側が allowCastPhotoClear で決める安全弁）。既定 true
 */
export async function importEkichikaCastPhotos(
  svc: SupabaseClient,
  input: { therapistId: number; provider: string; slot: number; photos: CastPhoto[]; follow?: boolean; allowClear?: boolean },
): Promise<CastPhotoImportResult> {
  if (!input.follow && input.photos.length === 0) return { kind: 'skipped', reason: 'no_photos' };
  // ★ 直前にもう一度見る（★ 取り込み中に店舗様が写真を入れていたら触らない）
  const { data: th, error } = await svc.from('therapists').select('profile_images, profile_image_url').eq('id', input.therapistId).maybeSingle();
  if (error || !th) return { kind: 'skipped', reason: 'read_failed' };
  const cur = { profileImages: th.profile_images, profileImageUrl: th.profile_image_url };

  let refreshing = false;
  if (input.follow) {
    const plan = planCastPhotoFollow(cur, input.photos, input.therapistId);
    if (plan.action === 'none') {
      return { kind: 'skipped', reason: plan.reason === 'own_photos' ? 'has_photos' : plan.reason === 'no_photos' ? 'no_photos' : 'unchanged' };
    }
    if (plan.action === 'clear') {
      if (input.allowClear === false) return { kind: 'skipped', reason: 'clear_held' };
      // ★★ 駅ちか側が0枚になった → フクエスの写真も消す（既定画像に切り替わる）。★ 上で直前に読み直した写真で判断している
      const { error: clrErr } = await svc.from('therapists')
        .update({ profile_images: [], profile_image_url: null })
        .eq('id', input.therapistId);
      if (clrErr) return { kind: 'failed', failed: [], error: '写真を消せませんでした: ' + clrErr.message };
      // ★ 送った記録も消す（★ 残すと、あとでコネックエフに切り替えたときに「その枠へ送り済み」と読まれる）
      await svc.from('conecf_photo_pushes').delete()
        .eq('therapist_id', input.therapistId).eq('provider', input.provider).eq('slot', input.slot);
      // ★ Storage のファイルは消さない（★ fukuX のアイコンなど、ほかの場所が同じ URL を見ていることがある）
      return { kind: 'cleared' };
    }
    refreshing = plan.action === 'refresh';
  } else if (!shouldImportCastPhotos(cur)) {
    return { kind: 'skipped', reason: 'has_photos' };
  }

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
  // ★★ 第1101便: 取り込み直しは【全部取れたときだけ】。★ 一部しか取れないまま入れ替えると、いまある写真が減る。次の周でもう一度試す
  if (refreshing && failed.length > 0) {
    return { kind: 'failed', failed, error: '一部の写真を取れなかったので、入れ替えを見送りました（次の周でもう一度試します）' };
  }

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
  // ★ 第1101便: 取り込み直しで無くなった枠の記録は消す（★ 残すと「その枠へ送り済み」と読まれる）
  if (refreshing) {
    const keep = plan.records.map((r) => r.imageSlot);
    const { data: old } = await svc.from('conecf_photo_pushes').select('image_slot')
      .eq('therapist_id', input.therapistId).eq('provider', input.provider).eq('slot', input.slot);
    const stale = (old ?? []).map((r) => Number(r.image_slot)).filter((n) => !keep.includes(n));
    if (stale.length > 0) {
      await svc.from('conecf_photo_pushes').delete()
        .eq('therapist_id', input.therapistId).eq('provider', input.provider).eq('slot', input.slot).in('image_slot', stale);
    }
  }
  // ★ 古い写真のファイルは Storage に残す（★ fukuX のアイコンなど、ほかの場所が同じ URL を見ていることがある）
  return { kind: 'saved', saved: ok.length, failed, recordError: recErr ? recErr.message : null, refreshed: refreshing };
}
