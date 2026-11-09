'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import {
  ESUTAMA_OPT_KEYS, ESUTAMA_OPT_LABEL, ESUTAMA_OPT_READY, ESUTAMA_OPT_DEFAULT, isValidEsutamaOptSetting, type EsutamaOptKey,
} from '@/lib/esutamaOption';
import {
  ESUTAMA_POST_KEYS, ESUTAMA_POST_LABEL, ESUTAMA_POST_DEFAULT, esutamaPostTextProblem, isValidEsutamaPostSetting, type EsutamaPostKey,
  ESUTAMA_POST_IMAGE_MAX, isEsutamaPostImagePath, pickEsutamaPostImages, isDailyPostKey, ESUTAMA_POST_DAILY,
} from '@/lib/esutamaPost';

// エステ魂【オプション】の受け口（第1799便・2026-11-09・カッキーさんの決定）。
// ★ 運営が /admin で ON（admin_enabled）にした店だけ、コネックエフに出る。店舗様は自動の ON/OFF・時間帯・間隔と「今すぐ押す」。
// ★ 表は conecf_esutama_options（追加SQL_第1799便）。★ 押すのは中継の流れ（lib/esutamaOptionFlow.ts）。周は /api/admin/ekichika-bump。
// ★ 書き込み（保存・今すぐ）は「コネックエフに切り替え済み」でセットを契約している自店だけ（conecfBump と同じ守り）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const okKey = (v: unknown): EsutamaOptKey | null => (ESUTAMA_OPT_KEYS as string[]).includes(String(v)) ? (v as EsutamaOptKey) : null;

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at, crm_until'), user.id, actingId)
    .limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) return { ok: false as const, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  if (write && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) {
    return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  }
  return { ok: true as const, svc, salonId: Number(salon.id), userId: user.id };
}

export type ConecfEsutamaOption = {
  key: EsutamaOptKey; label: string; ready: boolean;
  auto: boolean; startMin: number; endMin: number; intervalMin: number; timesMin: number[];
  remaining: number | null; readAt: string | null; lastAt: string | null; lastOutcome: string | null;
};

/** ★ コネックエフのメニューに出すか（運営が1つでも ON にしている）。読めなければ出さない */
export async function hasConecfEsutamaOptions(salonId: number): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc.from('conecf_esutama_options').select('option_key').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    if (!error && (data ?? []).length > 0) return true;
    // ★ 第1811便: 投稿（リアルタイム集客）だけ ON の店も出す
    const p = await svc.from('conecf_esutama_posts').select('post_key').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !p.error && (p.data ?? []).length > 0;
  } catch { return false; }
}

export async function getConecfEsutamaOptions(): Promise<Result<{ options: ConecfEsutamaOption[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data, error } = await r.svc.from('conecf_esutama_options')
    .select('option_key, auto, start_min, end_min, interval_min, times_min, remaining, read_at, last_at, last_outcome')
    .eq('salon_id', r.salonId).eq('admin_enabled', true);
  if (error) return { ok: false, error: '読み込めませんでした。時間をおいてお試しください' };
  const options = ESUTAMA_OPT_KEYS.flatMap((key) => {
    const x = (data ?? []).find((d) => d.option_key === key);
    if (!x) return [];
    const def = ESUTAMA_OPT_DEFAULT[key];
    return [{
      key, label: ESUTAMA_OPT_LABEL[key], ready: ESUTAMA_OPT_READY[key],
      auto: x.auto === true,
      startMin: x.start_min == null ? def.startMin : Number(x.start_min),
      endMin: x.end_min == null ? def.endMin : Number(x.end_min),
      intervalMin: x.interval_min == null ? def.intervalMin : Number(x.interval_min),
      timesMin: Array.isArray(x.times_min) && x.times_min.length > 0 ? (x.times_min as number[]).map(Number) : (def.timesMin ?? []),
      remaining: x.remaining == null ? null : Number(x.remaining),
      readAt: (x.read_at as string | null) ?? null, lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null,
    }];
  });
  return { ok: true, data: { options } };
}

export async function saveConecfEsutamaOption(input: { key: string; auto: boolean; startMin: number; endMin: number; intervalMin: number; timesMin?: number[] }): Promise<Result<null>> {
  const key = okKey(input.key);
  if (!key) return { ok: false, error: 'オプションの指定が不正です' };
  if (!ESUTAMA_OPT_READY[key]) return { ok: false, error: 'このオプションはまだ準備中です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const s = { startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin) };
  if (!isValidEsutamaOptSetting(s)) return { ok: false, error: '時間帯か間隔の値が正しくありません' };
  // ★ 求人ワンクリックアピールの時刻（朝6時はじまりの分・1〜10個）
  const times = key === 'job_appeal' ? [...new Set((input.timesMin ?? []).map(Number))].filter((t) => Number.isInteger(t) && t >= 360 && t < 1800).sort((x, y) => x - y) : null;
  if (key === 'job_appeal' && (!times || times.length === 0 || times.length > 10)) return { ok: false, error: '押す時刻を1〜10個入れてください' };
  const { data, error } = await r.svc.from('conecf_esutama_options')
    .update({ auto: input.auto === true, start_min: s.startMin, end_min: s.endMin, interval_min: s.intervalMin, ...(times ? { times_min: times } : {}), updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('option_key', key).eq('admin_enabled', true).select('option_key');
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  if (!data || data.length === 0) return { ok: false, error: 'このオプションは使えるようになっていません。運営事務局までご連絡ください' };
  return { ok: true, data: null };
}

export async function runConecfEsutamaOptionNow(input: { key: string }): Promise<Result<{ note: string }>> {
  const key = okKey(input.key);
  if (!key) return { ok: false, error: 'オプションの指定が不正です' };
  if (!ESUTAMA_OPT_READY[key]) return { ok: false, error: 'このオプションはまだ準備中です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_esutama_options').select('option_key').eq('salon_id', r.salonId).eq('option_key', key).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: 'このオプションは使えるようになっていません。運営事務局までご連絡ください' };
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'esutama', slot: 1,
      intent: 'bump_push', actor: 'shop:' + r.userId,
      esutamaOpt: { key, force: true },
    });
    if (!f.ok) return { ok: false, error: f.note };
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] エステ魂オプションを始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── 運営（/admin）──
async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user && user.id === ADMIN_UUID;
}

export async function adminGetEsutamaOptions(salonId: number): Promise<Result<{ enabled: Record<string, boolean>; ready: Record<string, boolean> }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_esutama_options').select('option_key, admin_enabled').eq('salon_id', Number(salonId));
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1799便は流しましたか？）: ' + error.message };
  const enabled: Record<string, boolean> = {};
  for (const k of ESUTAMA_OPT_KEYS) enabled[k] = (data ?? []).some((d) => d.option_key === k && d.admin_enabled === true);
  return { ok: true, data: { enabled, ready: ESUTAMA_OPT_READY } };
}

export async function adminSetEsutamaOption(input: { salonId: number; key: string; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const key = okKey(input.key);
  const salonId = Number(input.salonId);
  if (!key || !Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const def = ESUTAMA_OPT_DEFAULT[key];
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_esutama_options').select('option_key').eq('salon_id', salonId).eq('option_key', key).maybeSingle();
  const res = cur
    ? await svc.from('conecf_esutama_options').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId).eq('option_key', key)
    : await svc.from('conecf_esutama_options').insert({ salon_id: salonId, option_key: key, admin_enabled: input.enabled === true, start_min: def.startMin, end_min: def.endMin, interval_min: def.intervalMin, ...(def.timesMin ? { times_min: def.timesMin } : {}) });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}

// ══ 第1811便: エステ魂【オプション】の投稿（リアルタイム集客）══
// ★ 表は conecf_esutama_posts（追加SQL_第1811便）。★ 送るのは中継の流れ（lib/esutamaPostFlow.ts）。周は /api/admin/ekichika-bump。
const okPostKey = (v: unknown): EsutamaPostKey | null => (ESUTAMA_POST_KEYS as string[]).includes(String(v)) ? (v as EsutamaPostKey) : null;

export type ConecfEsutamaPost = {
  key: EsutamaPostKey; label: string;
  auto: boolean; title: string; body: string; startMin: number; endMin: number; intervalMin: number;
  readAt: string | null; lastAt: string | null; lastOutcome: string | null;
  /** ★ 第1812便: 順番に使う画像（置き場と表示用の URL）と、次に使う番号 */
  images: Array<{ path: string; url: string }>; nextImage: number;
};

export async function getConecfEsutamaPosts(): Promise<Result<{ posts: ConecfEsutamaPost[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data, error } = await r.svc.from('conecf_esutama_posts')
    .select('post_key, auto, title, body, start_min, end_min, interval_min, read_at, last_at, last_outcome, images, next_image')
    .eq('salon_id', r.salonId).eq('admin_enabled', true);
  // ★ 表がまだ無い（SQL 未適用）ときは「無い」扱い（オプションの画面は出す）
  if (error) return { ok: true, data: { posts: [] } };
  const posts = ESUTAMA_POST_KEYS.flatMap((key) => {
    const x = (data ?? []).find((d) => d.post_key === key);
    if (!x) return [];
    return [{
      key, label: ESUTAMA_POST_LABEL[key], auto: x.auto === true,
      title: String(x.title ?? ''), body: String(x.body ?? ''),
      startMin: Number(x.start_min), endMin: Number(x.end_min), intervalMin: Number(x.interval_min),
      readAt: (x.read_at as string | null) ?? null, lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null,
      images: (Array.isArray(x.images) ? (x.images as string[]) : []).filter(isEsutamaPostImagePath)
        .map((path) => ({ path, url: r.svc.storage.from('salon-images').getPublicUrl(path).data.publicUrl })),
      nextImage: Number(x.next_image ?? 0),
    }];
  });
  return { ok: true, data: { posts } };
}

export async function saveConecfEsutamaPost(input: { key: string; auto: boolean; title: string; body: string; startMin: number; endMin: number; intervalMin: number }): Promise<Result<null>> {
  const key = okPostKey(input.key);
  if (!key) return { ok: false, error: '投稿の指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '').replace(/\r\n/g, '\n').trim();
  const p = esutamaPostTextProblem(title, body, key);
  if (p && (input.auto === true || title !== '' || body !== '')) return { ok: false, error: p };
  const s = { startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin) };
  if (!isValidEsutamaPostSetting(s, key)) return { ok: false, error: '時間帯か間隔の値が正しくありません' };
  const { data, error } = await r.svc.from('conecf_esutama_posts')
    .update({ auto: input.auto === true, title, body, start_min: s.startMin, end_min: s.endMin, interval_min: s.intervalMin, updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('post_key', key).eq('admin_enabled', true).select('post_key');
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  if (!data || data.length === 0) return { ok: false, error: 'この投稿は使えるようになっていません。運営事務局までご連絡ください' };
  return { ok: true, data: null };
}

/** ★ 保存してある文章で、いま1件投稿する */
export async function runConecfEsutamaPostNow(input: { key: string }): Promise<Result<{ note: string }>> {
  const key = okPostKey(input.key);
  if (!key) return { ok: false, error: '投稿の指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_esutama_posts').select('title, body, read_at, images, next_image').eq('salon_id', r.salonId).eq('post_key', key).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: 'この投稿は使えるようになっていません。運営事務局までご連絡ください' };
  const title = String(row.title ?? ''); const body = String(row.body ?? '');
  const p = esutamaPostTextProblem(title, body, key);
  if (p) return { ok: false, error: p + '（入れたら「保存」を押してください）' };
  // ★ 押し間違いで立て続けに投稿しない（2分以内は送らない）
  if (row.read_at && Date.now() - Date.parse(String(row.read_at)) < 2 * 60000) return { ok: false, error: 'いま送っているところです。2分ほどおいてください' };
  await r.svc.from('conecf_esutama_posts').update({ read_at: new Date().toISOString() }).eq('salon_id', r.salonId).eq('post_key', key);
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'esutama', slot: 1,
      intent: 'bump_push', actor: 'shop:' + r.userId,
      esutamaPost: { key, title, body, force: true, images: isDailyPostKey(key) ? [] : pickEsutamaPostImages(key, row.images, row.next_image) },
    });
    if (!f.ok) {
      await r.svc.from('conecf_esutama_posts').update({ read_at: (row.read_at as string | null) ?? null }).eq('salon_id', r.salonId).eq('post_key', key);
      return { ok: false, error: f.note };
    }
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] エステ魂の投稿を始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

export async function adminGetEsutamaPosts(salonId: number): Promise<Result<{ enabled: Record<string, boolean> }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_esutama_posts').select('post_key, admin_enabled').eq('salon_id', Number(salonId));
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1811便は流しましたか？）: ' + error.message };
  const enabled: Record<string, boolean> = {};
  for (const k of ESUTAMA_POST_KEYS) enabled[k] = (data ?? []).some((d) => d.post_key === k && d.admin_enabled === true);
  return { ok: true, data: { enabled } };
}

export async function adminSetEsutamaPost(input: { salonId: number; key: string; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const key = okPostKey(input.key);
  const salonId = Number(input.salonId);
  if (!key || !Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_esutama_posts').select('post_key').eq('salon_id', salonId).eq('post_key', key).maybeSingle();
  const res = cur
    ? await svc.from('conecf_esutama_posts').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId).eq('post_key', key)
    : await svc.from('conecf_esutama_posts').insert({ salon_id: salonId, post_key: key, admin_enabled: input.enabled === true, ...(isDailyPostKey(key)
        // ★ 第1817便: メールマガジンは1日1回。既定はベンリーと同じ 11:47
        ? { start_min: 707, end_min: 1800, interval_min: ESUTAMA_POST_DAILY }
        // ★ 第1822便: 求人ブログは1日10回まで。既定は 6:00〜翌1:00 を120分おき（＝10回・ベンリーと同じ）
        : key === 'job_blog' ? { start_min: 360, end_min: 1500, interval_min: 120 }
        : { start_min: ESUTAMA_POST_DEFAULT.startMin, end_min: ESUTAMA_POST_DEFAULT.endMin, interval_min: ESUTAMA_POST_DEFAULT.intervalMin }) });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}

// ── 第1812便: 投稿の画像（順番に使う・最大5枚）──
// ★ 置き場は salon-images/<店>/esutama_post_<時刻>.jpg（★ /api/relay/file はこの形だけ読める）。
// ★ サーバーで 600×600 の正方形（中央で切る）の JPEG に作り直す（エステ魂の枠は 300×300 の正方形）
const POST_IMAGE_MAX_UPLOAD = 950 * 1024;

export async function addConecfEsutamaPostImage(fd: FormData): Promise<Result<null>> {
  const key = okPostKey(fd.get('key'));
  if (!key) return { ok: false, error: '投稿の指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const file = fd.get('file');
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: '画像を選んでください' };
  if (file.size > POST_IMAGE_MAX_UPLOAD) return { ok: false, error: '画像が大きすぎます（もう少し小さい画像にしてください）' };
  const { data: row } = await r.svc.from('conecf_esutama_posts').select('images').eq('salon_id', r.salonId).eq('post_key', key).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: 'この投稿は使えるようになっていません。運営事務局までご連絡ください' };
  const images = (Array.isArray(row.images) ? (row.images as string[]) : []).filter(isEsutamaPostImagePath);
  if (images.length >= ESUTAMA_POST_IMAGE_MAX) return { ok: false, error: `画像は${ESUTAMA_POST_IMAGE_MAX}枚までです。どれかを消してから追加してください` };
  let out: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate()
      .resize({ width: 600, height: 600, fit: 'cover', position: 'centre' }).jpeg({ quality: 88 }).toBuffer();
  } catch {
    return { ok: false, error: '画像として読めませんでした（JPEG・PNG・WebP にしてください）' };
  }
  const path = `${r.salonId}/esutama_post_${Date.now()}.jpg`;
  const { error: upErr } = await r.svc.storage.from('salon-images').upload(path, out, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (upErr) return { ok: false, error: 'アップロードに失敗しました: ' + upErr.message };
  const { error } = await r.svc.from('conecf_esutama_posts').update({ images: [...images, path], updated_at: new Date().toISOString() }).eq('salon_id', r.salonId).eq('post_key', key);
  if (error) {
    await r.svc.storage.from('salon-images').remove([path]);
    return { ok: false, error: '保存に失敗しました: ' + error.message };
  }
  return { ok: true, data: null };
}

export async function removeConecfEsutamaPostImage(input: { key: string; path: string }): Promise<Result<null>> {
  const key = okPostKey(input.key);
  if (!key) return { ok: false, error: '投稿の指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const path = String(input.path ?? '');
  // ★ 自分の店の置き場だけ
  if (!isEsutamaPostImagePath(path) || !path.startsWith(r.salonId + '/')) return { ok: false, error: '画像の指定が不正です' };
  const { data: row } = await r.svc.from('conecf_esutama_posts').select('images').eq('salon_id', r.salonId).eq('post_key', key).maybeSingle();
  if (!row) return { ok: false, error: '見つかりませんでした' };
  const images = (Array.isArray(row.images) ? (row.images as string[]) : []).filter((p) => p !== path);
  const { error } = await r.svc.from('conecf_esutama_posts').update({ images, next_image: 0, updated_at: new Date().toISOString() }).eq('salon_id', r.salonId).eq('post_key', key);
  if (error) return { ok: false, error: '保存に失敗しました: ' + error.message };
  await r.svc.storage.from('salon-images').remove([path]);
  return { ok: true, data: null };
}
