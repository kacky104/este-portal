import { createPublicClient } from '@/app/lib/supabase/public';

// セラピスト求人の取得ロジックを1か所に集約（二重実装しない）。
// 公開ページ専用のため anon クライアント（createPublicClient）で読む。
// RLS（is_active かつ salons.is_hidden=false）で絞られるが、多重防御として
// クエリ側でも .eq('is_active', true) と salons!inner の is_hidden=false を明示する。

// ── 雇用形態の表示ラベル ─────────────────────────────────
// DBの enum 値 → 日本語ラベル。JobPosting 構造化データの employmentType は
// schema.org が同名（CONTRACTOR / PART_TIME / FULL_TIME / OTHER）を許容するため
// DB値をそのまま出力する。
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  CONTRACTOR: '業務委託',
  PART_TIME: 'アルバイト',
  FULL_TIME: '正社員',
  OTHER: 'その他',
};

export function employmentTypeLabel(value: string | null | undefined): string {
  if (!value) return EMPLOYMENT_TYPE_LABELS.OTHER;
  return EMPLOYMENT_TYPE_LABELS[value] ?? EMPLOYMENT_TYPE_LABELS.OTHER;
}

// 応募ステータスの定義（new/contacted/closed）。
// サーバーアクション（'use server'）は async 関数以外を export できないため、
// 定数はこの非serverモジュールに集約し、actions 側は import して使う。
export const APPLICATION_STATUSES = ['new', 'contacted', 'closed'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// ── 型 ───────────────────────────────────────────────
export type JobSalon = {
  id: number;
  name: string;
  area: string;
};

export type JobListItem = {
  id: number;
  title: string;
  salaryText: string;
  employmentType: string;
  publishedAt: string | null;
  salon: JobSalon;
};

export type JobDetail = {
  id: number;
  title: string;
  salaryText: string;
  employmentType: string;
  publishedAt: string | null;
  workHours: string | null;
  requirements: string | null;
  benefits: string | null;
  access: string | null;
  description: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salon: {
    id: number;
    name: string;
    area: string;
    address: string | null;
    // salons テーブルの電話番号カラムは `phone`（`tel` ではない）。応募導線の tel: リンクに使う。
    phone: string | null;
  };
};

// 埋め込みリレーション（salons!inner）は多対一だが、supabase-js の返り値が
// オブジェクト／配列いずれの場合もあるため正規化する。
function pickSalon<T>(raw: unknown): T | null {
  if (!raw) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

// ── 一覧用 ───────────────────────────────────────────
export async function fetchActiveJobs(): Promise<JobListItem[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_jobs')
    .select('id, title, salary_text, employment_type, published_at, salons!inner(id, name, area, is_hidden)')
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false });

  return (data ?? [])
    .map((row) => {
      const salon = pickSalon<{ id: number; name: string; area: string | null }>(row.salons);
      if (!salon) return null;
      return {
        id: row.id as number,
        title: (row.title as string) ?? '',
        salaryText: (row.salary_text as string | null) ?? '',
        employmentType: (row.employment_type as string | null) ?? 'OTHER',
        publishedAt: (row.published_at as string | null) ?? null,
        salon: {
          id: salon.id,
          name: salon.name ?? '',
          area: salon.area ?? '',
        },
      } as JobListItem;
    })
    .filter((j): j is JobListItem => j !== null);
}

// ── 詳細用 ───────────────────────────────────────────
export async function fetchJobById(id: number): Promise<JobDetail | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('salon_jobs')
    .select(
      'id, title, salary_text, employment_type, published_at, work_hours, requirements, benefits, access, description, salary_min, salary_max, salons!inner(id, name, area, address, phone, is_hidden)'
    )
    .eq('id', id)
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .maybeSingle();

  if (error || !data) return null;

  const salon = pickSalon<{
    id: number;
    name: string;
    area: string | null;
    address: string | null;
    phone: string | null;
  }>(data.salons);
  if (!salon) return null;

  return {
    id: data.id as number,
    title: (data.title as string) ?? '',
    salaryText: (data.salary_text as string | null) ?? '',
    employmentType: (data.employment_type as string | null) ?? 'OTHER',
    publishedAt: (data.published_at as string | null) ?? null,
    workHours: (data.work_hours as string | null) ?? null,
    requirements: (data.requirements as string | null) ?? null,
    benefits: (data.benefits as string | null) ?? null,
    access: (data.access as string | null) ?? null,
    description: (data.description as string | null) ?? null,
    salaryMin: (data.salary_min as number | null) ?? null,
    salaryMax: (data.salary_max as number | null) ?? null,
    salon: {
      id: salon.id,
      name: salon.name ?? '',
      area: salon.area ?? '',
      address: salon.address ?? null,
      phone: salon.phone ?? null,
    },
  };
}

// ── サロン詳細ページの内部リンク用（軽量：id, title のみ） ──
export async function fetchActiveJobsBySalon(
  salonId: number
): Promise<{ id: number; title: string }[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_jobs')
    .select('id, title, salons!inner(is_hidden)')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id as number,
    title: (row.title as string) ?? '',
  }));
}

// ── sitemap 用（id, updated_at のみ） ──
export async function fetchActiveJobsForSitemap(): Promise<
  { id: number; updatedAt: string | null }[]
> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_jobs')
    .select('id, updated_at, salons!inner(is_hidden)')
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id as number,
    updatedAt: (row.updated_at as string | null) ?? null,
  }));
}

