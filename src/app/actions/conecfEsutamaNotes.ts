'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { loadCastIds } from '@/lib/mediaCastIds';
import { isValidEsutamaPostSetting } from '@/lib/esutamaPost';
import {
  normalizeEsutamaNoteItems, esutamaNoteItemProblem, pickEsutamaNoteItem,
  ESUTAMA_NOTE_DEFAULT, type EsutamaNoteItem,
} from '@/lib/esutamaNote';

// エステ魂の写メNote（第1941便・2026-11-11・カッキーさん）。★ 決まりは lib/esutamaNote.ts。
// ★ 表は conecf_esutama_notes（追加SQL_第1941便）。運営が /admin で ON（admin_enabled）にした店だけコネックエフに出る。
// ★ 送るのは中継の流れ（intent='diary_auto' ＋ esutamaNote・代理ログイン）。周は /api/admin/ekichika-bump（5分ごと）。
// ★ 書き込み（保存・今すぐ）は「コネックエフに切り替え済み」でセットを契約している自店だけ（エステ魂オプションと同じ守り）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ESUTAMA_SLOT = 1;

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

export type ConecfEsutamaNoteTherapist = { id: number; name: string; linked: boolean };
export type ConecfEsutamaNote = {
  auto: boolean; startMin: number; endMin: number; intervalMin: number;
  items: Array<EsutamaNoteItem & { imageUrls: string[] }>;
  nextIndex: number; readAt: string | null; lastAt: string | null; lastOutcome: string | null;
  therapists: ConecfEsutamaNoteTherapist[];
};

/** 在籍のセラピストと、エステ魂（枠1）の名簿と結びついているか */
async function therapistsOf(svc: ReturnType<typeof createServiceClient>, salonId: number): Promise<ConecfEsutamaNoteTherapist[]> {
  const { data } = await svc.from('therapists').select('id, name').eq('salon_id', salonId).eq('is_active', true).order('id', { ascending: true });
  const rows = (data ?? []).map((t) => ({ id: Number(t.id), name: String(t.name ?? '') }));
  const { maps } = await loadCastIds(svc, { therapists: rows.map((t) => ({ id: t.id })), provider: 'esutama', slot: ESUTAMA_SLOT });
  return rows.map((t) => ({ ...t, linked: !!maps.castIdOf.get(t.id) }));
}

/** ★ 使えない店（運営が ON にしていない・表が無い）は null */
export async function getConecfEsutamaNote(): Promise<Result<ConecfEsutamaNote | null>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data, error } = await r.svc.from('conecf_esutama_notes')
    .select('auto, items, start_min, end_min, interval_min, next_index, read_at, last_at, last_outcome')
    .eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (error || !data) return { ok: true, data: null };
  const url = (p: string) => r.svc.storage.from('salon-images').getPublicUrl(p).data.publicUrl;
  return {
    ok: true,
    data: {
      auto: data.auto === true,
      startMin: Number(data.start_min), endMin: Number(data.end_min), intervalMin: Number(data.interval_min),
      items: normalizeEsutamaNoteItems(data.items).map((it) => ({ ...it, imageUrls: it.images.map(url) })),
      nextIndex: Number(data.next_index ?? 0),
      readAt: (data.read_at as string | null) ?? null, lastAt: (data.last_at as string | null) ?? null, lastOutcome: (data.last_outcome as string | null) ?? null,
      therapists: await therapistsOf(r.svc, r.salonId),
    },
  };
}

export async function saveConecfEsutamaNote(input: { auto: boolean; startMin: number; endMin: number; intervalMin: number; items: unknown }): Promise<Result<null>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const items = normalizeEsutamaNoteItems(input.items).map((it) => ({ ...it, title: it.title.trim(), body: it.body.replace(/\r\n/g, '\n').trim() }));
  // ★ 自分の店の置き場の画像だけ
  for (const it of items) it.images = it.images.filter((p) => p.startsWith(r.salonId + '/'));
  for (let i = 0; i < items.length; i++) {
    const p = esutamaNoteItemProblem(items[i]);
    if (p) return { ok: false, error: `${i + 1}件目: ${p}` };
  }
  if (input.auto === true && items.length === 0) return { ok: false, error: '投稿内容を1件以上入れてください' };
  const s = { startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin) };
  if (!isValidEsutamaPostSetting(s)) return { ok: false, error: '時間帯か間隔の値が正しくありません' };
  // ★ 選べるのは自分の店の在籍だけ
  const ths = await therapistsOf(r.svc, r.salonId);
  for (let i = 0; i < items.length; i++) {
    if (!ths.some((t) => t.id === items[i].therapistId)) return { ok: false, error: `${i + 1}件目: セラピストを選び直してください` };
  }
  const { data: cur } = await r.svc.from('conecf_esutama_notes').select('items, next_index').eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (!cur) return { ok: false, error: '写メNoteは使えるようになっていません。運営事務局までご連絡ください' };
  const { error } = await r.svc.from('conecf_esutama_notes').update({
    auto: input.auto === true, items, start_min: s.startMin, end_min: s.endMin, interval_min: s.intervalMin,
    // ★ 件数が減って次の番号がはみ出したら、先頭から
    next_index: Number(cur.next_index ?? 0) < items.length ? Number(cur.next_index ?? 0) : 0,
    updated_at: new Date().toISOString(),
  }).eq('salon_id', r.salonId);
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  // ★ 使わなくなった画像を片づける（自分の店の写メNote の置き場だけ）
  const before = normalizeEsutamaNoteItems(cur.items).flatMap((it) => it.images);
  const now = new Set(items.flatMap((it) => it.images));
  const gone = before.filter((p) => !now.has(p) && p.startsWith(r.salonId + '/'));
  if (gone.length > 0) await r.svc.storage.from('salon-images').remove(gone);
  return { ok: true, data: null };
}

/** ★ 保存してある内容の「次の1件」を、いま投稿する */
export async function runConecfEsutamaNoteNow(): Promise<Result<{ note: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_esutama_notes').select('items, next_index, read_at').eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: '写メNoteは使えるようになっていません。運営事務局までご連絡ください' };
  const pick = pickEsutamaNoteItem(normalizeEsutamaNoteItems(row.items), Number(row.next_index ?? 0));
  if (!pick) return { ok: false, error: '送れる投稿内容がありません（タイトル・本文・セラピストを入れて「設定を保存」を押してください）' };
  // ★ 押し間違いで立て続けに投稿しない（3分以内は送らない）
  if (row.read_at && Date.now() - Date.parse(String(row.read_at)) < 3 * 60000) return { ok: false, error: 'いま送っているところです。3分ほどおいてください' };
  await r.svc.from('conecf_esutama_notes').update({ read_at: new Date().toISOString() }).eq('salon_id', r.salonId);
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'esutama', slot: ESUTAMA_SLOT,
      intent: 'diary_auto', actor: 'shop:' + r.userId,
      esutamaNote: { index: pick.index, nextIndex: pick.nextIndex, therapistId: pick.item.therapistId as number, title: pick.item.title, body: pick.item.body, categoryId: pick.item.categoryId, images: pick.item.images },
    });
    if (!f.ok) {
      await r.svc.from('conecf_esutama_notes').update({ read_at: (row.read_at as string | null) ?? null }).eq('salon_id', r.salonId);
      return { ok: false, error: f.note };
    }
    return { ok: true, data: { note: `${pick.index + 1}件目を送ります。代理ログインで投稿するので、数分かかります` } };
  } catch (e) {
    console.error('[conecf] 写メNote を始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── 画像（1件に3枚まで）。★ 置き場は salon-images/<店>/esutama_note_<時刻>.jpg。上げた時点では表に書かない（「設定を保存」で決まる）
const NOTE_IMAGE_MAX_UPLOAD = 4 * 1024 * 1024;
export async function uploadConecfEsutamaNoteImage(fd: FormData): Promise<Result<{ path: string; url: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_esutama_notes').select('salon_id').eq('salon_id', r.salonId).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: '写メNoteは使えるようになっていません。運営事務局までご連絡ください' };
  const file = fd.get('file');
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: '画像を選んでください' };
  if (file.size > NOTE_IMAGE_MAX_UPLOAD) return { ok: false, error: '画像が大きすぎます（4MB まで）' };
  let out: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    // ★ 送るときに 714×1112 に整える（lib/esutamaDiaryPhoto.ts）。ここでは長い辺 1600 までに縮めるだけ
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  } catch {
    return { ok: false, error: '画像として読めませんでした（JPEG・PNG・WebP にしてください）' };
  }
  const path = `${r.salonId}/esutama_note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await r.svc.storage.from('salon-images').upload(path, out, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) return { ok: false, error: 'アップロードに失敗しました: ' + error.message };
  return { ok: true, data: { path, url: r.svc.storage.from('salon-images').getPublicUrl(path).data.publicUrl } };
}

// ── 運営（/admin）の ON/OFF ──
async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id === ADMIN_UUID;
}
export async function adminGetEsutamaNote(salonId: number): Promise<Result<{ enabled: boolean; ready: boolean }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_esutama_notes').select('admin_enabled').eq('salon_id', Number(salonId)).maybeSingle();
  if (error) return { ok: true, data: { enabled: false, ready: false } };   // ★ 表が無い（追加SQL_第1941便 未実行）
  return { ok: true, data: { enabled: data?.admin_enabled === true, ready: true } };
}
export async function adminSetEsutamaNote(input: { salonId: number; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const salonId = Number(input.salonId);
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_esutama_notes').select('salon_id').eq('salon_id', salonId).maybeSingle();
  const res = cur
    ? await svc.from('conecf_esutama_notes').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId)
    : await svc.from('conecf_esutama_notes').insert({ salon_id: salonId, admin_enabled: input.enabled === true, start_min: ESUTAMA_NOTE_DEFAULT.startMin, end_min: ESUTAMA_NOTE_DEFAULT.endMin, interval_min: ESUTAMA_NOTE_DEFAULT.intervalMin });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}
