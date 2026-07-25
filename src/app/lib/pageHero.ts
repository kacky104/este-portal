// ページ別ヒーロー（ヘッダー）画像URLの取得。ランキングの fetchRankingHero と同流儀。
// createPublicClient（anon/cookieレス）で読み、ISR が効くようにする。
import { createPublicClient } from '@/app/lib/supabase/public';

export type PageHeroKey = 'therapists' | 'diary' | 'reviews' | 'newface' | 'xshops' | 'news' | 'salons' | 'jobs-matching';

export const PAGE_HERO_LABELS: Record<PageHeroKey, string> = {
  therapists: '特徴で探す',
  diary: '写メ日記',
  reviews: '口コミ',
  newface: '新人',
  xshops: 'SNS',
  news: '新着情報',
  salons: '掲載店舗一覧',
  'jobs-matching': 'お仕事マッチング',
};

// 各キーの公開ページパス。/api/revalidate（pageHeroes指定時）の無効化対象はこの表から生成する。
export const PAGE_HERO_PATHS: Record<PageHeroKey, string> = {
  therapists: '/therapists',
  diary: '/diary',
  reviews: '/reviews',
  newface: '/therapist/new',
  xshops: '/x-shops',
  news: '/news',
  salons: '/salons',
  'jobs-matching': '/jobs/matching',
};

// 管理画面のグループ分け：本体タブ＝MAIN／求人タブ＝JOBS（PageHeroManager の keys に渡す）。
// ヒーロー設定対象のページを増やす手順：
//   1. PageHeroKey・PAGE_HERO_LABELS・PAGE_HERO_PATHS に追加
//   2. admin_set_page_hero の許可キーへ追加する migration を作成（Supabaseへ適用）
//   3. 下のどちらかのグループ（または新グループ）へ追加 → 該当タブの管理UIに自動で並ぶ
//   4. 公開ページ側で fetchPageHero('<key>') → <PageHero> を表示
export const MAIN_PAGE_HERO_KEYS: readonly PageHeroKey[] = ['therapists', 'diary', 'reviews', 'newface', 'xshops', 'news', 'salons'];
export const JOBS_PAGE_HERO_KEYS: readonly PageHeroKey[] = ['jobs-matching'];

// 未設定は null を返す（テーブル未作成時もエラーを握りつぶして null）。
export async function fetchPageHero(key: PageHeroKey): Promise<string | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('page_heroes')
    .select('image_url')
    .eq('page_key', key)
    .maybeSingle();
  return ((data?.image_url as string | null) ?? null) || null;
}
