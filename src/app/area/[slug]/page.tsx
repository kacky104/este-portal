import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchSalons } from '@/app/lib/salons';
import { ShuffledSalons } from '@/app/components/ShuffledSalons';
import { TherapistScroller } from '@/app/components/TherapistScroller';
import { FeaturedSalonSlider } from '@/app/components/FeaturedSalonSlider';
import { getFeaturedSalons } from '@/app/lib/featured';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { areaFromSlug, AREA_ORDER, AREA_SLUGS_LIST, DISPATCH_AREA, salonInArea } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { toJsonLdString, buildBreadcrumbJsonLd, buildFaqPageJsonLd } from '@/app/lib/jsonLd';
import { AREA_SEO_CONTENT } from '@/app/lib/areaSeoContent';
import { fetchActiveTherapistPickupBanners } from '@/app/lib/therapistPickupBanners';
import { TherapistPickupBanner } from '@/app/components/TherapistPickupBanner';
import { AutoFitHeadingText } from '@/app/components/AutoFitHeadingText';

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
  // meta description はエリア固有文（areaSeoContent）を優先。未定義エリアは従来の汎用文にフォールバック。
  const description =
    AREA_SEO_CONTENT[area]?.metaDescription ??
    `${label}エリアのメンズエステを掲載。口コミ評価の高い人気店舗をご紹介します。`;
  return {
    title,
    description,
    alternates: { canonical: `/area/${slug}` },
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
  const [salons, featuredSalons, pickupBanners] = await Promise.all([
    fetchSalons(supabase),
    getFeaturedSalons(supabase, area), // このエリア専用のピックアップ（未設定なら空＝枠ごと非表示）
    fetchActiveTherapistPickupBanners(), // セラピストピックアップ枠（TOPと共通・20枚目直下・0件なら非表示）
  ]);
  const label = areaLabel(area);
  const pickupTitle = `${area === DISPATCH_AREA ? '出張対応' : label}のピックアップ店舗`;

  // このエリアに属するサロンの id（出勤中セラピストスライダー＆「一覧を見る」の絞り込みに使う）。
  // 判定は共有の salonInArea（ShuffledSalons の matchesArea と同一）。サロン一覧と同じ所属になる。
  const areaSalonIds = salons.filter((s) => salonInArea(s, area)).map((s) => s.id);

  // 構造化データ（BreadcrumbList「トップ › {label}のメンズエステ一覧」）。
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'トップ', path: '/' },
    { name: `${label}のメンズエステ一覧`, path: `/area/${slug}` },
  ]);

  // エリア固有のSEOコンテンツ（紹介文＋FAQ）。未定義エリアは何も出さない（従来表示のまま）。
  const seo = AREA_SEO_CONTENT[area] ?? null;
  const faqJsonLd = seo && seo.faqs.length > 0 ? buildFaqPageJsonLd(seo.faqs) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* BreadcrumbList 構造化データ（トップ › エリア一覧） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(breadcrumbJsonLd) }} />
      {/* FAQPage 構造化データ（ページ下部に表示している Q&A と同一内容） */}
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(faqJsonLd) }} />
      )}

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
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

        {/* ─── 本日出勤中のセラピスト（このエリアのサロン所属者のみ）。トップと同じ TherapistScroller を再利用 ───
            時刻依存（出勤中・今すぐ）の判定は TherapistScroller がクライアントのマウント時に行う＝ISR焼き付き回避。 */}
        <section className="mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
            <h2 className="text-xl font-bold text-slate-900"><span className="text-pink-600">{area === DISPATCH_AREA ? '出張対応' : label}</span>で現在出勤中</h2>
          </div>
          <TherapistScroller showAge filterSalonIds={areaSalonIds} workingHref={`/working?area=${slug}`} bleedMobile largeMobile />
        </section>

        {/* 地域バッジ列を最上部に出し、その下に見出し＋説明文→カード（heading で順序制御） */}
        {/* サロン一覧のみ左右余白を main(px-4=16px)→4px に詰める（-mx-3=12px相殺）。TOPのpx-1と同幅感。lgは従来。 */}
        <div className="-mx-3 lg:mx-0">
        <ShuffledSalons
          salons={salons}
          areas={[...AREA_ORDER]}
          shuffleSalt={`area:${slug}`}
          currentArea={area}
          tabsAsLinks
          showAreaTitle
          includeDispatch={area === DISPATCH_AREA}
          showAge
          areaNextToDuty
          ratingAtBottom
          compactTherapists
          showSaveButton
          nameBanner
          wideDesktop
          mobileSingleColumn
          bleedTherapists
          largeThumbs
          insertBlocks={
            pickupBanners.length > 0
              ? [{ afterIndex: 20, node: <TherapistPickupBanner banners={pickupBanners} />, zoom: false }]
              : undefined
          }
          heading={
            <div className="mb-4">
              {/* エリア固有の紹介文（SEO・h1直下）。タイトルバー自体を summary にしたアコーディオンで、
                  クリックで開閉（初期は閉）。<details> は本文が最初からHTMLに含まれる＝SSRされるため、
                  折り畳んでいてもGoogleには通常コンテンツとして評価される（後からJSで読む方式はNG）。
                  ISRで焼き付くため件数など可変の数値は紹介文に書かない。 */}
              {seo ? (
                <details className="group mb-1">
                  <summary
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
                    style={{ background: 'linear-gradient(to right, #f97316, #ec4899)' }}
                  >
                    <h1 className="min-w-0 flex-1 overflow-hidden">
                      <AutoFitHeadingText text={`${area === DISPATCH_AREA ? '出張対応' : label}のメンズエステ一覧`} />
                    </h1>
                    <svg
                      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className="flex-shrink-0 text-white/90 transition-transform duration-200 group-open:rotate-180"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="pt-2.5 pb-1 space-y-2">
                    {seo.intro.map((para, i) => (
                      <p key={i} className="text-[13px] leading-relaxed text-slate-500">{para}</p>
                    ))}
                  </div>
                </details>
              ) : (
                <div
                  className="px-4 py-2 mb-1"
                  style={{ background: 'linear-gradient(to right, #f97316, #ec4899)' }}
                >
                  <h1 className="min-w-0 overflow-hidden">
                    <AutoFitHeadingText text={`${area === DISPATCH_AREA ? '出張対応' : label}のメンズエステ一覧`} />
                  </h1>
                </div>
              )}
              <p className="text-xs text-slate-400">
                表示順は30分ごとに入れ替わります
              </p>
            </div>
          }
        />
        </div>

        {/* ─── よくある質問（エリア固有・FAQPage 構造化データと同一内容） ───
            見出しは h1 と同じグラデ帯のタイトルバー（summary）で、Q&A一覧ごと折り畳み（初期閉）。
            内容はSSRでHTMLに含まれるため、閉じていてもSEO評価は変わらない（紹介文と同方式）。
            外側は named group（group/faq）にして、内側の各Q&A（無印 group）の▽回転と干渉しないようにする。 */}
        {seo && seo.faqs.length > 0 && (
          <section className="mt-12">
            <details className="group/faq">
              {/* 見出しは従来のセクション見出しレイアウト（縦グラデバー＋text-slate-900）のまま summary 化。 */}
              <summary className="flex items-center gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                <h2 className="text-xl font-bold text-slate-900 min-w-0 flex-1">
                  {area === DISPATCH_AREA ? '出張メンズエステ' : label}のよくある質問
                </h2>
                <svg
                  width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="flex-shrink-0 text-pink-400 transition-transform duration-200 group-open/faq:rotate-180"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <div className="space-y-2.5 pt-3">
              {seo.faqs.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <summary className="flex items-start justify-between gap-3 p-4 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-slate-50/60 transition-colors">
                    <span className="flex items-start gap-2 min-w-0">
                      <span className="flex-shrink-0 text-pink-500 font-black text-sm leading-6">Q.</span>
                      <span className="text-sm font-bold text-slate-800 leading-6 break-words">{f.q}</span>
                    </span>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className="flex-shrink-0 mt-1.5 text-pink-400 transition-transform duration-200 group-open:rotate-180"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="px-4 pb-4 flex items-start gap-2 border-t border-slate-100 pt-3">
                    <span className="flex-shrink-0 text-slate-400 font-black text-sm leading-6">A.</span>
                    <p className="text-sm text-slate-600 leading-relaxed break-words">{f.a}</p>
                  </div>
                </details>
              ))}
              </div>
            </details>
          </section>
        )}
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
