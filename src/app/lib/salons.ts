import type { SupabaseClient } from '@supabase/supabase-js';
import { cheapestCoursePrice } from '@/lib/coursePrice';

// サロン一覧で使うデータ形。トップ／一覧／保存ページで共有する。
export type Salon = {
  id:          number;
  name:        string;
  rating:      number;
  reviewCount: number;
  tags:        string[];
  price:       string;
  area:        string;
  area2:       string; // 第2エリア（任意）。未設定は ''。
  hours:       string;
  description: string;
  // area とは独立した別軸のフラグ。
  showOnTop:    boolean; // トップ（/＝福岡市全域）に出すか
  dispatchType: 'none' | 'available' | 'only'; // 出張区分（none=なし / available=店舗あり＋出張 / only=出張専門）
};

export type DispatchType = Salon['dispatchType'];

// 取得列はここ1か所に集約（二重実装しない）。
// price はカラム（先頭コース由来の旧スナップショット）だが、カード表示は courses から算出した最安に切替えるため courses も取得。
const SALON_COLUMNS =
  'id, name, rating, review_count, tags, price, area, area2, hours, description, show_on_top, dispatch_type, courses';

function mapSalonRow(row: Record<string, unknown>): Salon {
  return {
    id:          row.id as number,
    name:        (row.name as string) ?? '',
    rating:      (row.rating as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    tags:        (row.tags as string[]) ?? [],
    // カード料金＝コースメニューの最安（時間付きコースの price 最小）。
    // 算出不可（時間付きコース0件）のときは従来の price カラムにフォールバック（現状踏襲・破綻防止）。
    price:       cheapestCoursePrice(row.courses) || ((row.price as string) ?? ''),
    area:        (row.area as string) ?? '',
    area2:       (row.area2 as string) ?? '',
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
  // 非表示サロンは公開一覧から除外（RLSに加え明示フィルタで多重防御。
  // オーナー本人がログイン中に公開一覧を見た場合も、公開側では出さない）。
  query = query.eq('is_hidden', false);
  const { data } = await query;
  return (data ?? []).map(row => mapSalonRow(row as Record<string, unknown>));
}
