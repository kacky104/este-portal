'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { sendApplicationMail } from '@/app/lib/jobs/sendApplicationMail';
// 'use server' ファイルは async 関数以外を export できないため、定数・型は非serverモジュールから import する。
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  MAX_JOB_FEATURES,
  isValidFeatureSlug,
  sanitizeFeatures,
} from '@/app/lib/jobs';

// フクエスワーク（セラピスト求人）フェーズ2のサーバーアクション群。
//
// 方針（booking.ts の作法を踏襲）:
//  - エラーは握りつぶさず文言化して画面に返す（mypage予約一覧の silent 0件バグの反省）。
//  - 書き込みはすべて認証ユーザークライアント（RLS経由）。owner本人 or ADMIN_UUID を
//    salons.owner_id 照合で二重チェックする。service_role は書き込みに使わない
//    （書き込みRLSポリシー整備済み。adminも同ポリシーでUUID判定される）。
//  - admin の一覧・代理作成の「読み取り」だけは、非表示サロンの求人も見える必要があるため
//    service_role（createServiceClient）で取得する。
//  - 1店舗1求人（UNIQUE(salon_id)）。作成時のみ published_at=now、編集時は published_at を
//    触らず updated_at のみ更新（掲載日の水増し防止）。
//  - 公開側ISR（/jobs・/jobs/[id]・/salon/[id]・sitemap）は書き込み成功時に revalidatePath で即時更新。

const EMPLOYMENT_TYPES = ['CONTRACTOR', 'PART_TIME', 'FULL_TIME', 'OTHER'] as const;

const JOB_COLUMNS =
  'id, salon_id, title, description, employment_type, salary_text, salary_min, salary_max, work_hours, requirements, benefits, access, notify_email, features, is_active, published_at, updated_at';

export type JobFormInput = {
  title: string;
  description: string;
  employment_type: string;
  salary_text: string;
  salary_min: string | number | null;
  salary_max: string | number | null;
  work_hours: string;
  requirements: string;
  benefits: string;
  access: string;
  notify_email: string;
  features: string[];
};

export type MyJob = {
  id: number;
  salon_id: number;
  title: string;
  description: string;
  employment_type: string;
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  work_hours: string;
  requirements: string;
  benefits: string;
  access: string;
  notify_email: string;
  features: string[];
  is_active: boolean;
  published_at: string | null;
  updated_at: string | null;
};

export type AdminJobRow = MyJob & { salonName: string; salonHidden: boolean; newCount: number };

type Err = { ok: false; error: string };

// ── マッピング ───────────────────────────────────────
function mapJob(row: Record<string, unknown>): MyJob {
  return {
    id: Number(row.id),
    salon_id: Number(row.salon_id),
    title: (row.title as string | null) ?? '',
    description: (row.description as string | null) ?? '',
    employment_type: (row.employment_type as string | null) ?? 'OTHER',
    salary_text: (row.salary_text as string | null) ?? '',
    salary_min: row.salary_min == null ? null : Number(row.salary_min),
    salary_max: row.salary_max == null ? null : Number(row.salary_max),
    work_hours: (row.work_hours as string | null) ?? '',
    requirements: (row.requirements as string | null) ?? '',
    benefits: (row.benefits as string | null) ?? '',
    access: (row.access as string | null) ?? '',
    notify_email: (row.notify_email as string | null) ?? '',
    features: sanitizeFeatures(row.features),
    is_active: Boolean(row.is_active),
    published_at: (row.published_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

// ── 公開側ISRの即時再検証（書き込み成功時に呼ぶ） ──
function revalidateJobsPublic(salonId?: number): void {
  revalidatePath('/jobs');
  revalidatePath('/jobs/[id]', 'page');
  // 特徴タグページ（全slug一括）。タグ付け替えでどのタグページにも影響しうるため全体を再検証。
  revalidatePath('/jobs/tag/[slug]', 'page');
  revalidatePath('/salon/[id]', 'page');
  if (salonId != null) revalidatePath(`/salon/${salonId}`, 'layout');
  // sitemap にも求人URL／タグページが含まれるため更新。
  revalidatePath('/sitemap.xml');
}

// ── 認証・所有権 ───────────────────────────────────────
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  return { ok: true as const, user, supabase };
}

// 指定サロンの owner本人 or 運営(ADMIN_UUID) であることを認証クライアント（RLS）で検証する。
async function assertSalonOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  salonId: number,
): Promise<{ ok: true } | Err> {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { ok: false, error: 'サロンが見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== userId && userId !== ADMIN_UUID) {
    return { ok: false, error: 'このサロンの求人を操作する権限がありません' };
  }
  return { ok: true };
}

// ── バリデーション ───────────────────────────────────
function parseSalary(v: string | number | null | undefined): { value: number | null; invalid?: true } {
  if (v === null || v === undefined) return { value: null };
  const s = String(v).trim();
  if (s === '') return { value: null };
  if (!/^\d+$/.test(s)) return { value: null, invalid: true };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) return { value: null, invalid: true };
  return { value: n };
}

function trimOrNull(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

type CleanJob = {
  title: string;
  description: string;
  employment_type: string;
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  work_hours: string | null;
  requirements: string | null;
  benefits: string | null;
  access: string | null;
  notify_email: string | null;
  features: string[];
};

function validate(input: JobFormInput): { ok: true; clean: CleanJob } | Err {
  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  const salary_text = String(input.salary_text ?? '').trim();
  const employment_type = String(input.employment_type ?? '').trim();

  if (!title) return { ok: false, error: '求人タイトルを入力してください' };
  if (!description) return { ok: false, error: '仕事内容を入力してください' };
  if (!salary_text) return { ok: false, error: '給与（表示テキスト）を入力してください' };
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(employment_type)) {
    return { ok: false, error: '雇用形態の選択が不正です' };
  }

  const min = parseSalary(input.salary_min);
  const max = parseSalary(input.salary_max);
  if (min.invalid || max.invalid) {
    return { ok: false, error: '給与（数値）は0以上の整数で入力してください' };
  }
  // 片方だけ入力は不可（両方入力 or 両方空）。
  if ((min.value === null) !== (max.value === null)) {
    return { ok: false, error: '給与の下限・上限は「両方入力」か「両方空欄」にしてください' };
  }
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { ok: false, error: '給与の下限は上限以下にしてください' };
  }

  // 応募通知メール（任意）。入力があるときだけ簡易形式チェック（@を含む程度・予約設定と同方針）。
  const notifyEmail = trimOrNull(input.notify_email);
  if (notifyEmail && !notifyEmail.includes('@')) {
    return { ok: false, error: '応募通知メールの形式が正しくありません' };
  }

  // 特徴タグ：配列＋各slugホワイトリスト＋重複除去＋最大件数。不正slugは拒否（サイレント除外しない）。
  const rawFeatures = Array.isArray(input.features) ? input.features.map((s) => String(s)) : [];
  const features: string[] = [];
  for (const slug of rawFeatures) {
    if (!isValidFeatureSlug(slug)) {
      return { ok: false, error: '不正な特徴タグが含まれています' };
    }
    if (!features.includes(slug)) features.push(slug);
  }
  if (features.length > MAX_JOB_FEATURES) {
    return { ok: false, error: `特徴タグは最大${MAX_JOB_FEATURES}個までです` };
  }

  return {
    ok: true,
    clean: {
      title,
      description,
      employment_type,
      salary_text,
      salary_min: min.value,
      salary_max: max.value,
      work_hours: trimOrNull(input.work_hours),
      requirements: trimOrNull(input.requirements),
      benefits: trimOrNull(input.benefits),
      access: trimOrNull(input.access),
      notify_email: notifyEmail,
      features,
    },
  };
}

// ── 取得（オーナー本人/運営）：非公開も見える ──
export async function getMyJob(
  salonId: number,
): Promise<{ ok: true; job: MyJob | null } | Err> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const { data, error } = await auth.supabase
    .from('salon_jobs')
    .select(JOB_COLUMNS)
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, job: data ? mapJob(data) : null };
}

// ── 作成/更新（RLS経由・1店舗1件） ──
export async function upsertMyJob(
  salonId: number,
  input: JobFormInput,
): Promise<{ ok: true; job: MyJob } | Err> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const v = validate(input);
  if (!v.ok) return v;
  const c = v.clean;

  const { data: existing, error: exErr } = await auth.supabase
    .from('salon_jobs')
    .select('id')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  const nowIso = new Date().toISOString();

  if (existing) {
    // 編集：published_at は触らない（掲載日の水増し防止）。updated_at のみ更新。
    const { data, error } = await auth.supabase
      .from('salon_jobs')
      .update({ ...c, updated_at: nowIso })
      .eq('id', existing.id as number)
      .select(JOB_COLUMNS)
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? '更新に失敗しました' };
    revalidateJobsPublic(salonId);
    return { ok: true, job: mapJob(data) };
  }

  // 新規作成：published_at=now、既定で公開（is_active=true）。
  const { data, error } = await auth.supabase
    .from('salon_jobs')
    .insert({ salon_id: salonId, ...c, is_active: true, published_at: nowIso, updated_at: nowIso })
    .select(JOB_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: '既に求人が作成されています。再読み込みしてください' };
    }
    return { ok: false, error: error?.message ?? '作成に失敗しました' };
  }
  revalidateJobsPublic(salonId);
  return { ok: true, job: mapJob(data) };
}

// ── 公開/非公開トグル（削除せず非公開にできる） ──
export async function toggleMyJobActive(
  jobId: number,
): Promise<{ ok: true; is_active: boolean } | Err> {
  if (!Number.isFinite(jobId)) return { ok: false, error: '対象求人が不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const { data: job, error } = await auth.supabase
    .from('salon_jobs')
    .select('id, salon_id, is_active')
    .eq('id', jobId)
    .maybeSingle();
  if (error || !job) return { ok: false, error: '求人が見つかりません' };

  const salonId = Number(job.salon_id);
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const next = !job.is_active;
  const { error: upErr } = await auth.supabase
    .from('salon_jobs')
    .update({ is_active: next, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (upErr) return { ok: false, error: upErr.message };
  revalidateJobsPublic(salonId);
  return { ok: true, is_active: next };
}

// ── おすすめ求人（featured_jobs）編集後の公開ISR即時更新 ──
// おすすめ枠は /jobs トップにのみ表示されるため、そのISRキャッシュだけ再検証すれば十分。
// featured_jobs への書き込み自体は FeaturedJobsManager が authenticated クライアント（RLSで
// admin UUID のみ許可）で行うため、この関数は純粋なキャッシュ無効化のみを担う。
export async function revalidateFeaturedJobs(): Promise<void> {
  revalidatePath('/jobs');
}

// ── 削除（confirmはUI側） ──
export async function deleteMyJob(jobId: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(jobId)) return { ok: false, error: '対象求人が不正です' };
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: job, error } = await auth.supabase
    .from('salon_jobs')
    .select('id, salon_id')
    .eq('id', jobId)
    .maybeSingle();
  if (error || !job) return { ok: false, error: '求人が見つかりません' };

  const salonId = Number(job.salon_id);
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return { ok: false, error: own.error };

  const { error: delErr } = await auth.supabase.from('salon_jobs').delete().eq('id', jobId);
  if (delErr) return { ok: false, error: delErr.message };
  revalidateJobsPublic(salonId);
  return { ok: true };
}

// ── /admin 用：全求人一覧（非表示サロン分も見えるよう service_role で取得・読み取りのみ） ──
export async function adminListJobs(): Promise<{ ok: true; jobs: AdminJobRow[] } | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_jobs')
    .select(JOB_COLUMNS)
    .order('published_at', { ascending: false });
  if (error) return { ok: false, error: error.message };

  const jobs = data ?? [];
  const salonIds = [...new Set(jobs.map((j) => Number(j.salon_id)))];
  const jobIds = jobs.map((j) => Number(j.id));
  const salonMap = new Map<number, { name: string; hidden: boolean }>();
  const newCountByJob = new Map<number, number>();
  if (salonIds.length > 0) {
    const { data: salons } = await svc.from('salons').select('id, name, is_hidden').in('id', salonIds);
    (salons ?? []).forEach((s) =>
      salonMap.set(Number(s.id), { name: (s.name as string | null) ?? '', hidden: Boolean(s.is_hidden) }),
    );
  }
  // 各求人の新規応募件数（status='new'）を集計（一覧行に「新規n件」を出すため）。
  if (jobIds.length > 0) {
    const { data: apps } = await svc
      .from('job_applications')
      .select('job_id')
      .eq('status', 'new')
      .in('job_id', jobIds);
    (apps ?? []).forEach((a) => {
      const jid = Number(a.job_id);
      newCountByJob.set(jid, (newCountByJob.get(jid) ?? 0) + 1);
    });
  }

  return {
    ok: true,
    jobs: jobs.map((j) => {
      const info = salonMap.get(Number(j.salon_id));
      return {
        ...mapJob(j),
        salonName: info?.name ?? '(不明)',
        salonHidden: info?.hidden ?? false,
        newCount: newCountByJob.get(Number(j.id)) ?? 0,
      };
    }),
  };
}

// ── /admin 用：代理作成のためのサロン一覧（求人の有無フラグ付き・service_role 読み取り） ──
export async function adminListSalonsForJob(): Promise<
  { ok: true; salons: { id: number; name: string; hasJob: boolean; isHidden: boolean }[] } | Err
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };

  const svc = createServiceClient();
  const [{ data: salons, error: sErr }, { data: jobs, error: jErr }] = await Promise.all([
    svc.from('salons').select('id, name, is_hidden').order('id', { ascending: true }),
    svc.from('salon_jobs').select('salon_id'),
  ]);
  if (sErr) return { ok: false, error: sErr.message };
  if (jErr) return { ok: false, error: jErr.message };

  const withJob = new Set((jobs ?? []).map((j) => Number(j.salon_id)));
  return {
    ok: true,
    salons: (salons ?? []).map((s) => ({
      id: Number(s.id),
      name: (s.name as string | null) ?? '',
      hasJob: withJob.has(Number(s.id)),
      isHidden: Boolean(s.is_hidden),
    })),
  };
}

// ══════════════════════════════════════════════════════════════════
//  応募（job_applications）— フェーズ3
//  INSERT は anon 可の RLS ポリシーがあるが、重複ガード読み取り＋非表示サロン判定が
//  必要なため service_role で統一する（RLSを通らない＝明示チェック必須）。
// ══════════════════════════════════════════════════════════════════

export type JobApplication = {
  id: string;
  jobId: number;
  salonId: number;
  name: string;
  tel: string;
  age: number | null;
  note: string | null;
  status: string;
  createdAt: string;
};

export type JobApplicationInput = {
  name: string;
  tel: string;
  age: string | number | null;
  note: string;
};

function mapApplication(row: Record<string, unknown>): JobApplication {
  return {
    id: String(row.id),
    jobId: Number(row.job_id),
    salonId: Number(row.salon_id),
    name: (row.name as string | null) ?? '',
    tel: (row.tel as string | null) ?? '',
    age: row.age == null ? null : Number(row.age),
    note: (row.note as string | null) ?? null,
    status: (row.status as string | null) ?? 'new',
    createdAt: String(row.created_at),
  };
}

// ── 応募の作成（公開・anon経路。サーバーで全項目を再検証） ──
export async function createJobApplication(
  jobId: number,
  input: JobApplicationInput,
): Promise<{ ok: true } | Err> {
  if (!Number.isFinite(jobId)) return { ok: false, error: '対象の求人が不正です' };

  const name = String(input.name ?? '').trim();
  const tel = String(input.tel ?? '').trim();
  const note = String(input.note ?? '').trim();

  // ③ 氏名・電話の必須＆形式（電話は数字ハイフンのみ・10〜13桁程度の緩い検証）。
  if (!name) return { ok: false, error: 'お名前を入力してください' };
  if (!/^[0-9-]{10,13}$/.test(tel)) {
    return { ok: false, error: '電話番号は数字とハイフンで正しく入力してください' };
  }

  // ④ 年齢は入力時のみ 18〜99 の整数。
  let age: number | null = null;
  const ageStr = input.age == null ? '' : String(input.age).trim();
  if (ageStr !== '') {
    if (!/^\d+$/.test(ageStr)) return { ok: false, error: '年齢は数字で入力してください' };
    const a = Number(ageStr);
    if (a < 18 || a > 99) return { ok: false, error: '年齢は18〜99の範囲で入力してください' };
    age = a;
  }

  const svc = createServiceClient();

  // ① 求人が存在＆is_active。
  const { data: job, error: jErr } = await svc
    .from('salon_jobs')
    .select('id, title, is_active, notify_email, salon_id')
    .eq('id', jobId)
    .maybeSingle();
  if (jErr || !job) return { ok: false, error: 'この求人は現在応募を受け付けていません' };
  if (!job.is_active) return { ok: false, error: 'この求人は現在応募を受け付けていません' };

  // ② サロンが is_hidden=false（service_role は RLS を通らないため明示チェック必須）。
  const { data: salon, error: sErr } = await svc
    .from('salons')
    .select('name, is_hidden, booking_email')
    .eq('id', Number(job.salon_id))
    .maybeSingle();
  if (sErr || !salon || salon.is_hidden) {
    return { ok: false, error: 'この求人は現在応募を受け付けていません' };
  }

  // ⑤ 直近1時間の同一 job_id + tel 重複ガード。
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: dup } = await svc
    .from('job_applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('tel', tel)
    .gte('created_at', cutoff)
    .limit(1);
  if (dup && dup.length > 0) {
    return { ok: false, error: 'すでに応募を受け付けています。お店からの連絡をお待ちください' };
  }

  const { error: insErr } = await svc
    .from('job_applications')
    // salon_id は NOT NULL。求人から辿った salon_id を必ず入れる。
    .insert({ job_id: jobId, salon_id: Number(job.salon_id), name, tel, age, note: note || null, status: 'new' });
  if (insErr) return { ok: false, error: insErr.message };

  // 通知メール：notify_email → salons.booking_email → 両方空ならスキップ（応募はDBに残る）。
  const to =
    ((job.notify_email as string | null) ?? '').trim() ||
    ((salon.booking_email as string | null) ?? '').trim() ||
    '';
  await sendApplicationMail({
    to,
    salonName: (salon.name as string | null) ?? '',
    jobTitle: (job.title as string | null) ?? '',
    name,
    tel,
    age,
    note: note || null,
  });

  return { ok: true };
}

// 応募の所有権チェック（application → job → salon.owner_id、本人 or ADMIN）。
// booking.ts の assertBookingOwner と同じ作法で、成功時は service_role クライアントを返す。
async function assertApplicationOwner(
  applicationId: string,
): Promise<{ ok: true; svc: ReturnType<typeof createServiceClient> } | Err> {
  if (!applicationId) return { ok: false, error: '対象の応募が不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const { data: app, error } = await svc
    .from('job_applications')
    .select('job_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (error || !app) return { ok: false, error: '応募が見つかりません' };

  const { data: job, error: jErr } = await svc
    .from('salon_jobs')
    .select('salon_id')
    .eq('id', Number(app.job_id))
    .maybeSingle();
  if (jErr || !job) return { ok: false, error: '求人が見つかりません' };

  const { data: salon, error: sErr } = await svc
    .from('salons')
    .select('owner_id')
    .eq('id', Number(job.salon_id))
    .maybeSingle();
  if (sErr || !salon) return { ok: false, error: 'サロンが見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== auth.user.id && auth.user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この応募を操作する権限がありません' };
  }
  return { ok: true, svc };
}

// ── 応募一覧（オーナー本人 or 運営・service_role 取得・新しい順） ──
export async function getJobApplications(
  salonId: number,
): Promise<{ ok: true; applications: JobApplication[] } | Err> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const svc = createServiceClient();
  // 対象サロンの求人ID（1店舗1件だが将来も想定して in で絞る）。
  const { data: jobs, error: jErr } = await svc.from('salon_jobs').select('id').eq('salon_id', salonId);
  if (jErr) return { ok: false, error: jErr.message };
  const jobIds = (jobs ?? []).map((j) => Number(j.id));
  if (jobIds.length === 0) return { ok: true, applications: [] };

  const { data, error } = await svc
    .from('job_applications')
    .select('id, job_id, salon_id, name, tel, age, note, status, created_at')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, applications: (data ?? []).map(mapApplication) };
}

// ── 応募ステータス変更（new/contacted/closed・オーナー本人 or 運営） ──
export async function updateApplicationStatus(
  applicationId: string,
  nextStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(APPLICATION_STATUSES as readonly string[]).includes(nextStatus)) {
    return { ok: false, error: 'ステータスが不正です' };
  }
  const auth = await assertApplicationOwner(applicationId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.svc
    .from('job_applications')
    .update({ status: nextStatus as ApplicationStatus })
    .eq('id', applicationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── 応募の削除（confirm前提・オーナー本人 or 運営） ──
export async function deleteApplication(
  applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await assertApplicationOwner(applicationId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.svc.from('job_applications').delete().eq('id', applicationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
