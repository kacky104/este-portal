'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import {
  ZENKOKU_OPT_KEYS, ZENKOKU_OPT_LABEL, ZENKOKU_OPT_DEFAULT_TIMES, ZENKOKU_NEWS_MAX, ZENKOKU_NEWS_TITLE_MAX, ZENKOKU_NEWS_BODY_MAX, ZENKOKU_RECOMMEND_MAX,
  normalizeNewsItems, normalizeRecItems, newsItemProblem, sanitizeTimes, isZenkokuNewsImagePath, zenkokuBusinessMin,
  type ZenkokuOptKey, type ZenkokuNewsItem, type ZenkokuRecItem,
} from '@/lib/zenkokuOption';

// 全国エステランキングの「ニュース」「おすすめセラピスト」の受け口（第1831便・2026-11-09・カッキーさん）。
// ★ 運営が /admin で ON（admin_enabled）にした店だけ、コネックエフに出る。店舗様は自動の ON/OFF・時刻・中身と「今すぐ」。
// ★ 表は conecf_zenkoku_options（追加SQL_第1831便）。★ 送るのは中継の流れ（lib/zenkokuOptionFlow.ts）。周は /api/admin/ekichika-bump。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const okKey = (v: unknown): ZenkokuOptKey | null => (ZENKOKU_OPT_KEYS as string[]).includes(String(v)) ? (v as ZenkokuOptKey) : null;

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

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user && user.id === ADMIN_UUID;
}

export type ConecfZenkokuOption = {
  key: ZenkokuOptKey; label: string; auto: boolean; timesMin: number[];
  news: Array<ZenkokuNewsItem & { imageUrl: string | null }>; recommend: ZenkokuRecItem[]; nextItem: number;
  remaining: number | null; readAt: string | null; lastAt: string | null; lastOutcome: string | null;
};

/** ★ コネックエフのメニューに出すか（運営が1つでも ON にしている）。読めなければ出さない */
export async function hasConecfZenkokuOptions(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_zenkoku_options').select('option_key').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}

export async function getConecfZenkokuOptions(): Promise<Result<{ options: ConecfZenkokuOption[]; therapists: string[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data, error } = await r.svc.from('conecf_zenkoku_options')
    .select('option_key, auto, times_min, items, next_item, remaining, read_at, last_at, last_outcome')
    .eq('salon_id', r.salonId).eq('admin_enabled', true);
  if (error) return { ok: true, data: { options: [], therapists: [] } };
  const options = ZENKOKU_OPT_KEYS.flatMap((key) => {
    const x = (data ?? []).find((d) => d.option_key === key);
    if (!x) return [];
    const times = sanitizeTimes(x.times_min, key);
    return [{
      key, label: ZENKOKU_OPT_LABEL[key], auto: x.auto === true,
      timesMin: times.length > 0 ? times : ZENKOKU_OPT_DEFAULT_TIMES[key],
      news: key === 'news' ? normalizeNewsItems(x.items).map((it) => ({ ...it, imageUrl: it.image ? r.svc.storage.from('salon-images').getPublicUrl(it.image).data.publicUrl : null })) : [],
      recommend: key === 'recommend' ? normalizeRecItems(x.items) : [],
      nextItem: Number(x.next_item ?? 0),
      remaining: x.remaining == null ? null : Number(x.remaining),
      readAt: (x.read_at as string | null) ?? null, lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null,
    }];
  });
  // ★ おすすめのリストに入れられる方（フクエスに登録しているセラピスト）
  let therapists: string[] = [];
  if (options.some((o) => o.key === 'recommend')) {
    const t = await r.svc.from('therapists').select('name').eq('salon_id', r.salonId).order('name');
    therapists = t.error ? [] : [...new Set((t.data ?? []).map((d) => String(d.name ?? '').trim()).filter(Boolean))];
  }
  return { ok: true, data: { options, therapists } };
}

export async function saveConecfZenkokuOption(input: {
  key: string; auto: boolean; timesMin: number[];
  news?: Array<{ title: string; body: string; image: string | null }>; recommend?: Array<{ name: string }>;
}): Promise<Result<null>> {
  const key = okKey(input.key);
  if (!key) return { ok: false, error: '指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const times = sanitizeTimes(input.timesMin, key);
  if (times.length === 0) return { ok: false, error: '時刻を入れてください（例: 6:11）' };
  let items: unknown[] = [];
  if (key === 'news') {
    const list = (input.news ?? []).slice(0, ZENKOKU_NEWS_MAX).map((x) => ({
      title: String(x.title ?? '').trim(), body: String(x.body ?? '').replace(/\r\n/g, '\n').trim(),
      image: typeof x.image === 'string' && isZenkokuNewsImagePath(x.image) && x.image.startsWith(r.salonId + '/') ? x.image : null,
    }));
    for (const [i, it] of list.entries()) {
      if (it.title.length > ZENKOKU_NEWS_TITLE_MAX) return { ok: false, error: `${i + 1}件目の題名は${ZENKOKU_NEWS_TITLE_MAX}文字までです` };
      if (it.body.length > ZENKOKU_NEWS_BODY_MAX) return { ok: false, error: `${i + 1}件目の本文は${ZENKOKU_NEWS_BODY_MAX}文字までです` };
      const p = newsItemProblem(it);
      if (p) return { ok: false, error: `${i + 1}件目: ${p}` };
    }
    if (input.auto === true && list.length === 0) return { ok: false, error: '投稿する中身を1件以上入れてください' };
    items = list;
  } else {
    const list = (input.recommend ?? []).map((x) => ({ name: String(x.name ?? '').trim().slice(0, 40) })).filter((x) => x.name !== '').slice(0, ZENKOKU_RECOMMEND_MAX);
    if (input.auto === true && list.length === 0) return { ok: false, error: 'おすすめにするセラピストを1人以上選んでください' };
    items = list;
  }
  const { data: cur } = await r.svc.from('conecf_zenkoku_options').select('items, next_item').eq('salon_id', r.salonId).eq('option_key', key).eq('admin_enabled', true).maybeSingle();
  if (!cur) return { ok: false, error: 'このオプションは使えるようになっていません。運営事務局までご連絡ください' };
  // ★ ニュースで外した画像は置き場からも消す
  if (key === 'news') {
    const before = normalizeNewsItems(cur.items).map((x) => x.image).filter((x): x is string => !!x);
    const after = new Set((items as ZenkokuNewsItem[]).map((x) => x.image).filter(Boolean));
    const gone = before.filter((p) => !after.has(p) && p.startsWith(r.salonId + '/'));
    if (gone.length > 0) await r.svc.storage.from('salon-images').remove(gone);
  }
  const nextItem = key === 'recommend' && items.length > 0 ? Number(cur.next_item ?? 0) % items.length : 0;
  const { error } = await r.svc.from('conecf_zenkoku_options')
    .update({ auto: input.auto === true, times_min: times, items, next_item: nextItem, updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('option_key', key).eq('admin_enabled', true);
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: null };
}

/** ★ 保存してある中身で、いま1回送る（ニュースは今の時刻にいちばん近い過去の枠の中身・無ければ1件目／おすすめは次の方） */
export async function runConecfZenkokuOptionNow(input: { key: string }): Promise<Result<{ note: string }>> {
  const key = okKey(input.key);
  if (!key) return { ok: false, error: '指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_zenkoku_options').select('times_min, items, next_item, read_at').eq('salon_id', r.salonId).eq('option_key', key).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: 'このオプションは使えるようになっていません。運営事務局までご連絡ください' };
  if (row.read_at && Date.now() - Date.parse(String(row.read_at)) < 2 * 60000) return { ok: false, error: 'いま送っているところです。2分ほどおいてください' };
  let zenkokuOpt: Parameters<typeof startRelayFlow>[0]['zenkokuOpt'];
  if (key === 'news') {
    const news = normalizeNewsItems(row.items);
    if (news.length === 0) return { ok: false, error: '投稿する中身がありません（入れたら「保存」を押してください）' };
    const times = sanitizeTimes(row.times_min, key);
    const b = zenkokuBusinessMin(new Date());
    let slot = 0;
    times.forEach((t, i) => { if (t <= b) slot = i; });
    const item = news[slot % news.length];
    const p = newsItemProblem(item);
    if (p) return { ok: false, error: p };
    zenkokuOpt = { key, force: true, item };
  } else {
    const recs = normalizeRecItems(row.items);
    if (recs.length === 0) return { ok: false, error: 'おすすめにするセラピストを選んで「保存」を押してください' };
    zenkokuOpt = { key, force: true, items: recs, nextIndex: Number(row.next_item ?? 0) };
  }
  await r.svc.from('conecf_zenkoku_options').update({ read_at: new Date().toISOString() }).eq('salon_id', r.salonId).eq('option_key', key);
  try {
    const f = await startRelayFlow({ salonId: r.salonId, provider: 'zenkoku', slot: 1, intent: 'bump_push', actor: 'shop:' + r.userId, zenkokuOpt });
    if (!f.ok) {
      await r.svc.from('conecf_zenkoku_options').update({ read_at: (row.read_at as string | null) ?? null }).eq('salon_id', r.salonId).eq('option_key', key);
      return { ok: false, error: f.note };
    }
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] 全国のオプションを始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── ニュースの画像（1件に1枚）──
// ★ 置き場は salon-images/<店>/zenkoku_news_<時刻>.jpg（★ /api/relay/file はこの形だけ読める）。長い辺 1200px の JPEG に作り直す
const NEWS_IMAGE_MAX_UPLOAD = 950 * 1024;

export async function uploadConecfZenkokuNewsImage(fd: FormData): Promise<Result<{ path: string; url: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_zenkoku_options').select('option_key').eq('salon_id', r.salonId).eq('option_key', 'news').eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: 'このオプションは使えるようになっていません。運営事務局までご連絡ください' };
  const file = fd.get('file');
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: '画像を選んでください' };
  if (file.size > NEWS_IMAGE_MAX_UPLOAD) return { ok: false, error: '画像が大きすぎます（もう少し小さい画像にしてください）' };
  let out: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch {
    return { ok: false, error: '画像として読めませんでした（JPEG・PNG・WebP にしてください）' };
  }
  const path = `${r.salonId}/zenkoku_news_${Date.now()}.jpg`;
  const { error } = await r.svc.storage.from('salon-images').upload(path, out, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) return { ok: false, error: 'アップロードに失敗しました: ' + error.message };
  // ★ 表に入るのは「保存」を押したとき（押さずに離れた画像は残るが、小さいので気にしない）
  return { ok: true, data: { path, url: r.svc.storage.from('salon-images').getPublicUrl(path).data.publicUrl } };
}

// ── 運営 ──
export async function adminGetZenkokuOptions(salonId: number): Promise<Result<{ enabled: Record<string, boolean> }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_zenkoku_options').select('option_key, admin_enabled').eq('salon_id', Number(salonId));
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1831便は流しましたか？）: ' + error.message };
  const enabled: Record<string, boolean> = {};
  for (const k of ZENKOKU_OPT_KEYS) enabled[k] = (data ?? []).some((d) => d.option_key === k && d.admin_enabled === true);
  return { ok: true, data: { enabled } };
}

export async function adminSetZenkokuOption(input: { salonId: number; key: string; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const key = okKey(input.key);
  const salonId = Number(input.salonId);
  if (!key || !Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_zenkoku_options').select('option_key').eq('salon_id', salonId).eq('option_key', key).maybeSingle();
  const res = cur
    ? await svc.from('conecf_zenkoku_options').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId).eq('option_key', key)
    : await svc.from('conecf_zenkoku_options').insert({ salon_id: salonId, option_key: key, admin_enabled: input.enabled === true, times_min: ZENKOKU_OPT_DEFAULT_TIMES[key] });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}
