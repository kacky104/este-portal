import type { SupabaseClient } from '@supabase/supabase-js';

// サロン一覧で使うデータ形。トップ／一覧／保存ページで共有する。
export type Salon = {
  id:          number;
  name:        string;
  rating:      number;
  reviewCount: number;
  tags:        string[];
  price:       string;
  area:        string;
  hours:       string;
  description: string;
};

// 取得列はここ1か所に集約（二重実装しない）。
const SALON_COLUMNS =
  'id, name, rating, review_count, tags, price, area, hours, description';

function mapSalonRow(row: Record<string, unknown>): Salon {
  return {
    id:          row.id as number,
    name:        (row.name as string) ?? '',
    rating:      (row.rating as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    tags:        (row.tags as string[]) ?? [],
    price:       (row.price as string) ?? '',
    area:        (row.area as string) ?? '',
    hours:       (row.hours as string) ?? '',
    description: (row.description as string) ?? '',
  };
}

/**
 * サロン一覧を取得する単一の取得ロジック。
 * - ids 未指定: 全件（トップ／一覧ページ）。
 * - ids 指定: その ID 群のみ（保存ページ）。空配列なら即 []。
 * server / browser どちらの Supabase クライアントでも呼べる。
 */
export async function fetchSalons(
  supabase: SupabaseClient,
  ids?: number[]
): Promise<Salon[]> {
  if (ids && ids.length === 0) return [];
  let query = supabase.from('salons').select(SALON_COLUMNS);
  if (ids) query = query.in('id', ids);
  const { data } = await query;
  return (data ?? []).map(row => mapSalonRow(row as Record<string, unknown>));
}
