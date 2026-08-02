import type { Metadata } from 'next';
import { fetchPageHero } from '@/app/lib/pageHero';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { getAllApprovedReviews, getTherapistReviewRanking } from '@/app/lib/reviews';
import ReviewsTabs from './ReviewsTabs';

export const metadata: Metadata = {
  title: '福岡メンズエステの口コミ一覧｜フクエス',
  description: '福岡のメンズエステに寄せられた口コミを新着順・口コミ数のセラピストランキング・殿堂入りでまとめてチェック。接客・施術・受付の評価とレビューを店舗横断で確認できます。',
  alternates: { canonical: '/reviews' },
  openGraph: { title: '福岡メンズエステの口コミ一覧｜フクエス', description: '福岡のメンズエステに寄せられた口コミを新着順・口コミ数のセラピストランキング・殿堂入りでまとめてチェック。接客・施術・受付の評価とレビューを店舗横断で確認できます。', url: '/reviews', siteName: 'フクエス', type: 'website' },
};

// ISR：10分ごとに再生成（口コミ承認時は /api/revalidate で個別無効化される想定・一覧はゆるめでOK）。
export const revalidate = 600;

// 本体（ヘッダー・パンくず・ヒーロー・見出し・タブ・一覧・フッター）はタブごとにテーマ
// （新着=イエロー / セラピスト=シルバー / 殿堂入り=ゴールド）の壁紙・配色を切り替えるため
// クライアント部品 ReviewsTabs 側に集約。ここではデータ取得とメタのみ担う（/ranking と同構成）。
export default async function AllReviewsPage() {
  // ヒーロー画像はタブ別に3キー（新着=reviews / セラピスト=reviews-therapist / 殿堂入り=reviews-hall）。
  const [reviews, therapistRanking, heroNew, heroTherapist, heroHall, wallpapers, adBanners] = await Promise.all([
    getAllApprovedReviews(),
    getTherapistReviewRanking(),
    fetchPageHero('reviews'),
    fetchPageHero('reviews-therapist'),
    fetchPageHero('reviews-hall'),
    fetchThemeWallpapers(),
    fetchActiveAdBanners(),
  ]);

  return (
    <ReviewsTabs
      reviews={reviews}
      ranking={therapistRanking.ranking}
      hallOfFame={therapistRanking.hallOfFame}
      heroes={{ new: heroNew, therapist: heroTherapist, hall: heroHall }}
      wallpapers={wallpapers}
      adBanners={adBanners}
    />
  );
}
