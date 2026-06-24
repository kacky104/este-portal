import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchSalons } from '@/app/lib/salons';
import { ShuffledSalons } from '@/app/components/ShuffledSalons';
import { FeaturedSalonSlider } from '@/app/components/FeaturedSalonSlider';
import { getFeaturedSalons } from '@/app/lib/featured';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { areaFromSlug, AREA_ORDER, AREA_SLUGS_LIST, DISPATCH_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

// ISR：10分ごとに再生成。Next 16 では revalidate を効かせるため generateStaticParams が必須。
export const revalidate = 600;

// 6エリア分のページをビルド時に事前生成。未知のスラッグは下の notFound() で404。
export async function generateStaticParams() {
  return AREA_SLUGS_LIST.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const area = areaFromSlug(slug);
  if (!area) return {};
  const label = areaLabel(area);
  const title = `${label}のメンズエステ一覧｜フクエス`;
  const description = `${label}エリアのメンズエステを掲載。口コミ評価の高い人気サロンをご紹介します。`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const area = areaFromSlug(slug);
  if (!area) notFound();

  // cookie を読まない匿名クライアント（ISR を効かせるため。公開データ専用）。
  const supabase = createPublicClient();
  const [salons, featuredSalons] = await Promise.all([
    fetchSalons(supabase),
    getFeaturedSalons(supabase, area), // このエリア専用のピックアップ（未設定なら空＝枠ごと非表示）
  ]);
  const label = areaLabel(area);
  const pickupTitle = `${area === DISPATCH_AREA ? '出張対応' : label}のピックアップサロン`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-8"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* ─── Pickup Salons（このエリア専用・未設定なら非表示） ─── */}
        {featuredSalons.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
              {/* 短いタイトルは基準サイズ(1.25rem)のまま、長いタイトルだけ画面幅に応じて必要分だけ縮める */}
              <h2 className="font-bold whitespace-nowrap leading-tight" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: `min(1.25rem, calc((100vw - 56px) / ${pickupTitle.length}))` }}>{pickupTitle}</h2>
            </div>
            <FeaturedSalonSlider salons={featuredSalons} />
          </section>
        )}

        {/* 地域バッジ列を最上部に出し、その下に見出し＋説明文→カード（heading で順序制御） */}
        <ShuffledSalons
          salons={salons}
          areas={[...AREA_ORDER]}
          currentArea={area}
          tabsAsLinks
          includeDispatch={area === DISPATCH_AREA}
          showAge
          areaNextToDuty
          ratingAtBottom
          compactTherapists
          showSaveButton
          wideDesktop
          heading={
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">{label}のメンズエステ</h1>
              <p className="text-xs text-slate-400">
                表示順はページ読み込みのたびにシャッフルされます
              </p>
            </div>
          }
        />
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
