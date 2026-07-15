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
import { createServiceClient } from '@/app/lib/supabase/service';

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
  therapistName?: string; // サロン単位の一覧で「○○さんへの口コミ」表示に使う。セラピスト単位の取得では付与しない。
  therapistImage?: string | null; // サロン単位の一覧で丸アイコン表示に使う。セラピスト単位の取得では付与しない。
  salonName?: string; // 全店舗一覧（/reviews）で所属店名を表示・リンクするのに使う。他の取得では付与しない。
  salonId?: number; // 全店舗一覧（/reviews）で /salon/[id] へのリンクに使う。
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

// サロン単位の承認済み口コミ一覧（在籍 is_active=true セラピストへの承認済みを新しい順）。
// 各口コミに対象セラピスト名（therapistName）を付与する。getApprovedReviews/getSalonReviewStats のロジックを組み合わせ。
export async function getSalonApprovedReviews(salonId: number): Promise<ApprovedReview[]> {
  if (!Number.isFinite(salonId)) return [];
  const supabase = createPublicClient();

  // 1. 在籍（is_active=true）セラピストの id, name, 画像 → id→{name, image} マップ。
  const { data: therapists } = await supabase
    .from('therapists')
    .select('id, name, profile_image_url')
    .eq('salon_id', salonId)
    .eq('is_active', true);
  const therapistRows = therapists ?? [];
  if (therapistRows.length === 0) return [];
  const byId = new Map<number, { name: string; image: string | null }>();
  therapistRows.forEach((t) =>
    byId.set(t.id as number, {
      name: (t.name as string) ?? '',
      image: (t.profile_image_url as string | null) ?? null,
    }),
  );
  const ids = [...byId.keys()];

  // 2. その therapist_id 群への承認済み口コミ（新しい順）。
  const { data, error } = await supabase
    .from('therapist_reviews')
    .select(REVIEW_COLUMNS)
    .in('therapist_id', ids)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error || !data || data.length === 0) return [];
  const rows = data as unknown as ReviewRow[];

  // 3. nickname を別クエリ解決（無ければ 'ゲスト'）。
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
      therapistName: byId.get(r.therapist_id)?.name ?? '',
      therapistImage: byId.get(r.therapist_id)?.image ?? null,
    };
  });
}

// 全店舗の承認済み口コミを新着順で取得（/reviews 用）。
// 公開ルール：非表示サロン所属・非在籍（is_active=false）セラピストの口コミは除外。
// 各口コミに therapistName/Image＋salonName/Id を付与し、一覧で「誰・どの店」を出せるようにする。
// created_at 降順で最新 limit 件を取得してから公開フィルタ（件数は緩めに取る）。
export async function getAllApprovedReviews(limit = 200): Promise<ApprovedReview[]> {
  const supabase = createPublicClient();

  // 1. 最新の承認済み口コミ（新着順・上限 limit）。
  const { data, error } = await supabase
    .from('therapist_reviews')
    .select(REVIEW_COLUMNS)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data || data.length === 0) return [];
  const rows = data as unknown as ReviewRow[];

  // 2. 対象セラピスト → 名前/画像/所属店（公開・在籍のみ）。非表示店/非在籍はここで落ちる。
  const therapistIds = [...new Set(rows.map((r) => r.therapist_id))];
  const { data: therapists } = await supabase
    .from('therapists')
    .select('id, name, profile_image_url, salon_id, salons!inner(name, is_hidden)')
    .in('id', therapistIds)
    .eq('is_active', true)
    .eq('salons.is_hidden', false);
  const byId = new Map<number, { name: string; image: string | null; salonId: number; salonName: string }>();
  for (const t of therapists ?? []) {
    const s = Array.isArray(t.salons) ? t.salons[0] : t.salons;
    byId.set(t.id as number, {
      name: (t.name as string) ?? '',
      image: (t.profile_image_url as string | null) ?? null,
      salonId: t.salon_id as number,
      salonName: ((s as { name?: string } | null)?.name as string) ?? '',
    });
  }

  // 3. nickname を別クエリ解決（無ければ 'ゲスト'）。
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const nameMap = await fetchNicknameMap(supabase, userIds);

  // 4. 公開対象（byId に残った）口コミだけを組み立て（新着順は rows の順序を維持）。
  return rows
    .filter((r) => byId.has(r.therapist_id))
    .map((r) => {
      const info = byId.get(r.therapist_id)!;
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
        therapistName: info.name,
        therapistImage: info.image,
        salonName: info.salonName,
        salonId: info.salonId,
      };
    });
}

// 承認済み口コミからサロンの rating/review_count を計算し salons に焼き込む（キャッシュ列同期）。
// 評価の定義は getSalonReviewStats と同一（is_active セラピストの承認済み口コミの総合平均・件数）。
// 同じ計算ヘルパー（overallOf/avg1 → statsFromRows）を使い回し、カードと詳細で値がズレないようにする。
// salons への書き込みは service_role が必要なため createServiceClient を使う。
// 承認/却下/削除アクションから、DB更新が成功した後に呼ぶ。
export async function syncSalonRating(salonId: number): Promise<void> {
  if (!Number.isFinite(salonId)) return;
  const svc = createServiceClient();

  // 1. 在籍（is_active=true）セラピストの id 群。
  const { data: therapists } = await svc
    .from('therapists')
    .select('id')
    .eq('salon_id', salonId)
    .eq('is_active', true);
  const ids = (therapists ?? []).map((t) => t.id as number);

  // 2. その therapist_id 群の承認済み口コミ3軸（0人/0件なら空配列＝rating0/count0）。
  let rows: ReviewRow[] = [];
  if (ids.length > 0) {
    const { data } = await svc
      .from('therapist_reviews')
      .select('rating_service, rating_technique, rating_reception')
      .in('therapist_id', ids)
      .eq('status', 'approved');
    rows = (data ?? []) as unknown as ReviewRow[];
  }

  // 3. getSalonReviewStats と同一の計算（statsFromRows）で総合平均・件数。
  const stats = statsFromRows(rows);
  const rating = stats.avgOverall ?? 0; // 0件は 0
  const reviewCount = stats.count;

  // 4. salons の既存 rating/review_count 列に焼き込む（新規列は作らない）。
  await svc.from('salons').update({ rating, review_count: reviewCount }).eq('id', salonId);
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
