// 口コミ（therapist_reviews）の公開/共通の読み取り。
// 公開ページ（ISR）から呼ぶため、必ず cookieレス匿名クライアント createPublicClient を使う
// ＝ cookies() を呼ばないので動的化せず revalidate が効く。
//
// therapist_reviews と profiles/therapists の間には PostgREST の FK 埋め込みが使えないため、
// 「reviews を取得 → user_id / therapist_id を集めて別クエリで引き、JS 側でマッピング」する方式にする。
//
// ★「総合」「店舗評価」は保存しない＝計算で出す
//  - 各口コミの総合 = (rating_service + rating_technique + rating_reception) / 3（表示時に計算）。
//  - 店舗の評価 = その店舗に salon_id で属する is_active=true セラピストへの承認済み口コミを束ね、
//    3軸平均・総合平均・総件数を計算で出す（salons に評価列は作らない）。

import { createPublicClient } from '@/app/lib/supabase/public';

export type ApprovedReview = {
  id: string;
  therapistId: number;
  ratingService: number;
  ratingTechnique: number;
  ratingReception: number;
  overall: number; // 3軸平均（小数1位）
  body: string;
  visitedOn: string; // 'YYYY-MM-DD'
  createdAt: string;
  nickname: string; // 無ければ 'ゲスト'
};

export type ReviewStats = {
  count: number;
  avgService: number | null;
  avgTechnique: number | null;
  avgReception: number | null;
  avgOverall: number | null; // 全行 overall の平均（0件は null）
};

// 配列の平均を小数1位で返す（空なら null）。
function avg1(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

// 1件の3軸から総合（小数1位）を計算。
function overallOf(service: number, technique: number, reception: number): number {
  return Math.round(((service + technique + reception) / 3) * 10) / 10;
}

type ReviewRow = {
  id: string | number;
  therapist_id: number;
  user_id: string;
  rating_service: number | string;
  rating_technique: number | string;
  rating_reception: number | string;
  body: string | null;
  visited_on: string;
  created_at: string;
};

const REVIEW_COLUMNS =
  'id, therapist_id, user_id, rating_service, rating_technique, rating_reception, body, visited_on, created_at';

// user_id → nickname のマップを引く（空配列なら空マップ）。nickname 未設定/空白は載せない。
async function fetchNicknameMap(
  supabase: ReturnType<typeof createPublicClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nickname')
    .in('id', userIds);
  (profiles ?? []).forEach((p) => {
    const nn = (p.nickname as string | null)?.trim();
    if (nn) map.set(p.id as string, nn);
  });
  return map;
}

// 3軸の数値配列から ReviewStats を組み立てる（取得済み行を渡す）。
function statsFromRows(rows: ReviewRow[]): ReviewStats {
  if (rows.length === 0) {
    return { count: 0, avgService: null, avgTechnique: null, avgReception: null, avgOverall: null };
  }
  const services = rows.map((r) => Number(r.rating_service));
  const techniques = rows.map((r) => Number(r.rating_technique));
  const receptions = rows.map((r) => Number(r.rating_reception));
  const overalls = rows.map((_, i) => overallOf(services[i], techniques[i], receptions[i]));
  return {
    count: rows.length,
    avgService: avg1(services),
    avgTechnique: avg1(techniques),
    avgReception: avg1(receptions),
    avgOverall: avg1(overalls),
  };
}

// 承認済みの口コミを新しい順で取得し、各レビューに overall と nickname（無ければ 'ゲスト'）を付与。
export async function getApprovedReviews(therapistId: number): Promise<ApprovedReview[]> {
  if (!Number.isFinite(therapistId)) return [];
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('therapist_reviews')
    .select(REVIEW_COLUMNS)
    .eq('therapist_id', therapistId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error || !data || data.length === 0) return [];
  const rows = data as unknown as ReviewRow[];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const nameMap = await fetchNicknameMap(supabase, userIds);

  return rows.map((r) => {
    const s = Number(r.rating_service);
    const t = Number(r.rating_technique);
    const rc = Number(r.rating_reception);
    return {
      id: String(r.id),
      therapistId: r.therapist_id,
      ratingService: s,
      ratingTechnique: t,
      ratingReception: rc,
      overall: overallOf(s, t, rc),
      body: r.body ?? '',
      visitedOn: String(r.visited_on),
      createdAt: String(r.created_at),
      nickname: nameMap.get(r.user_id) ?? 'ゲスト',
    };
  });
}

// セラピスト単位の承認済み集計（件数・3軸平均・総合平均）。
export async function getReviewStats(therapistId: number): Promise<ReviewStats> {
  if (!Number.isFinite(therapistId)) {
    return { count: 0, avgService: null, avgTechnique: null, avgReception: null, avgOverall: null };
  }
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('therapist_reviews')
    .select('rating_service, rating_technique, rating_reception')
    .eq('therapist_id', therapistId)
    .eq('status', 'approved');
  if (error || !data) {
    return { count: 0, avgService: null, avgTechnique: null, avgReception: null, avgOverall: null };
  }
  return statsFromRows(data as unknown as ReviewRow[]);
}

// 店舗単位の承認済み集計：salon_id で属する is_active=true セラピストへの承認済み口コミを束ねて計算。
export async function getSalonReviewStats(salonId: number): Promise<ReviewStats> {
  const empty: ReviewStats = {
    count: 0,
    avgService: null,
    avgTechnique: null,
    avgReception: null,
    avgOverall: null,
  };
  if (!Number.isFinite(salonId)) return empty;
  const supabase = createPublicClient();

  // 1. 在籍（is_active=true）セラピストの id 一覧。
  const { data: therapists } = await supabase
    .from('therapists')
    .select('id')
    .eq('salon_id', salonId)
    .eq('is_active', true);
  const ids = (therapists ?? []).map((t) => t.id as number);
  if (ids.length === 0) return empty;

  // 2. その therapist_id 群に対する承認済み口コミ。
  const { data, error } = await supabase
    .from('therapist_reviews')
    .select('rating_service, rating_technique, rating_reception')
    .in('therapist_id', ids)
    .eq('status', 'approved');
  if (error || !data) return empty;

  return statsFromRows(data as unknown as ReviewRow[]);
}

// 投稿フォームの選択肢用：在籍（is_active=true）セラピストを name 昇順で返す。
// 在籍一覧自体は公開情報なので createPublicClient でよい。
export async function getSalonActiveTherapists(
  salonId: number,
): Promise<{ id: number; name: string }[]> {
  if (!Number.isFinite(salonId)) return [];
  const supabase = createPublicClient();

  const { data } = await supabase
    .from('therapists')
    .select('id, name')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  return (data ?? []).map((t) => ({ id: t.id as number, name: (t.name as string) ?? '' }));
}
