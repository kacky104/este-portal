import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import {
  fetchSalonWeeklyRanking,
  fetchTherapistWeeklyRanking,
  fetchRankingHero,
  currentWeekLabelJST,
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
  const [salonRanking, therapistRanking, heroUrl] = await Promise.all([
    fetchSalonWeeklyRanking(10),   // 店舗はトップ10まで
    fetchTherapistWeeklyRanking(30),
    fetchRankingHero(),
  ]);
  const weekLabel = currentWeekLabelJST();

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

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Back link */}
        <Breadcrumb current="週間ランキング" />

        {/* ヒーロー（ヘッダー）画像：/admin で設定。未設定なら非表示。
            任意サイズをそのまま横幅いっぱいで表示（next/image ではなく素の img）。 */}
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroUrl}
            alt="週間ランキング"
            className="w-full h-auto rounded-2xl mb-6 shadow-sm"
          />
        )}

        {/* Heading（中央寄せ・金→ピンクのグラデ。王冠アイコン付き） */}
        <div className="mb-2 text-center">
          <h1
            className="text-2xl font-bold inline-flex items-center gap-2"
            style={{
              background: 'linear-gradient(to right, #F59E0B, #EC4899)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            <span aria-hidden style={{ WebkitTextFillColor: 'initial' }}>👑</span>
            週間ランキング
          </h1>
        </div>
        <p className="text-xs text-slate-400 text-center mb-8">{weekLabel} の集計</p>

        <RankingTabs salonRanking={salonRanking} therapistRanking={therapistRanking} />
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
