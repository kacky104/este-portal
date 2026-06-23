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
  // area とは独立した別軸のフラグ。
  showOnTop:    boolean; // トップ（/＝福岡市全域）に出すか
  dispatchType: 'none' | 'available' | 'only'; // 出張区分（none=なし / available=店舗あり＋出張 / only=出張専門）
};

export type DispatchType = Salon['dispatchType'];

// 取得列はここ1か所に集約（二重実装しない）。
const SALON_COLUMNS =
  'id, name, rating, review_count, tags, price, area, hours, description, show_on_top, dispatch_type';

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
    showOnTop:    (row.show_on_top as boolean) ?? true,
    dispatchType: (row.dispatch_type as 'none' | 'available' | 'only') ?? 'none',
  };
}

/**
 * サロン一覧を取得する単一の取得ロジック。
 * - opts.ids 未指定: 全件（一覧／地域ページ）。
 * - opts.ids 指定: その ID 群のみ（保存ページ）。空配列なら即 []。
 * - opts.showOnTopOnly: show_on_top = true のみ（トップページ用）。
 * server / browser どちらの Supabase クライアントでも呼べる。
 */
export async function fetchSalons(
  supabase: SupabaseClient,
  opts?: { ids?: number[]; showOnTopOnly?: boolean }
): Promise<Salon[]> {
  const ids = opts?.ids;
  if (ids && ids.length === 0) return [];
  let query = supabase.from('salons').select(SALON_COLUMNS);
  if (ids) query = query.in('id', ids);
  if (opts?.showOnTopOnly) query = query.eq('show_on_top', true);
  const { data } = await query;
  return (data ?? []).map(row => mapSalonRow(row as Record<string, unknown>));
}
