import type { SupabaseClient } from '@supabase/supabase-js';
import { cheapestCoursePrice } from '@/lib/coursePrice';

// リンクバナー設置特典で「カード優先表示」に使う重み。
// トップ／地域ページの30分ごとカードシャッフルで、card_boost=true のサロンに与える重み。
// 1.0=従来（差なし）。1.5 で「一覧の上側（半数より上）に来やすくなる」効果になる。
export const CARD_BOOST_WEIGHT = 1.5;

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
  catchphrase: string; // TOP/地域の店舗カードに出すキャッチフレーズ（最大27文字）
  // area とは独立した別軸のフラグ。
  showOnTop:    boolean; // トップ（/＝福岡市全域）に出すか
  dispatchType: 'none' | 'available' | 'only'; // 出張区分（none=なし / available=店舗あり＋出張 / only=出張専門）
  cardBoost:    boolean; // カード優先表示（バナー設置特典）。true で一覧の上側に来やすい。
};

export type DispatchType = Salon['dispatchType'];

// 取得列はここ1か所に集約（二重実装しない）。
// price はカラム（先頭コース由来の旧スナップショット）だが、カード表示は courses から算出した最安に切替えるため courses も取得。
const SALON_COLUMNS_BASE =
  'id, name, rating, review_count, tags, price, area, area2, hours, description, show_on_top, dispatch_type, courses';
// card_boost を含む本番用。マイグレーション未適用の環境では下記フォールバックで BASE に切替える。
const SALON_COLUMNS = `${SALON_COLUMNS_BASE}, card_boost, catchphrase`;

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
    catchphrase: (row.catchphrase as string) ?? '',
    showOnTop:    (row.show_on_top as boolean) ?? true,
    dispatchType: (row.dispatch_type as 'none' | 'available' | 'only') ?? 'none',
    cardBoost:    (row.card_boost as boolean) ?? false,
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
  // 非表示サロンは公開一覧から除外（RLSに加え明示フィルタで多重防御。
  // オーナー本人がログイン中に公開一覧を見た場合も、公開側では出さない）。
  const build = (cols: string) => {
    let q = supabase.from('salons').select(cols);
    if (ids) q = q.in('id', ids);
    if (opts?.showOnTopOnly) q = q.eq('show_on_top', true);
    q = q.eq('is_hidden', false);
    return q;
  };
  // card_boost 列を含めて取得。マイグレーション未適用の環境では列が無くクエリが失敗するため、
  // その場合は BASE 列（card_boost なし）で再取得してフォールバックする（サイトを落とさない）。
  let res = await build(SALON_COLUMNS);
  if (res.error) res = await build(SALON_COLUMNS_BASE);
  return (res.data ?? []).map(row => mapSalonRow(row as unknown as Record<string, unknown>));
}
