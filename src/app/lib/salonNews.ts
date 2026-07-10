import type { SupabaseClient } from '@supabase/supabase-js';

// トップ「サロン新着情報」ブロック／/news 一覧の共通取得。
// announcements（公開のみ）を published_at 降順で取り、salons!inner で非表示サロン分を除外する
// （anon RLS でも不可視だが、therapist_schedules と同様に表示条件を明文化する二重防御）。
export type SalonNewsItem = {
  id: string;
  salonId: number;
  salonName: string;
  title: string;
  imageUrl: string | null;
  publishedAt: string; // ISO
};

export async function fetchLatestSalonNews(supabase: SupabaseClient, limit: number): Promise<SalonNewsItem[]> {
  const { data } = await supabase
    .from('announcements')
    .select('id, salon_id, title, image_url, published_at, salons!inner(id, name, is_hidden)')
    .eq('is_published', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => {
    // to-one リレーションはオブジェクトで返るが、型上は配列になり得るため両対応で name を取る。
    const salonRel = r.salons as { name?: string } | Array<{ name?: string }> | null;
    const salonName = Array.isArray(salonRel) ? (salonRel[0]?.name ?? '') : (salonRel?.name ?? '');
    return {
      id: String(r.id),
      salonId: Number(r.salon_id),
      salonName,
      title: (r.title as string) ?? '',
      imageUrl: (r.image_url as string | null) ?? null,
      publishedAt: (r.published_at as string) ?? '',
    };
  });
}
