import type { Metadata } from 'next';
import {
  fetchOverallWeeklyRanking,
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

export const metadata: Metadata = {
  title: RANKING_TITLE,
  description: RANKING_DESCRIPTION,
  alternates: { canonical: '/ranking' },
  // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
  // （og:image も消える）。そのため images まで全て明示する。
  openGraph: {
    title: RANKING_TITLE,
    description: RANKING_DESCRIPTION,
    url: '/ranking',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title: RANKING_TITLE, description: RANKING_DESCRIPTION, images: ['/ogp.png'] },
};

// 本体（ヘッダー・パンくず・ヒーロー・タブ・一覧・フッター）はタブごとにテーマ・ヒーロー画像を
// 切り替えるためクライアント部品 RankingTabs 側に集約。ここではデータ取得とメタのみ担う。
export default async function RankingPage() {
  const [overallRanking, salonRanking, therapistRanking, heroes, wallpapers, prevRanks, adBanners] = await Promise.all([
    fetchOverallWeeklyRanking(10),  // 総合（店舗＋所属セラピスト）トップ10
    fetchSalonWeeklyRanking(10),    // 店舗はトップ10まで
    fetchTherapistWeeklyRanking(50),
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
