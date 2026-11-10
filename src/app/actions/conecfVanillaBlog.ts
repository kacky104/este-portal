'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import {
  VANILLA_BLOG_ITEMS_MAX, VANILLA_BLOG_TITLE_MAX, VANILLA_BLOG_BODY_MAX,
  normalizeVanillaBlogItems, vanillaBlogItemProblem, sanitizeVanillaTimes, isVanillaBlogImagePath, pickVanillaBlogItem,
  type VanillaBlogItem,
} from '@/lib/vanillaBlog';

// バニラ（qzin.jp）の店長ブログの受け口（第1903便・2026-11-10・カッキーさん）。
// ★ 運営が /admin で ON（admin_enabled）にした店だけ、コネックエフに出る。店舗様は自動の ON/OFF・時刻・記事と「今すぐ投稿」。
// ★ 表は conecf_vanilla_blog（追加SQL_第1903便）。★ 送るのは中継の流れ（lib/vanillaBlogFlow.ts）。周は /api/admin/ekichika-bump。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

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

const NOT_OPEN = 'バニラ店長ブログは使えるようになっていません。運営事務局までご連絡ください';

export type ConecfVanillaBlog = {
  auto: boolean; timesMin: number[]; deleteOld: boolean;
  items: Array<VanillaBlogItem & { imageUrl: string | null }>; nextItem: number;
  readAt: string | null; lastAt: string | null; lastOutcome: string | null;
  /** バニラの ID・パスワードが登録されているか（無ければ画面で「ID・パスワード登録」へ案内する） */
  hasLogin: boolean;
};

/** ★ コネックエフのメニューに出すか（運営が ON にしている）。読めなければ出さない */
export async function hasConecfVanillaBlog(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_vanilla_blog').select('salon_id').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}

export async function getConecfVanillaBlog(): Promise<Result<ConecfVanillaBlog | null>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data: x, error } = await r.svc.from('conecf_vanilla_blog')
    .select('auto, times_min, items, next_item, delete_old, read_at, last_at, last_outcome')
    .eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (error || !x) return { ok: true, data: null };
  const { data: cred } = await r.svc.from('salon_media_credentials').select('slot').eq('salon_id', r.salonId).eq('provider', 'vanilla').eq('slot', 1).maybeSingle();
  return {
    ok: true,
    data: {
      auto: x.auto === true,
      timesMin: sanitizeVanillaTimes(x.times_min),
      deleteOld: x.delete_old !== false,
      items: normalizeVanillaBlogItems(x.items).map((it) => ({ ...it, imageUrl: it.image ? r.svc.storage.from('salon-images').getPublicUrl(it.image).data.publicUrl : null })),
      nextItem: Number(x.next_item ?? 0),
      readAt: (x.read_at as string | null) ?? null, lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null,
      hasLogin: !!cred,
    },
  };
}

export async function saveConecfVanillaBlog(input: {
  auto: boolean; timesMin: number[]; deleteOld: boolean; items: Array<{ title: string; body: string; image: string | null }>;
}): Promise<Result<null>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const times = sanitizeVanillaTimes(input.timesMin);
  const list = (input.items ?? []).slice(0, VANILLA_BLOG_ITEMS_MAX).map((x) => ({
    title: String(x.title ?? '').replace(/\r\n?|\n/g, ' ').trim(),
    body: String(x.body ?? '').replace(/\r\n?/g, '\n').trim(),
    image: typeof x.image === 'string' && isVanillaBlogImagePath(x.image) && x.image.startsWith(r.salonId + '/') ? x.image : null,
  }));
  for (const [i, it] of list.entries()) {
    if ([...it.title].length > VANILLA_BLOG_TITLE_MAX) return { ok: false, error: `${i + 1}本目のタイトルは${VANILLA_BLOG_TITLE_MAX}文字までです` };
    if (it.body.length > VANILLA_BLOG_BODY_MAX) return { ok: false, error: `${i + 1}本目の本文は${VANILLA_BLOG_BODY_MAX}文字までです` };
    const p = vanillaBlogItemProblem(it);
    if (p) return { ok: false, error: `${i + 1}本目: ${p}` };
  }
  if (input.auto === true && list.length === 0) return { ok: false, error: '投稿する記事を1本以上入れてください' };
  if (input.auto === true && times.length === 0) return { ok: false, error: '投稿する時刻を1つ以上入れてください' };
  const { data: cur } = await r.svc.from('conecf_vanilla_blog').select('items, next_item').eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (!cur) return { ok: false, error: NOT_OPEN };
  // ★ 外した画像は置き場からも消す
  const before = normalizeVanillaBlogItems(cur.items).map((x) => x.image).filter((x): x is string => !!x);
  const after = new Set(list.map((x) => x.image).filter(Boolean));
  const gone = before.filter((p) => !after.has(p) && p.startsWith(r.salonId + '/'));
  if (gone.length > 0) await r.svc.storage.from('salon-images').remove(gone);
  const nextItem = list.length > 0 ? Number(cur.next_item ?? 0) % list.length : 0;
  const { error } = await r.svc.from('conecf_vanilla_blog')
    .update({ auto: input.auto === true, times_min: times, delete_old: input.deleteOld !== false, items: list, next_item: nextItem, updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('admin_enabled', true);
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: null };
}

/** ★ 保存してある記事の「次の1本」を、いま1回投稿する */
export async function runConecfVanillaBlogNow(): Promise<Result<{ note: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_vanilla_blog').select('items, next_item, delete_old, last_blog_id, read_at').eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: NOT_OPEN };
  if (row.read_at && Date.now() - Date.parse(String(row.read_at)) < 2 * 60000) return { ok: false, error: 'いま投稿しているところです。2分ほどおいてください' };
  const pick = pickVanillaBlogItem(normalizeVanillaBlogItems(row.items), Number(row.next_item ?? 0));
  if (!pick) return { ok: false, error: '投稿する記事がありません（入れたら「保存」を押してください）' };
  await r.svc.from('conecf_vanilla_blog').update({ read_at: new Date().toISOString() }).eq('salon_id', r.salonId);
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'vanilla', slot: 1, intent: 'bump_push', actor: 'shop:' + r.userId,
      vanillaBlog: { item: pick.item, index: pick.index, deleteOld: row.delete_old !== false, prevId: (row.last_blog_id as string | null) ?? null, force: true },
    });
    if (!f.ok) {
      await r.svc.from('conecf_vanilla_blog').update({ read_at: (row.read_at as string | null) ?? null }).eq('salon_id', r.salonId);
      return { ok: false, error: f.note };
    }
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] バニラ店長ブログを始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── 記事の画像（1本に1枚）──
// ★ 置き場は salon-images/<店>/vanilla_blog_<時刻>.jpg（★ /api/relay/file はこの形だけ読める）。
//   ★ バニラは 300×300・500KB まで。送るときに取りに来た口で 300×300 に切る。ここでは長い辺 1200px の JPEG に作り直すだけ
const IMAGE_MAX_UPLOAD = 950 * 1024;

export async function uploadConecfVanillaBlogImage(fd: FormData): Promise<Result<{ path: string; url: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_vanilla_blog').select('salon_id').eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: NOT_OPEN };
  const file = fd.get('file');
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: '画像を選んでください' };
  if (file.size > IMAGE_MAX_UPLOAD) return { ok: false, error: '画像が大きすぎます（もう少し小さい画像にしてください）' };
  let out: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch {
    return { ok: false, error: '画像として読めませんでした（JPEG・PNG・WebP にしてください）' };
  }
  const path = `${r.salonId}/vanilla_blog_${Date.now()}.jpg`;
  const { error } = await r.svc.storage.from('salon-images').upload(path, out, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) return { ok: false, error: 'アップロードに失敗しました: ' + error.message };
  return { ok: true, data: { path, url: r.svc.storage.from('salon-images').getPublicUrl(path).data.publicUrl } };
}

// ── 運営 ──
export async function adminGetVanillaBlog(salonId: number): Promise<Result<{ enabled: boolean }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_vanilla_blog').select('admin_enabled').eq('salon_id', Number(salonId)).maybeSingle();
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1903便は流しましたか？）: ' + error.message };
  return { ok: true, data: { enabled: data?.admin_enabled === true } };
}

export async function adminSetVanillaBlog(input: { salonId: number; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const salonId = Number(input.salonId);
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_vanilla_blog').select('salon_id').eq('salon_id', salonId).maybeSingle();
  const res = cur
    ? await svc.from('conecf_vanilla_blog').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId)
    : await svc.from('conecf_vanilla_blog').insert({ salon_id: salonId, admin_enabled: input.enabled === true });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}
