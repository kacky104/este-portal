import type { Metadata } from 'next';
import {
  fetchRecommendWeeklyRanking,
  fetchSalonWeeklyRanking,
  fetchTherapistWeeklyRanking,
  fetchRankingHeroes,
  fetchThemeWallpapers,
  fetchPreviousRankMaps,
  fetchOverallShowcaseData,
} from '@/app/lib/ranking';
import RankingTabs from './RankingTabs';
import { toJsonLdString, buildItemListJsonLd } from '@/app/lib/jsonLd';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';

// アクセス集計は随時更新されるため短めのISR（5分）。週境界は fetch 時に月曜JSTで判定。
export const revalidate = 300;

const RANKING_TITLE = '福岡メンズエステランキング【フクエス】';
const RANKING_DESCRIPTION =
  '福岡のメンズエステ 週間アクセスランキング。人気の店舗・セラピストを毎週更新でチェックできます（毎週月曜リセット）。';

// ★ 第1383便（2026-10-10・カッキーさん）: 検索結果の見出し（title）に【2026年10月最新】のように年月を入れる。
//   ・ねらいはクリック率（「ランキング」「おすすめ」で探す人は新しさを見る）。順位そのものを上げる直しではない。
//   ・★ 年月は手で書かない（必ず古くなる・古い年が残ると逆効果）。JST の今の年月をここで作る。
//     このページは5分ごとに作り直す（revalidate = 300）ので、月が変わると自分で変わる。DB は読まない。
//   ・★ 付けるのはランキングだけ（毎週更新しているので「最新」と書いて嘘にならない）。TOP・エリアページには付けない。
//   ・構造化データの名前（下の ItemList）は年月なしの RANKING_TITLE のまま。
//   ・全角30字に収める: 福岡メンズエステランキング【2026年10月最新】｜フクエス。
function rankingPageTitle(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `福岡メンズエステランキング【${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月最新】｜フクエス`;
}

export function generateMetadata(): Metadata {
  const title = rankingPageTitle();
  return {
    title,
    description: RANKING_DESCRIPTION,
    alternates: { canonical: '/ranking' },
    // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
    // （og:image も消える）。そのため images まで全て明示する。
    openGraph: {
      title,
      description: RANKING_DESCRIPTION,
      url: '/ranking',
      siteName: 'フクエス',
      type: 'website',
      images: [{ url: '/ogp.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description: RANKING_DESCRIPTION, images: ['/ogp.png'] },
  };
}

// 本体（ヘッダー・パンくず・ヒーロー・タブ・一覧・フッター）はタブごとにテーマ・ヒーロー画像を
// 切り替えるためクライアント部品 RankingTabs 側に集約。ここではデータ取得とメタのみ担う。
export default async function RankingPage() {
  const [overallRanking, salonRanking, therapistRanking, heroes, wallpapers, prevRanks, adBanners] = await Promise.all([
    fetchRecommendWeeklyRanking(10), // ★ 第500便: おすすめ（上位表示・お知らせ・fukuX の点数）トップ10。変数名は overall のまま
    fetchSalonWeeklyRanking(10),    // 店舗はトップ10まで
    fetchTherapistWeeklyRanking(200), // ★ 第912便: TOP50 → TOP150 ／ ★ 第1070便: TOP150 → TOP200（151〜200位も101位以降と同じリスト）
    fetchRankingHeroes(),
    fetchThemeWallpapers(),
    fetchPreviousRankMaps(),        // 前週順位（順位変動マーク用）
    fetchActiveAdBanners(),         // 細い広告バナー（ルックバナー）
  ]);
  // 総合ショーケースのセラピスト/店舗情報を1回でまとめて取得（個別fetch回避）。
  const showcaseIds = Array.from(new Set([...overallRanking.map((s) => s.id), ...salonRanking.map((s) => s.id)]));
  const showcaseData = await fetchOverallShowcaseData(showcaseIds);

  return (
    <>
      {/* ItemList 構造化データ（2026-08-06 追加）。
          初期表示タブ＝総合ランキングの並びと同一内容・同一順序（RankingTabs の overallRanking）。 */}
      {overallRanking.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString(
              buildItemListJsonLd(
                overallRanking.map((s) => ({ name: s.name, path: `/salon/${s.id}` })),
                { name: RANKING_TITLE },
              ),
            ),
          }}
        />
      )}
      <RankingTabs
        overallRanking={overallRanking}
        salonRanking={salonRanking}
        therapistRanking={therapistRanking}
        heroes={heroes}
        wallpapers={wallpapers}
        prevRanks={prevRanks}
        showcaseData={showcaseData}
        adBanners={adBanners}
      />
    </>
  );
}
