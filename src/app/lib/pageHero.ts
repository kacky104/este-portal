// ページ別ヒーロー（ヘッダー）画像URLの取得。ランキングの fetchRankingHero と同流儀。
// createPublicClient（anon/cookieレス）で読み、ISR が効くようにする。
import { createPublicClient } from '@/app/lib/supabase/public';

export type PageHeroKey =
  | 'therapists'
  | 'diary'
  | 'reviews'
  | 'reviews-therapist'
  | 'reviews-hall'
  | 'newface'
  | 'xshops'
  | 'news'
  | 'salons'
  | 'join'
  | 'listing'
  | 'jobs-matching';

export const PAGE_HERO_LABELS: Record<PageHeroKey, string> = {
  therapists: '特徴で探す',
  diary: '写メ日記',
  reviews: '口コミ',
  'reviews-therapist': '口コミランキング',
  'reviews-hall': '殿堂入り',
  newface: '新人',
  xshops: 'SNS',
  news: '新着情報',
  salons: 'メンズエステ店一覧',
  join: '会員登録案内',
  listing: '掲載について',
  'jobs-matching': 'お仕事マッチング',
};

// 各キーの公開ページパス。/api/revalidate（pageHeroes指定時）の無効化対象はこの表から生成する。
export const PAGE_HERO_PATHS: Record<PageHeroKey, string> = {
  therapists: '/therapists',
  diary: '/diary',
  reviews: '/reviews',
  'reviews-therapist': '/reviews', // 口コミ一覧のタブ（#therapist）＝無効化対象ページは /reviews
  'reviews-hall': '/reviews', // 口コミ一覧のタブ（#hall）＝無効化対象ページは /reviews
  newface: '/therapist/new',
  xshops: '/x-shops',
  news: '/news',
  salons: '/salons',
  join: '/join',
  listing: '/listing',
  'jobs-matching': '/jobs/matching',
};

// 管理画面のグループ分け：本体タブ＝MAIN／求人タブ＝JOBS（PageHeroManager の keys に渡す）。
// ヒーロー設定対象のページを増やす手順：
//   1. PageHeroKey・PAGE_HERO_LABELS・PAGE_HERO_PATHS に追加
//   2. admin_set_page_hero の許可キーへ追加する migration を作成（Supabaseへ適用）
//   3. 下のどちらかのグループ（または新グループ）へ追加 → 該当タブの管理UIに自動で並ぶ
//   4. 公開ページ側で fetchPageHero('<key>') → <PageHero> を表示
export const MAIN_PAGE_HERO_KEYS: readonly PageHeroKey[] = ['therapists', 'diary', 'reviews', 'reviews-therapist', 'reviews-hall', 'newface', 'xshops', 'news', 'salons', 'join', 'listing'];
export const JOBS_PAGE_HERO_KEYS: readonly PageHeroKey[] = ['jobs-matching'];

/**
 * ページ別ヒーロー画像のPC/SPの組（2026-08-17 / 第19便で追加）。
 *
 * ★ sp が null のときは pc を流用する（＝従来と同じ見え方）。
 *   この「流用」の判断は PageHero コンポーネント側の1か所だけで行うこと。
 *   呼び出し側でそれぞれ書くと、そのうちどこかで食い違う。
 */
export type PageHeroImages = { pc: string | null; sp: string | null };

// 未設定は null を返す（テーブル未作成時もエラーを握りつぶして null）。
//
// ★ 戻り値を「URL1本」から PageHeroImages に変えた（2026-08-17）。
//   PageHero が string も PageHeroImages も受けられるようにしてあるので、
//   12ページある呼び出し側（<PageHero url={hero} />）は【一行も変えていない】。
export async function fetchPageHero(key: PageHeroKey): Promise<PageHeroImages | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('page_heroes')
    .select('image_url, image_url_sp')
    .eq('page_key', key)
    .maybeSingle();

  // ★ image_url_sp 列がまだ無い環境（マイグレーション未適用）への保険。
  //   これが無いと、コードだけ先にデプロイされた瞬間に
  //   【12ページ全部のヒーローが消える】。適用順は「先にDB」が正だが、保険は要る。
  if (error) {
    const { data: legacy } = await supabase
      .from('page_heroes')
      .select('image_url')
      .eq('page_key', key)
      .maybeSingle();
    const pcOnly = ((legacy?.image_url as string | null) ?? null) || null;
    return pcOnly ? { pc: pcOnly, sp: null } : null;
  }

  const pc = ((data?.image_url as string | null) ?? null) || null;
  const sp = ((data?.image_url_sp as string | null) ?? null) || null;
  // どちらも無ければ従来どおり null（呼び出し側の「未設定なら描画しない」がそのまま効く）。
  return pc || sp ? { pc, sp } : null;
}
