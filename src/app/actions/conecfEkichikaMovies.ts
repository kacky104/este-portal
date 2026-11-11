'use server';

import { createClient } from '@/app/lib/supabase/server';
import { hasConecfEkichikaMovies } from '@/app/lib/conecf/navFlags';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import {
  CONECF_VIDEO_BUCKET, EKICHIKA_VIDEO_MAX_BYTES, isConecfVideoPath, normalizeMovieSchedule, movieRowProblem, type EkichikaMovieRow,
} from '@/lib/ekichikaMovie';

// 駅ちかの動画投稿の受け口（第1840便・2026-11-09・カッキーさん）。設計メモ_2026-11-09_駅ちか動画投稿.md
// ★ 運営が /admin で ON（admin_enabled）にした店だけ、コネックエフに出る。
// ★ 動画はブラウザから Supabase へ直接上げる（署名付きアップロード URL・Vercel を通さない）。表 conecf_videos に置き場を書く
// ★ 投稿は中継の流れ（lib/ekichikaMovieFlow.ts）。周は /api/admin/ekichika-bump

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];

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

export type ConecfVideo = { id: number; name: string; bytes: number | null; createdAt: string };
export type ConecfEkichikaMovieSetting = { slot: number; auto: boolean; schedule: EkichikaMovieRow[]; lastAt: string | null; lastOutcome: string | null };


export async function getConecfEkichikaMovies(): Promise<Result<{ settings: ConecfEkichikaMovieSetting[]; videos: ConecfVideo[]; girls: string[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const st = await r.svc.from('conecf_ekichika_movies').select('slot, auto, schedule, last_at, last_outcome').eq('salon_id', r.salonId).eq('admin_enabled', true).order('slot');
  if (st.error) return { ok: true, data: { settings: [], videos: [], girls: [] } };
  const v = await r.svc.from('conecf_videos').select('id, name, bytes, created_at').eq('salon_id', r.salonId).order('id');
  const t = await r.svc.from('therapists').select('name').eq('salon_id', r.salonId).order('name');
  return {
    ok: true,
    data: {
      settings: (st.data ?? []).map((x) => ({ slot: Number(x.slot), auto: x.auto === true, schedule: normalizeMovieSchedule(x.schedule), lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null })),
      videos: (v.data ?? []).map((x) => ({ id: Number(x.id), name: String(x.name ?? ''), bytes: x.bytes == null ? null : Number(x.bytes), createdAt: String(x.created_at) })),
      girls: t.error ? [] : [...new Set((t.data ?? []).map((d) => String(d.name ?? '').trim()).filter(Boolean))],
    },
  };
}

// ── 動画の置き場 ──
/** ① 上げる場所と署名付きアップロードの鍵を作る（ブラウザがそこへ直接上げる） */
export async function createConecfVideoUpload(input: { size: number; type: string }): Promise<Result<{ path: string; token: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const okRow = await hasConecfEkichikaMovies(r.salonId);
  if (!okRow) return { ok: false, error: 'この機能は使えるようになっていません。運営事務局までご連絡ください' };
  const type = String(input.type ?? '');
  if (!VIDEO_TYPES.includes(type)) return { ok: false, error: '動画は MP4 か MOV にしてください' };
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: '動画を選んでください' };
  if (size > EKICHIKA_VIDEO_MAX_BYTES) return { ok: false, error: '動画が大きすぎます（1本50MBまでです。短くするか、書き出しの画質を下げてください）' };
  const rand = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '') || 'v';
  const path = `${r.salonId}/${Date.now()}_${rand}.${type === 'video/quicktime' ? 'mov' : 'mp4'}`;
  const { data, error } = await r.svc.storage.from(CONECF_VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) return { ok: false, error: 'アップロードの準備ができませんでした: ' + (error?.message ?? '') };
  return { ok: true, data: { path, token: data.token } };
}

/** ② 上がった動画を置き場の一覧に入れる */
export async function registerConecfVideo(input: { path: string; name: string; type: string }): Promise<Result<{ id: number }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const path = String(input.path ?? '');
  if (!isConecfVideoPath(path) || !path.startsWith(r.salonId + '/')) return { ok: false, error: '置き場の指定が不正です' };
  const name = String(input.name ?? '').trim().slice(0, 40) || '動画';
  const folder = path.split('/')[0];
  const file = path.split('/')[1];
  const { data: list } = await r.svc.storage.from(CONECF_VIDEO_BUCKET).list(folder, { search: file, limit: 5 });
  const obj = (list ?? []).find((o) => o.name === file);
  if (!obj) return { ok: false, error: '動画が上がっていませんでした。もう一度お試しください' };
  const bytes = Number((obj.metadata as { size?: number } | null)?.size ?? 0) || null;
  const { data, error } = await r.svc.from('conecf_videos').insert({ salon_id: r.salonId, name, path, bytes, content_type: VIDEO_TYPES.includes(input.type) ? input.type : 'video/mp4' }).select('id').single();
  if (error || !data) return { ok: false, error: '保存できませんでした: ' + (error?.message ?? '') };
  return { ok: true, data: { id: Number(data.id) } };
}

export async function renameConecfVideo(input: { id: number; name: string }): Promise<Result<null>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const name = String(input.name ?? '').trim().slice(0, 40);
  if (!name) return { ok: false, error: '名前を入れてください' };
  const { error } = await r.svc.from('conecf_videos').update({ name }).eq('id', Number(input.id)).eq('salon_id', r.salonId);
  if (error) return { ok: false, error: '保存できませんでした' };
  return { ok: true, data: null };
}

export async function deleteConecfVideo(input: { id: number }): Promise<Result<null>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const id = Number(input.id);
  // ★ 予定に使っている動画は消さない（先に予定から外してもらう）
  const { data: st } = await r.svc.from('conecf_ekichika_movies').select('schedule').eq('salon_id', r.salonId);
  if ((st ?? []).some((x) => normalizeMovieSchedule(x.schedule).some((row) => row.videoId === id))) return { ok: false, error: 'この動画は投稿の予定に使っています。先に予定から外してください' };
  const { data: v } = await r.svc.from('conecf_videos').select('path').eq('id', id).eq('salon_id', r.salonId).maybeSingle();
  if (!v) return { ok: false, error: '見つかりませんでした' };
  const { error } = await r.svc.from('conecf_videos').delete().eq('id', id).eq('salon_id', r.salonId);
  if (error) return { ok: false, error: '消せませんでした' };
  if (isConecfVideoPath(String(v.path))) await r.svc.storage.from(CONECF_VIDEO_BUCKET).remove([String(v.path)]);
  return { ok: true, data: null };
}

// ── 設定 ──
export async function saveConecfEkichikaMovie(input: { slot: number; auto: boolean; schedule: EkichikaMovieRow[] }): Promise<Result<null>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  const schedule = normalizeMovieSchedule(input.schedule);
  for (const [i, row] of schedule.entries()) {
    const p = movieRowProblem(row);
    if (p) return { ok: false, error: `${i + 1}行目: ${p}` };
  }
  if (input.auto === true && schedule.length === 0) return { ok: false, error: '投稿する時刻を1行以上入れてください' };
  const ids = [...new Set(schedule.map((x) => x.videoId))];
  if (ids.length > 0) {
    const { data: own } = await r.svc.from('conecf_videos').select('id').eq('salon_id', r.salonId).in('id', ids);
    if ((own ?? []).length !== ids.length) return { ok: false, error: '選んだ動画が見つかりません。読み込み直してください' };
  }
  const { data, error } = await r.svc.from('conecf_ekichika_movies')
    .update({ auto: input.auto === true, schedule, updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('slot', slot).eq('admin_enabled', true).select('slot');
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  if (!data || data.length === 0) return { ok: false, error: 'この枠は使えるようになっていません。運営事務局までご連絡ください' };
  return { ok: true, data: null };
}

/** ★ 保存してある行を、いま1回送る（駅ちかの1日5件の枠を1つ使う） */
export async function runConecfEkichikaMovieNow(input: { slot: number; index: number }): Promise<Result<{ note: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  const { data: st } = await r.svc.from('conecf_ekichika_movies').select('schedule, updated_at').eq('salon_id', r.salonId).eq('slot', slot).eq('admin_enabled', true).maybeSingle();
  if (!st) return { ok: false, error: 'この枠は使えるようになっていません。運営事務局までご連絡ください' };
  const schedule = normalizeMovieSchedule(st.schedule);
  const row = schedule[Number(input.index)];
  if (!row) return { ok: false, error: '行が見つかりません（保存してから押してください）' };
  const p = movieRowProblem(row);
  if (p) return { ok: false, error: p };
  const { data: video } = await r.svc.from('conecf_videos').select('path, content_type').eq('id', row.videoId).eq('salon_id', r.salonId).maybeSingle();
  if (!video || !isConecfVideoPath(String(video.path))) return { ok: false, error: '動画が見つかりません' };
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'ekichika', slot, intent: 'bump_push', actor: 'shop:' + r.userId,
      ekichikaMovie: { index: Number(input.index), girlName: row.girlName, title: row.title, body: row.body, deleteSame: row.deleteSame, videoPath: String(video.path), videoType: String(video.content_type ?? 'video/mp4') },
    });
    if (!f.ok) return { ok: false, error: f.note };
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] 駅ちかの動画投稿を始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── 運営 ──
export async function adminGetEkichikaMovies(salonId: number): Promise<Result<{ enabled: boolean }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_ekichika_movies').select('admin_enabled').eq('salon_id', Number(salonId)).eq('slot', 1).maybeSingle();
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1840便は流しましたか？）: ' + error.message };
  return { ok: true, data: { enabled: data?.admin_enabled === true } };
}
export async function adminSetEkichikaMovies(input: { salonId: number; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const salonId = Number(input.salonId);
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_ekichika_movies').select('slot').eq('salon_id', salonId).eq('slot', 1).maybeSingle();
  const res = cur
    ? await svc.from('conecf_ekichika_movies').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId).eq('slot', 1)
    : await svc.from('conecf_ekichika_movies').insert({ salon_id: salonId, slot: 1, admin_enabled: input.enabled === true });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}
