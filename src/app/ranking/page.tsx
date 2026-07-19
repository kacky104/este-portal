import type { Metadata } from 'next';
import {
  fetchOverallWeeklyRanking,
  fetchSalonWeeklyRanking,
  fetchTherapistWeeklyRanking,
  fetchRankingHero,
} from '@/app/lib/ranking';
import RankingTabs from './RankingTabs';

// アクセス集計は随時更新されるため短めのISR（5分）。週境界は fetch 時に月曜JSTで判定。
export const revalidate = 300;

const RANKING_TITLE = '週間ランキング｜福岡メンズエステ【フクエス】';
const RANKING_DESCRIPTION =
  '福岡のメンズエステ 週間アクセスランキング。人気の店舗・セラピストを毎週更新でチェックできます（毎週月曜リセット）。';

export const metadata: Metadata = {
  title: RANKING_TITLE,
  description: RANKING_DESCRIPTION,
  alternates: { canonical: '/ranking' },
  openGraph: {
    title: RANKING_TITLE,
    description: RANKING_DESCRIPTION,
    url: '/ranking',
    siteName: 'フクエス',
    type: 'website',
  },
};

// 本体（ヘッダー・パンくず・ヒーロー・タブ・一覧・フッター）はタブごとにテーマを切り替えるため
// クライアント部品 RankingTabs 側に集約。ここではデータ取得とメタのみ担う。
export default async function RankingPage() {
  const [overallRanking, salonRanking, therapistRanking, heroUrl] = await Promise.all([
    fetchOverallWeeklyRanking(10),  // 総合（店舗＋所属セラピスト）トップ10
    fetchSalonWeeklyRanking(10),    // 店舗はトップ10まで
    fetchTherapistWeeklyRanking(30),
    fetchRankingHero(),
  ]);

  return (
    <RankingTabs
      overallRanking={overallRanking}
      salonRanking={salonRanking}
      therapistRanking={therapistRanking}
      heroUrl={heroUrl}
    />
  );
}
