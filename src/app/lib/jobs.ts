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
  { slug: '40dai',              label: '40代歓迎' },
  { slug: '50dai',              label: '50代以上歓迎' },
  // 働き方
  { slug: 'jiyu-shukkin',       label: '自由出勤' },
  { slug: 'shu1',               label: '週1日〜OK' },
  { slug: 'w-work',             label: 'Wワーク歓迎' },
  { slug: 'tanjikan',           label: '短時間OK' },
  { slug: 'taiken',             label: '体験入店OK' },
  { slug: 'shuccho-senmon',     label: '出張専門' },
  // 待遇・お金
  { slug: 'hibarai',            label: '日払いOK' },
  { slug: 'high-back',          label: '高バック率' },
  { slug: 'hosho',              label: '保証制度あり' },
  // 環境・安心
  { slug: 'koshitsu-taiki',     label: '個室待機' },
  { slug: 'sogei',              label: '送迎あり' },
  { slug: 'jitaku-haken-nashi', label: '自宅派遣なし' },
] as const;

export const MAX_JOB_FEATURES = 6;

// 「特徴から探す」／フォームのカテゴリ表示用グルーピング（slug は JOB_FEATURES と一致）。
export const JOB_FEATURE_GROUPS: { title: string; slugs: string[] }[] = [
  { title: '経験・年齢', slugs: ['mikeiken', 'keikensha', '20dai', '30dai', '40dai', '50dai'] },
  { title: '働き方',     slugs: ['jiyu-shukkin', 'shu1', 'w-work', 'tanjikan', 'taiken', 'shuccho-senmon'] },
  { title: '待遇・お金', slugs: ['hibarai', 'high-back', 'hosho'] },
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

// メール形式の簡易チェック（応募通知メール等で共用。クライアント／サーバー両方で使う）。
// サロン編集モーダルの booking_email と同一方式。空欄可の欄では呼び出し側で「空ならスキップ」を判定する。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmailFormat(value: string): boolean {
  return EMAIL_RE.test(value.trim());
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
  // 求人バナー画像URL（16:9・任意）。/jobs トップの「注目の求人」バナー枠のみで使用。
  // 一覧カード（JobCard）は参照しない。fetchActiveJobs でのみ SELECT する（他取得系では null）。
  heroImageUrl: string | null;
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
    // hero_image_url を1列だけ相乗り（/jobs トップのバナー枠を別クエリ無しで賄う）。
    .select('id, title, salary_text, employment_type, published_at, features, hero_image_url, salons!inner(id, name, area, is_hidden)')
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
    // SELECT に hero_image_url を含む取得系（fetchActiveJobs）のみ値が入る。他は undefined→null。
    heroImageUrl: (row.hero_image_url as string | null) ?? null,
  };
}

// ── おすすめ求人（/jobs トップのスライダー）: featured_jobs 専用テーブル方式 ──
// 本体のピックアップサロン（featured_salons）と同方式。運営が /admin で登録した featured_jobs を
// area IS NULL（トップ共通）・display_order 昇順・最大5件で取得し、salon_jobs（is_active かつ
// サロン is_hidden=false の多重チェックを維持）と結合する。カード画像は featured_jobs.image_url が
// あればそれを、無ければ従来どおりサロンのメイン画像（salon_images 最小 display_order）を使う。
// 並び順は display_order のまま表示（本体スライダーのマウント後ランダムシャッフルは踏襲しない）。
// 0件時は空配列（呼び出し側でセクションごと非表示）。
export async function getFeaturedJobs(): Promise<PickupJob[]> {
  const supabase = createPublicClient();

  // 1) featured_jobs（トップ共通＝area IS NULL）を並び順で取得。
  //    ※ 将来エリア別対応時は area 引数を足し、.is('area', null) を .eq('area', area) に切替える。
  const { data: featuredData } = await supabase
    .from('featured_jobs')
    .select('job_id, display_order, image_url')
    .is('area', null)
    .order('display_order', { ascending: true })
    .limit(5);

  const featuredRows = featuredData ?? [];
  if (featuredRows.length === 0) return [];

  const jobIds = [...new Set(featuredRows.map((r) => Number(r.job_id)))];

  // 2) 対象求人を公開中(is_active)＋サロン表示中(is_hidden=false)に限って取得（多重防御）。
  const { data: jobData } = await supabase
    .from('salon_jobs')
    .select('id, title, salary_text, salon_id, salons!inner(id, name, is_hidden)')
    .in('id', jobIds)
    .eq('is_active', true)
    .eq('salons.is_hidden', false);

  const jobById = new Map<number, { title: string; salaryText: string; salonId: number; salonName: string }>();
  (jobData ?? []).forEach((row) => {
    const salon = pickSalon<{ id: number; name: string | null }>(row.salons);
    if (!salon) return;
    jobById.set(Number(row.id), {
      title: (row.title as string | null) ?? '',
      salaryText: (row.salary_text as string | null) ?? '',
      salonId: salon.id,
      salonName: salon.name ?? '',
    });
  });

  // 3) 差し替え画像が無い求人向けに、サロンのメイン画像を一括取得。
  const salonIds = [...new Set([...jobById.values()].map((j) => j.salonId))];
  const imageBySalon = new Map<number, string>();
  if (salonIds.length > 0) {
    const { data: imgRows } = await supabase
      .from('salon_images')
      .select('salon_id, image_url, display_order')
      .in('salon_id', salonIds)
      .order('display_order', { ascending: true });
    (imgRows ?? []).forEach((img) => {
      const sid = Number(img.salon_id);
      if (!imageBySalon.has(sid) && img.image_url) imageBySalon.set(sid, img.image_url as string);
    });
  }

  // 4) featured_jobs の display_order 順を維持しつつ、ineligible（非公開/非表示化）な求人は除外。
  return featuredRows
    .map((fr): PickupJob | null => {
      const job = jobById.get(Number(fr.job_id));
      if (!job) return null;
      return {
        id: Number(fr.job_id),
        title: job.title,
        salaryText: job.salaryText,
        salon: { id: job.salonId, name: job.salonName },
        // featured_jobs.image_url を最優先、無ければサロンのメイン画像。
        imageUrl: (fr.image_url as string | null) ?? imageBySalon.get(job.salonId) ?? null,
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

