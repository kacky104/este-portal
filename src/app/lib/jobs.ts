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

// ── 特徴タグ マスタ ───────────────────────────────────
// DB（salon_jobs.features text[]）には slug のみ保存。表示は常にこのマスタ経由（表記ゆれ防止）。
export const JOB_FEATURES = [
  // 経験・年齢
  { slug: 'mikeiken',           label: '未経験歓迎' },
  { slug: 'keikensha',          label: '経験者優遇' },
  { slug: '20dai',              label: '20代活躍中' },
  { slug: '30dai',              label: '30代活躍中' },
  { slug: '40dai',              label: '40代以上歓迎' },
  // 働き方
  { slug: 'jiyu-shukkin',       label: '自由出勤' },
  { slug: 'shu1',               label: '週1日〜OK' },
  { slug: 'w-work',             label: 'Wワーク歓迎' },
  { slug: 'tanjikan',           label: '短時間OK' },
  { slug: 'taiken',             label: '体験入店OK' },
  // 待遇・お金
  { slug: 'hibarai',            label: '日払いOK' },
  { slug: 'high-back',          label: '高バック率' },
  { slug: 'norma-nashi',        label: 'ノルマ・罰金なし' },
  { slug: 'hosho',              label: '保証制度あり' },
  // 環境・安心
  { slug: 'koshitsu-taiki',     label: '個室待機' },
  { slug: 'sogei',              label: '送迎あり' },
  { slug: 'jitaku-haken-nashi', label: '自宅派遣なし' },
] as const;

export const MAX_JOB_FEATURES = 6;

// 「特徴から探す」／フォームのカテゴリ表示用グルーピング（slug は JOB_FEATURES と一致）。
export const JOB_FEATURE_GROUPS: { title: string; slugs: string[] }[] = [
  { title: '経験・年齢', slugs: ['mikeiken', 'keikensha', '20dai', '30dai', '40dai'] },
  { title: '働き方',     slugs: ['jiyu-shukkin', 'shu1', 'w-work', 'tanjikan', 'taiken'] },
  { title: '待遇・お金', slugs: ['hibarai', 'high-back', 'norma-nashi', 'hosho'] },
  { title: '環境・安心', slugs: ['koshitsu-taiki', 'sogei', 'jitaku-haken-nashi'] },
];

const FEATURE_LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(
  JOB_FEATURES.map((f) => [f.slug, f.label]),
);

// slug → 表示ラベル（未知slugはそのまま返す＝防御的）。
export function featureLabel(slug: string): string {
  return FEATURE_LABEL_BY_SLUG[slug] ?? slug;
}

// slug がマスタに存在するか（ホワイトリスト検証）。
export function isValidFeatureSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(FEATURE_LABEL_BY_SLUG, slug);
}

// DBから読んだ features を表示用に正規化（配列化・ホワイトリスト・重複除去・マスタ順に整列）。
export function sanitizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.map((s) => String(s)).filter((s) => isValidFeatureSlug(s)));
  // マスタ順に並べ替えて表記の一貫性を保つ。
  return JOB_FEATURES.map((f) => f.slug).filter((slug) => set.has(slug));
}

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
  features: string[];
  salon: JobSalon;
};

// ピックアップ（おすすめ求人スライダー）用の軽量カード型。
export type PickupJob = {
  id: number;
  title: string;
  salaryText: string;
  salon: { id: number; name: string };
  imageUrl: string | null;
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
  features: string[];
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
    .select('id, title, salary_text, employment_type, published_at, features, salons!inner(id, name, area, is_hidden)')
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false });

  return (data ?? [])
    .map((row) => mapJobListItem(row))
    .filter((j): j is JobListItem => j !== null);
}

// 一覧行 → JobListItem（fetchActiveJobs / fetchActiveJobsByFeature で共用）。
function mapJobListItem(row: Record<string, unknown>): JobListItem | null {
  const salon = pickSalon<{ id: number; name: string; area: string | null }>(row.salons);
  if (!salon) return null;
  return {
    id: row.id as number,
    title: (row.title as string) ?? '',
    salaryText: (row.salary_text as string | null) ?? '',
    employmentType: (row.employment_type as string | null) ?? 'OTHER',
    publishedAt: (row.published_at as string | null) ?? null,
    features: sanitizeFeatures(row.features),
    salon: {
      id: salon.id,
      name: salon.name ?? '',
      area: salon.area ?? '',
    },
  };
}

// ── ピックアップ求人（/jobs トップのおすすめスライダー） ──
// 運営が salon_jobs.is_pickup=true にした求人を、公開中(is_active)かつ表示中サロン(is_hidden=false)に
// 限って published_at 降順・最大10件で返す。サロンのメイン画像（salon_images の最小 display_order）を
// カード用に併せて取得する。0件時は空配列（呼び出し側でセクションごと非表示）。
export async function getPickupJobs(): Promise<PickupJob[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_jobs')
    .select('id, title, salary_text, published_at, salon_id, salons!inner(id, name, is_hidden)')
    .eq('is_pickup', true)
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false })
    .limit(10);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // サロンのメイン画像を一括取得（display_order 昇順の先頭＝メイン。salon 詳細と同じ salon_images 参照）。
  const salonIds = [...new Set(rows.map((r) => Number(r.salon_id)))];
  const imageBySalon = new Map<number, string>();
  const { data: imgRows } = await supabase
    .from('salon_images')
    .select('salon_id, image_url, display_order')
    .in('salon_id', salonIds)
    .order('display_order', { ascending: true });
  (imgRows ?? []).forEach((img) => {
    const sid = Number(img.salon_id);
    // 最小 display_order（＝最初に来た行）をメイン画像として採用。
    if (!imageBySalon.has(sid) && img.image_url) imageBySalon.set(sid, img.image_url as string);
  });

  return rows
    .map((row): PickupJob | null => {
      const salon = pickSalon<{ id: number; name: string | null }>(row.salons);
      if (!salon) return null;
      return {
        id: row.id as number,
        title: (row.title as string | null) ?? '',
        salaryText: (row.salary_text as string | null) ?? '',
        salon: { id: salon.id, name: salon.name ?? '' },
        imageUrl: imageBySalon.get(Number(row.salon_id)) ?? null,
      };
    })
    .filter((j): j is PickupJob => j !== null);
}

// ── 特徴タグ絞り込み一覧用（/jobs/tag/[slug]） ──
export async function fetchActiveJobsByFeature(slug: string): Promise<JobListItem[]> {
  if (!isValidFeatureSlug(slug)) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_jobs')
    .select('id, title, salary_text, employment_type, published_at, features, salons!inner(id, name, area, is_hidden)')
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .contains('features', [slug])
    .order('published_at', { ascending: false });

  return (data ?? [])
    .map((row) => mapJobListItem(row))
    .filter((j): j is JobListItem => j !== null);
}

// ── 詳細用 ───────────────────────────────────────────
export async function fetchJobById(id: number): Promise<JobDetail | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('salon_jobs')
    .select(
      'id, title, salary_text, employment_type, published_at, work_hours, requirements, benefits, access, description, salary_min, salary_max, features, salons!inner(id, name, area, address, phone, is_hidden)'
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
    features: sanitizeFeatures(data.features),
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

// ── sitemap 用：掲載中求人が1件以上ある特徴タグの slug 集合 ──
// 0件（＝noindex）のタグページは sitemap に入れないため、実在するタグだけ返す。
export async function fetchFeatureSlugsWithActiveJobs(): Promise<string[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_jobs')
    .select('features, salons!inner(is_hidden)')
    .eq('is_active', true)
    .eq('salons.is_hidden', false);

  const present = new Set<string>();
  (data ?? []).forEach((row) => {
    sanitizeFeatures((row as Record<string, unknown>).features).forEach((slug) => present.add(slug));
  });
  // マスタ順で返す。
  return JOB_FEATURES.map((f) => f.slug).filter((slug) => present.has(slug));
}

