// 口コミ（therapist_reviews）の公開/共通の読み取り。
// 公開ページ（ISR）から呼ぶため、必ず cookieレス匿名クライアント createPublicClient を使う
// ＝ cookies() を呼ばないので動的化せず revalidate が効く。
//
// therapist_reviews と profiles の間には PostgREST の FK 埋め込み（profiles(nickname)）が使えないため、
// 「reviews を取得 → user_id を集めて profiles を別クエリで引き、JS 側で nickname をマッピング」する
// 2クエリ方式にする（VIPレターの配信対象解決と同じ発想）。nickname が無いユーザーは「ゲスト」と表示。

import { createPublicClient } from '@/app/lib/supabase/public';

export type ApprovedReview = {
  id: string;
  rating: number;
  body: string;
  created_at: string;
  nickname: string;
};

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

// 承認済みの口コミを新しい順で取得し、各レビューに nickname（無ければ 'ゲスト'）を付与して返す。
export async function getApprovedReviews(therapistId: number): Promise<ApprovedReview[]> {
  if (!Number.isFinite(therapistId)) return [];
  const supabase = createPublicClient();

  const { data: rows, error } = await supabase
    .from('therapist_reviews')
    .select('id, rating, body, created_at, user_id')
    .eq('therapist_id', therapistId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error || !rows || rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const nameMap = await fetchNicknameMap(supabase, userIds);

  return rows.map((r) => ({
    id: String(r.id),
    rating: Number(r.rating),
    body: (r.body as string) ?? '',
    created_at: String(r.created_at),
    nickname: nameMap.get(r.user_id as string) ?? 'ゲスト',
  }));
}

// 承認済みのみで件数と平均（小数第1位まで・0件は average=null）を返す。
// 承認済み行は少数のため都度集計で十分。
export async function getReviewStats(
  therapistId: number,
): Promise<{ count: number; average: number | null }> {
  if (!Number.isFinite(therapistId)) return { count: 0, average: null };
  const supabase = createPublicClient();

  const { data: rows, error } = await supabase
    .from('therapist_reviews')
    .select('rating')
    .eq('therapist_id', therapistId)
    .eq('status', 'approved');
  if (error || !rows || rows.length === 0) return { count: 0, average: null };

  const count = rows.length;
  const sum = rows.reduce((acc, r) => acc + Number(r.rating), 0);
  const average = Math.round((sum / count) * 10) / 10; // 例 4.3
  return { count, average };
}
