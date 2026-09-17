'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { firstImportPhase, type FirstImportPhase } from '@/lib/conecfFirstImport';

// コネックエフ「駅ちかから最初に1回だけ取り込む」の受け口（第406便・2026-09-17）。
// ★ 押すのは店舗様（切り替え済みの自店だけ）。★ 1店舗1回だけ（★ 戻すのは運営が SQL で）。
// ★ 実際に駅ちかを読むのは VPS（/api/import/targets → ingest）。★ ここは「押した」を記録するだけ。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc
    .from('salons')
    .select('id, conecf_enabled_at, conecf_import_requested_at, conecf_import_started_at, conecf_import_done_at')
    .eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  return { ok: true as const, svc, salon };
}

export type FirstImportStatus = {
  enabled: boolean;
  phase: FirstImportPhase;
  hasEkichika: boolean;
  requestedAt: string | null;
  doneAt: string | null;
  summary: { created: number; matched: number; schedules: number; unmatched: string[]; errors: number } | null;
};

export async function getConecfFirstImport(): Promise<Result<FirstImportStatus>> {
  const r = await resolve();
  if (!r.ok) return r;
  const { svc, salon } = r;
  const startedAt = (salon.conecf_import_started_at as string | null) ?? null;
  const phase = firstImportPhase({
    requestedAt: (salon.conecf_import_requested_at as string | null) ?? null,
    startedAt,
    doneAt: (salon.conecf_import_done_at as string | null) ?? null,
  });
  const { data: srcs } = await svc
    .from('salon_import_sources').select('id')
    .eq('salon_id', salon.id).eq('provider', 'ekichika')
    .not('shop_url', 'is', null).not('external_id', 'is', null);
  const ids = (srcs ?? []).map((s) => Number(s.id));

  let summary: FirstImportStatus['summary'] = null;
  if (startedAt && ids.length > 0) {
    const { data: runs } = await svc
      .from('salon_import_runs')
      .select('status, matched, created, schedules_upserted, unmatched')
      .in('source_id', ids)
      .gte('started_at', startedAt);
    // ★ done の少しあとまでの ingest（最初の1回ぶん）だけを数えたいが、切り替え済みの店は ふだんの取り込みが走らないので、started 以降は全部この1回ぶん
    const rs = runs ?? [];
    const un = new Set<string>();
    rs.forEach((x) => ((x.unmatched as string[] | null) ?? []).forEach((n) => un.add(n)));
    summary = {
      created: rs.reduce((a, x) => a + Number(x.created ?? 0), 0),
      matched: rs.reduce((a, x) => a + Number(x.matched ?? 0), 0),
      schedules: rs.reduce((a, x) => a + Number(x.schedules_upserted ?? 0), 0),
      unmatched: [...un].slice(0, 30),
      errors: rs.filter((x) => x.status === 'error').length,
    };
  }
  return {
    ok: true,
    data: {
      enabled: !!salon.conecf_enabled_at,
      phase,
      hasEkichika: ids.length > 0,
      requestedAt: (salon.conecf_import_requested_at as string | null) ?? null,
      doneAt: (salon.conecf_import_done_at as string | null) ?? null,
      summary,
    },
  };
}

export async function requestConecfFirstImport(): Promise<Result<{ requestedAt: string }>> {
  const r = await resolve();
  if (!r.ok) return r;
  const { svc, salon } = r;
  if (!salon.conecf_enabled_at) return { ok: false, error: '取り込むには、ホームで「コネックエフに切り替える」を押してください' };
  if (salon.conecf_import_requested_at) return { ok: false, error: '駅ちかからの取り込みは、すでに1回行っています' };
  const { count } = await svc
    .from('salon_import_sources').select('id', { count: 'exact', head: true })
    .eq('salon_id', salon.id).eq('provider', 'ekichika')
    .not('shop_url', 'is', null).not('external_id', 'is', null);
  if (!count) return { ok: false, error: '駅ちかの店舗ページが登録されていないため取り込めません。運営までご連絡ください' };
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from('salons').update({ conecf_import_requested_at: now })
    .eq('id', salon.id).is('conecf_import_requested_at', null)
    .select('id');
  if (error) return { ok: false, error: `受け付けできませんでした: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: '駅ちかからの取り込みは、すでに1回行っています' };
  return { ok: true, data: { requestedAt: now } };
}

// ── ★★ 第427便: 駅ちかの写真だけ取り込む（1店舗1回）──────────────────
//   ★ しくみは最初の1回と同じ（salons.conecf_photo_import_* → targets → ingest）。
//   ★ 取り込むのはコネックエフの写真が0枚の人だけ（src/lib/ekichikaCastPhotos.ts）。

export type PhotoImportStatus = {
  enabled: boolean;
  phase: FirstImportPhase;
  hasEkichika: boolean;
  /** ★ 最初の1回を押して、まだ終わっていない（★ そのあいだは写真だけは押せない・最初の1回でも写真は入る） */
  firstImportBusy: boolean;
  /** 写真のない女性の人数（★ ボタンを出すかの目安） */
  noPhotoCount: number;
  /** 取り込み完了の時刻（★ 第435便: 完了の知らせは24時間だけ出す） */
  doneAt: string | null;
  /** 取り込んだ人数・枚数（started 以降の記録から） */
  summary: { people: number; photos: number } | null;
};

async function resolvePhoto() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon, error } = await svc
    .from('salons')
    .select('id, conecf_enabled_at, conecf_import_requested_at, conecf_import_done_at, conecf_photo_import_requested_at, conecf_photo_import_started_at, conecf_photo_import_done_at')
    .eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle();
  if (error) return { ok: false as const, error: '写真の取り込みの準備ができていません（SQL 未適用）' };
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  return { ok: true as const, svc, salon: salon as Record<string, unknown> & { id: number } };
}

export async function getConecfPhotoImport(): Promise<Result<PhotoImportStatus>> {
  const r = await resolvePhoto();
  if (!r.ok) return r;
  const { svc, salon } = r;
  const startedAt = (salon.conecf_photo_import_started_at as string | null) ?? null;
  const phase = firstImportPhase({
    requestedAt: (salon.conecf_photo_import_requested_at as string | null) ?? null,
    startedAt,
    doneAt: (salon.conecf_photo_import_done_at as string | null) ?? null,
  });
  const { count: srcCount } = await svc
    .from('salon_import_sources').select('id', { count: 'exact', head: true })
    .eq('salon_id', salon.id).eq('provider', 'ekichika')
    .not('shop_url', 'is', null).not('external_id', 'is', null);
  const { data: ths } = await svc.from('therapists').select('id, profile_image_url, profile_images').eq('salon_id', salon.id);
  const list = (ths ?? []) as Array<{ id: number; profile_image_url: string | null; profile_images: string[] | null }>;
  const noPhotoCount = list.filter((t) => !t.profile_image_url && !(t.profile_images ?? []).some((x) => !!x)).length;

  let summary: PhotoImportStatus['summary'] = null;
  if (startedAt && list.length > 0) {
    const { data: rows } = await svc.from('conecf_photo_pushes').select('therapist_id')
      .in('therapist_id', list.map((t) => t.id)).eq('provider', 'ekichika').gte('pushed_at', startedAt);
    const rs = (rows ?? []) as Array<{ therapist_id: number }>;
    summary = { people: new Set(rs.map((x) => x.therapist_id)).size, photos: rs.length };
  }
  return {
    ok: true,
    data: {
      enabled: !!salon.conecf_enabled_at,
      phase,
      hasEkichika: (srcCount ?? 0) > 0,
      firstImportBusy: !!salon.conecf_import_requested_at && !salon.conecf_import_done_at,
      noPhotoCount,
      doneAt: (salon.conecf_photo_import_done_at as string | null) ?? null,
      summary,
    },
  };
}

export async function requestConecfPhotoImport(): Promise<Result<{ requestedAt: string }>> {
  const r = await resolvePhoto();
  if (!r.ok) return r;
  const { svc, salon } = r;
  if (!salon.conecf_enabled_at) return { ok: false, error: '取り込むには、ホームで「コネックエフに切り替える」を押してください' };
  if (salon.conecf_photo_import_requested_at) return { ok: false, error: '駅ちかの写真の取り込みは、すでに1回行っています' };
  if (salon.conecf_import_requested_at && !salon.conecf_import_done_at) return { ok: false, error: '駅ちかからの取り込み中です。終わってからもう一度お試しください（写真もいっしょに取り込みます）' };
  const { count } = await svc
    .from('salon_import_sources').select('id', { count: 'exact', head: true })
    .eq('salon_id', salon.id).eq('provider', 'ekichika')
    .not('shop_url', 'is', null).not('external_id', 'is', null);
  if (!count) return { ok: false, error: '駅ちかの店舗ページが登録されていないため取り込めません。運営までご連絡ください' };
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from('salons').update({ conecf_photo_import_requested_at: now })
    .eq('id', salon.id).is('conecf_photo_import_requested_at', null)
    .select('id');
  if (error) return { ok: false, error: `受け付けできませんでした: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: '駅ちかの写真の取り込みは、すでに1回行っています' };
  return { ok: true, data: { requestedAt: now } };
}
