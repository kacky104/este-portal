// ページ別ヒーロー（ヘッダー）画像URLの取得。ランキングの fetchRankingHero と同流儀。
// createPublicClient（anon/cookieレス）で読み、ISR が効くようにする。
import { createPublicClient } from '@/app/lib/supabase/public';

export type PageHeroKey = 'therapists' | 'diary' | 'reviews' | 'newface' | 'xshops' | 'news';

export const PAGE_HERO_LABELS: Record<PageHeroKey, string> = {
  therapists: '特徴で探す',
  diary: '写メ日記',
  reviews: '口コミ',
  newface: '新人',
  xshops: 'SNS',
  news: '新着情報',
};

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
