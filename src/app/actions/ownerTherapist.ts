'use server';

import { createClient } from '@/app/lib/supabase/server';

// ★★ 第988便（2026-09-29・カッキーさん）: 店舗マイページの「出勤」「セラピストの追加」「今すぐ」「セラピスト編集」を【サーバー側】で行う。
// ★ オーナーさんはスマホ（LINE やメールアプリの中のブラウザを含む）でよく使うため。第980〜987便と同じ対策。
// ★ すべて【オーナー本人のログインのまま】（service_role ではない）＝ RLS（自分の店のセラピストだけ）、
//   コネックエフの DB ロック、名前の重複チェックなどのトリガーはそのまま効く。
// ★ エラーは { message, code } の形で返す＝画面側の conecfLockMessage / therapistNameDupMessage がそのまま使える。

type DbErr = { message: string; code?: string } | null;
const NO_LOGIN = { message: 'ログインが切れています。ページを開き直すか、ログインし直してください。', code: 'no_session' };

function errOf(e: { message?: string; code?: string } | null | undefined): DbErr {
  return e ? { message: e.message ?? '', code: e.code } : null;
}

async function owner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── 週間スケジュールの保存（変えた人の7日ぶんを upsert） ──
export async function saveOwnerSchedules(rows: {
  therapist_id: string; schedule_date: string; is_active: boolean; start_time: string | null; end_time: string | null;
}[]): Promise<{ error: DbErr }> {
  const { supabase, user } = await owner();
  if (!user) return { error: NO_LOGIN };
  const clean = (Array.isArray(rows) ? rows : []).slice(0, 2000).map((r) => ({
    therapist_id: r.therapist_id,
    schedule_date: r.schedule_date,
    is_active: !!r.is_active,
    start_time: r.is_active ? r.start_time : null,
    end_time: r.is_active ? r.end_time : null,
  }));
  if (clean.length === 0) return { error: null };
  const { error } = await supabase.from('therapist_schedules').upsert(clean, { onConflict: 'therapist_id,schedule_date' });
  if (error) console.error('[mypage] 出勤を保存できなかった', user.id, error.code, error.message);
  return { error: errOf(error) };
}

// ── セラピストの追加 ──
export async function addOwnerTherapist(input: {
  salonId: number; name: string; area: string | null; isNewFace: boolean;
}): Promise<{ error: DbErr }> {
  const { supabase, user } = await owner();
  if (!user) return { error: NO_LOGIN };
  const name = String(input.name ?? '').trim();
  if (!name) return { error: { message: '名前を入力してください' } };
  const { error } = await supabase.from('therapists').insert({
    salon_id: input.salonId,
    name,
    area: input.area ?? null,
    work_hours: null,
    comment: null,
    profile_image_url: null,
    profile_text: null,
    age: null,
    body_type: null,
    is_new_face: !!input.isNewFace,
    new_face_since: input.isNewFace ? new Date().toISOString() : null,
  });
  if (error) console.error('[mypage] セラピストを追加できなかった', user.id, error.code, error.message);
  return { error: errOf(error) };
}

// ── 「今すぐ」の保存（1人ずつ。コネックエフのロックで断られたらそこで止める） ──
export async function saveOwnerAvailableNow(updates: {
  id: string | number; is_available_now: boolean; available_until: string | null;
}[]): Promise<{ error: DbErr }> {
  const { supabase, user } = await owner();
  if (!user) return { error: NO_LOGIN };
  for (const u of (Array.isArray(updates) ? updates : []).slice(0, 300)) {
    const { error } = await supabase
      .from('therapists')
      .update({ is_available_now: !!u.is_available_now, available_until: u.available_until })
      .eq('id', u.id);
    if (error) {
      console.error('[mypage] 今すぐを保存できなかった', user.id, error.code, error.message);
      return { error: errOf(error) };
    }
  }
  return { error: null };
}

// ── セラピスト編集: 読み込み（自分の店のセラピストか確かめる） ──
export async function loadOwnerTherapistForEdit(therapistId: string): Promise<
  | { ok: true; therapist: Record<string, unknown>; conecfOn: boolean }
  | { ok: false; reason: 'login' | 'notfound' | 'forbidden' }
> {
  const { supabase, user } = await owner();
  if (!user) return { ok: false, reason: 'login' };
  const { data: t, error } = await supabase
    .from('therapists')
    .select('id, salon_id, name, profile_image_url, profile_images, age, body_type, profile_text, catchphrase, feature_badges, is_active')
    .eq('id', therapistId)
    .maybeSingle();
  if (error || !t) return { ok: false, reason: 'notfound' };
  const { data: salon } = await supabase
    .from('salons')
    .select('id, conecf_enabled_at')
    .eq('id', t.salon_id)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!salon) return { ok: false, reason: 'forbidden' };
  return { ok: true, therapist: t as Record<string, unknown>, conecfOn: !!(salon as { conecf_enabled_at?: string | null }).conecf_enabled_at };
}

// ── セラピスト編集: 写真のアップロード先（therapist-photos・一回限り） ──
const EXT_OK = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic']);
export async function createOwnerTherapistPhotoUploadUrl(therapistId: string, ext: string): Promise<
  { ok: true; signedUrl: string; publicUrl: string } | { ok: false; error: string }
> {
  const e = String(ext || 'jpg').toLowerCase();
  if (!EXT_OK.has(e)) return { ok: false, error: 'この形式の画像には対応していません' };
  const tid = Number(therapistId);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: false, error: 'アップロードできませんでした' };
  const { supabase, user } = await owner();
  if (!user) return { ok: false, error: NO_LOGIN.message };
  const path = `${tid}-${Date.now()}.${e}`;
  const { data, error } = await supabase.storage.from('therapist-photos').createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    console.error('[mypage] 写真のアップロード先を作れなかった', user.id, error?.message);
    return { ok: false, error: '画像を送る準備ができませんでした。ページを開き直してから、もう一度選んでください。' };
  }
  const { data: { publicUrl } } = supabase.storage.from('therapist-photos').getPublicUrl(path);
  return { ok: true, signedUrl: data.signedUrl, publicUrl };
}

// ── セラピスト編集: 保存（送ってよい項目だけ） ──
const THERAPIST_UPDATABLE = new Set([
  'profile_image_url', 'profile_images', 'age', 'body_type', 'profile_text', 'catchphrase', 'feature_badges',
]);
export async function updateOwnerTherapist(therapistId: string | number, patch: Record<string, unknown>): Promise<{ error: DbErr }> {
  const { supabase, user } = await owner();
  if (!user) return { error: NO_LOGIN };
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) if (THERAPIST_UPDATABLE.has(k)) clean[k] = v;
  if (Object.keys(clean).length === 0) return { error: null };
  const { data, error } = await supabase.from('therapists').update(clean).eq('id', therapistId).select('id');
  if (error) {
    console.error('[mypage] セラピストを保存できなかった', user.id, error.code, error.message);
    return { error: errOf(error) };
  }
  if (!data || data.length === 0) return { error: { message: 'このセラピストは保存できませんでした（ご自分の店舗のセラピストではない可能性があります）', code: 'not_owner' } };
  return { error: null };
}

// ── 第1027便: セラピスト一覧の「fukuX 開設済み／未開設」表示用。
//   渡した auth uid のうち、承認済み fukuX セラピストアカウント（x_profiles kind='therapist' status='approved'）
//   を持つものだけ返す。公開読み取り（RLS は公開 select）。
export async function loadFukuXLinkedUserIds(userIds: string[]): Promise<string[]> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_profiles')
    .select('auth_user_id')
    .eq('kind', 'therapist')
    .eq('status', 'approved')
    .in('auth_user_id', ids);
  return ((data ?? []) as Array<{ auth_user_id: string | null }>).map((r) => String(r.auth_user_id ?? '')).filter(Boolean);
}
