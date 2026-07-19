import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
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

export default async function RankingPage() {
  const [overallRanking, salonRanking, therapistRanking, heroUrl] = await Promise.all([
    fetchOverallWeeklyRanking(10),  // 総合（店舗＋所属セラピスト）トップ10
    fetchSalonWeeklyRanking(10),    // 店舗はトップ10まで
    fetchTherapistWeeklyRanking(30),
    fetchRankingHero(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="pb-10">
        {/* パンくず（コンテナ内・左右余白あり） */}
        <div className="max-w-3xl mx-auto px-4 pt-10">
          <Breadcrumb current="週間ランキング" />
        </div>

        {/* ヒーロー（ヘッダー）画像：パンくずの下・見出しの上に、幅いっぱい（ビューポート端まで・角丸/左右余白なし）。
            /admin で設定・未設定なら非表示。next/image ではなく素の img で元の縦横比のまま全幅表示。 */}
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt="週間ランキング" className="block w-full h-auto mb-6" />
        )}

        {/* 見出し以降（コンテナ内・左右余白あり） */}
        <div className="max-w-3xl mx-auto px-4">
        <RankingTabs overallRanking={overallRanking} salonRanking={salonRanking} therapistRanking={therapistRanking} />
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
