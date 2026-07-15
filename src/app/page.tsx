import Link from "next/link";
import Image from "next/image";
import { Logo } from '@/app/components/Logo';
import { ShuffledSalons } from "./components/ShuffledSalons";
import { TherapistScroller } from "./components/TherapistScroller";
import { createPublicClient } from "./lib/supabase/public";
import HeaderImageSlider from "@/components/HeaderImageSlider";
import { FeaturedSalonSlider } from "./components/FeaturedSalonSlider";
import { SavedSalonsMenu } from "./components/SavedSalonsMenu";
import { AccountMenu } from "./components/AccountMenu";
import { NotificationBell } from "./components/NotificationBell";
import { VipLetterIcon } from "./components/VipLetterIcon";
import { fetchSalons } from "./lib/salons";
import { getBusinessDateJST } from "@/lib/dutyStatus";
import { ALL_AREA, AREA_ORDER } from "./lib/areas";
import { getFeaturedSalons } from "./lib/featured";
import { fetchActiveRecommendedSalonBanners } from "./lib/recommendedSalonBanners";
import { RecommendedSalonBannerSlider } from "./components/RecommendedSalonBannerSlider";
import { fetchNewFaceTherapists } from "./lib/newFaceTherapists";
import { NewFaceScroller } from "./components/NewFaceScroller";
import { fetchActiveTherapistPickupBanners } from "./lib/therapistPickupBanners";
import { TherapistPickupBanner } from "./components/TherapistPickupBanner";
import { fetchLatestSalonNews } from "./lib/salonNews";
import { SalonNewsList } from "./components/SalonNewsList";
import { toJsonLdString, buildFaqPageJsonLd } from "./lib/jsonLd";
import { TOP_SALON_LIST_INTRO, TOP_PAGE_FAQS } from "./lib/areaSeoContent";
import { fetchPublishedMainArticles } from "./lib/mainArticles";
import { ArticleCard } from "./column/ArticleCard";
import { HomeSearchBar } from "./components/HomeSearchBar";

// TOPの WebSite 構造化データ（サイト名のリッチリザルト狙い）。
// サイト内検索ページが無いため potentialAction (SearchAction) は入れない。
const WEBSITE_JSON_LD: Record<string, unknown> = {
  '@context': 'https://schema.org/',
  '@type': 'WebSite',
  name: 'フクエス',
  alternateName: '福岡メンズエステポータル フクエス',
  url: 'https://fukues.com/',
};

// フィルタ判定／DB連動キー（変更不可）は areas.ts の AREA_ORDER に一元化。画面表示はすべて areaLabel() を通す。

// ISR：トップは10分キャッシュ（並び順のランダム化はクライアント側で行うため固定HTMLでよい）。
// オーナー編集時は /api/revalidate から revalidatePath('/') で即時更新する。
export const revalidate = 600;

export default async function Home() {
  // cookie を読まない匿名クライアント（ISR を効かせるため。公開データ専用）。
  const supabase = createPublicClient();
  const todayJST = getBusinessDateJST();

  // ── 互いに依存しない3処理を並列実行（往復の積み上がりを解消） ──
  // ピックアップは area=null の共通セット（＝トップ用）。地域ページは各エリアの設定を使う。
  const [salons, featuredSalons, todaySchedRes, recommendedBanners, newFaceTherapists, pickupBanners, salonNews, latestColumns] = await Promise.all([
    fetchSalons(supabase, { showOnTopOnly: true }), // トップは show_on_top=true のみ表示
    getFeaturedSalons(supabase, null),
    supabase
      .from('therapist_schedules')
      // therapists!inner→salons!inner の連鎖で、非表示サロン（anon RLSで不可視）所属の
      // 出勤を本日出勤総数のカウントから除外する。
      .select('start_time, end_time, therapists!inner(salons!inner(id))')
      .eq('schedule_date', todayJST)
      .eq('is_active', true)
      .eq('therapists.salons.is_hidden', false),
    // ピックアップ直下の「おすすめサロンバナー」（サロン紐づけ・ピックアップ同一オーバーレイ）。0件なら非表示。
    fetchActiveRecommendedSalonBanners(),
    // 新人セラピスト（is_new_face=true かつ30日以内）を新しい順に最大35件。サロンカード30枚目直下に挿入。0件なら非表示。
    fetchNewFaceTherapists(supabase, 35),
    // セラピストピックアップ枠（横長画像1枚・20枚目直下・クライアント抽選）。0件なら非表示。
    fetchActiveTherapistPickupBanners(),
    // サロン新着情報（ピックアップ直下・最新5件・1行×5段）。0件なら非表示。続きは /news。
    fetchLatestSalonNews(supabase, 5),
    // 本体コラム新着3件（FAQ直上のセクション）。0件なら非表示。/jobs トップの新着コラムと同方式。
    fetchPublishedMainArticles(3),
  ]);

  const todaySchedules = todaySchedRes.data;

  // 本日出勤セラピスト総数（off以外 = is_active かつ start/end が存在するすべて）。
  // クエリは上の Promise.all で並列取得済み（todaySchedRes）。
  const todayTherapistCount = (todaySchedules ?? []).filter(
    s => Boolean(s.start_time) && Boolean(s.end_time)
  ).length;

  const pickupTitle = "福岡のピックアップサロン";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* WebSite 構造化データ（サイト名） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(WEBSITE_JSON_LD) }} />
      {/* FAQPage 構造化データ（ページ下部に表示している Q&A と同一内容） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildFaqPageJsonLd(TOP_PAGE_FAQS)) }} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <SavedSalonsMenu />
              <VipLetterIcon /><NotificationBell /><AccountMenu />
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ─── Header Image Slider ─────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 pt-6 pb-2">
          <HeaderImageSlider />
        </section>

        {/* ─── Hero ────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-white pt-2.5 pb-2.5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(236,72,153,0.06),transparent)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-300/50 to-transparent" />

          <div className="relative max-w-5xl mx-auto px-4 text-center">
            {/* 見出し（ページ唯一の h1。ピンク→オレンジのグラデ帯＋白文字。角丸なし＝直角方針） */}
            <h1 className="bg-gradient-to-r from-[#FB923C] to-[#DB2777] text-white font-bold text-[18px] sm:text-[22px] leading-snug py-2.5 px-4">
              福岡メンズエステ密着型ポータルサイト
            </h1>
          </div>
        </section>

        {/* タイトルバー直下の検索バー（店名・セラピスト名のリアルタイム候補）
            ※ 候補ドロップダウンが上の overflow-hidden セクションに切られないよう、
              ヒーローの外の独立セクションに置く。 */}
        <section className="bg-white pt-3 pb-4">
          <HomeSearchBar />
          {/* クイック導線：特徴で探す／写メ日記／口コミ／新人。
              アイコンとラベルを1つのボックス内に収め、絵の下に文字を表示（縦並び）。
              各ボックスは中身に合わせて横幅可変（「特徴で探す」はテキストが長いぶん横に広がる）。 */}
          <nav aria-label="クイックメニュー" className="max-w-md mx-auto px-4 mt-3">
            {/* 横幅を5分割：特徴で探す=2枠、写メ日記/口コミ/新人=各1枠。 */}
            <div className="grid grid-cols-5 gap-2">
              {/* 特徴で探す → /therapists（2枠ぶん） */}
              <Link href="/therapists" className="col-span-2 flex flex-col items-center justify-center gap-1 rounded-2xl bg-violet-50 border border-violet-100 text-violet-600 px-2 py-2.5 hover:bg-violet-100 transition-colors">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
                </svg>
                <span className="text-[11px] font-bold whitespace-nowrap">特徴で探す</span>
              </Link>

              {/* 写メ日記 → /diary */}
              <Link href="/diary" className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 px-2 py-2.5 hover:bg-sky-100 transition-colors">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
                <span className="text-[11px] font-bold whitespace-nowrap">写メ日記</span>
              </Link>

              {/* 口コミ → /reviews */}
              <Link href="/reviews" className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 px-2 py-2.5 hover:bg-amber-100 transition-colors">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="text-[11px] font-bold whitespace-nowrap">口コミ</span>
              </Link>

              {/* 新人 → /therapist/new */}
              <Link href="/therapist/new" className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 px-2 py-2.5 hover:bg-emerald-100 transition-colors">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.5l7.1-.6z" />
                </svg>
                <span className="text-[11px] font-bold whitespace-nowrap">新人</span>
              </Link>
            </div>
          </nav>
        </section>

        {/* ─── Pickup Salons ───────────────────────────────────── */}
        {featuredSalons.length > 0 && (
          <section className="py-5 sm:py-10 bg-white border-t border-pink-50">
            <div className="max-w-5xl mx-auto px-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                {/* 短いタイトルは基準サイズ(1.25rem)のまま、長いタイトルだけ画面幅に応じて必要分だけ縮める */}
                <h2 className="font-bold whitespace-nowrap leading-tight" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: `min(1.25rem, calc((100vw - 56px) / ${pickupTitle.length}))` }}>{pickupTitle}</h2>
                <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
                  おすすめ
                </span>
              </div>
              <FeaturedSalonSlider salons={featuredSalons} />
            </div>
          </section>
        )}

        {/* ─── Salon News（ピックアップ直下・最新5件） ─────────────
            見出しは「掲載サロン一覧」と同じグラデ帯（角丸なし＝直角方針）。右端に「もっと見る→」。 */}
        {salonNews.length > 0 && (
          // 上下の隙間はバナー圧縮に合わせて従来の半分（py-5/10→py-2.5/5）。
          <section className="py-2.5 sm:py-5 bg-white border-t border-pink-50">
            <div className="max-w-5xl mx-auto px-4">
              {/* バナー縦幅は py-2→py-1 に圧縮（掲載サロン一覧と統一） */}
              <div
                className="px-4 py-1 mb-1 flex items-center justify-between"
                style={{ background: 'linear-gradient(to right, #f97316, #ec4899)' }}
              >
                <h2 className="text-xl font-bold text-white leading-none" style={{ transform: 'translateY(1px)' }}>
                  サロン新着情報
                </h2>
                <Link href="/news" className="text-xs font-bold text-white flex-shrink-0 hover:opacity-90 transition-opacity">
                  もっと見る →
                </Link>
              </div>
              <SalonNewsList items={salonNews} />
            </div>
          </section>
        )}

        {/* ─── Today's therapists ──────────────────────────────── */}
        <section className="pt-5 pb-[5px] sm:pt-10 sm:pb-5 bg-white border-t border-pink-50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                <h2 className="text-xl font-bold text-slate-900">出勤中のセラピスト</h2>
                <div className="flex items-baseline gap-0.5">
                  <span style={{ color: '#ec4899', fontWeight: 600, fontSize: '13px' }}>本日出勤総数</span>
                  <span style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700, fontSize: '18px' }}>{todayTherapistCount}</span>
                  <span style={{ color: '#ec4899', fontWeight: 600, fontSize: '13px' }}>人</span>
                </div>
              </div>
              {/* デスクトップのみ：タイトル行の右端に「一覧を見る →」 */}
              <Link
                href="/working"
                className="hidden sm:inline-flex items-center gap-1 text-sm font-bold flex-shrink-0"
                style={{
                  background: 'linear-gradient(to right, #ec4899, #f97316)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                一覧を見る →
              </Link>
            </div>
            <TherapistScroller showAge bleedMobile largeMobile />
          </div>
        </section>

        {/* ─── Salon list ──────────────────────────────────────── */}
        {/* 上余白はタイトルバナー圧縮に合わせて半分（pt-4→pt-2）。 */}
        <section id="salons" className="pt-2 pb-12">
          {/* スマホは左右余白を px-4(16px)→px-1(4px) に詰めてカードを幅広に。PC(lg)は従来の16pxのまま。 */}
          <div className="max-w-5xl mx-auto px-1 lg:px-4">
            {/* 地域バッジ列を最上部に出し、その下に見出し＋説明文→カード（heading で順序制御） */}
            <ShuffledSalons
              salons={salons}
              areas={[...AREA_ORDER]}
              shuffleSalt="home"
              currentArea={ALL_AREA}
              tabsAsLinks
              showAreaTitle
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
              insertBlocks={[
                // 10枚目直下：おすすめサロンバナー（カード幅・端に整列＝zoom:true）。
                ...(recommendedBanners.length > 0
                  ? [{ afterIndex: 10, node: <RecommendedSalonBannerSlider banners={recommendedBanners} />, zoom: true }]
                  : []),
                // 20枚目直下：セラピストピックアップ枠（横長画像1枚・クライアント抽選）。
                // zoom:false（等倍）＝新人一覧と同じ扱い。PC高さが h-64=256px ちょうどになる。
                ...(pickupBanners.length > 0
                  ? [{ afterIndex: 20, node: <TherapistPickupBanner banners={pickupBanners} />, zoom: false }]
                  : []),
                // 30枚目直下：新人セラピスト一覧（等倍＝zoom:false でカード肥大化を回避）。
                ...(newFaceTherapists.length > 0
                  ? [{ afterIndex: 30, node: <NewFaceScroller therapists={newFaceTherapists} />, zoom: false }]
                  : []),
              ]}
              heading={
                <>
                  {/* バナー縦幅 py-1・下余白 mb-1 はサロン新着情報と統一の圧縮のまま。
                      エリアページと同方式：タイトルバー自体を summary にしたアコーディオンで、
                      クリックで福岡市の紹介文（SSR済み＝閉じていてもSEO評価される）を開閉。初期は閉。
                      トップは show_on_top=true のサロンのみ表示＝福岡市内中心の運用（タイトルもそれに合わせた）。 */}
                  <details className="group mb-1">
                    <summary
                      className="px-4 py-1 flex items-center gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
                      style={{ background: 'linear-gradient(to right, #f97316, #ec4899)' }}
                    >
                      <h2 className="text-xl font-bold text-white leading-none min-w-0 flex-1" style={{ transform: 'translateY(1px)' }}>
                        福岡市掲載サロン一覧
                      </h2>
                      <svg
                        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className="flex-shrink-0 text-white/90 transition-transform duration-200 group-open:rotate-180"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </summary>
                    <div className="pt-2.5 pb-1 space-y-2">
                      {TOP_SALON_LIST_INTRO.map((para, i) => (
                        <p key={i} className="text-[13px] leading-relaxed text-slate-500">{para}</p>
                      ))}
                    </div>
                  </details>
                  <p className="text-xs text-slate-400 mb-4">
                    表示順は30分ごとに入れ替わります
                  </p>
                </>
              }
            />

            {/* fukuX バナー（スマホのみ・「口コミ総数」の直前）。PCは右カラム(ShuffledSalons)に既出のため lg:hidden で二重表示回避。 */}
            <Link
              href="/x"
              aria-label="fukuX メンズエステ専用SNS"
              className="lg:hidden block border border-pink-100 overflow-hidden shadow-sm mt-10"
            >
              <Image
                src="/ogp-fukux.png"
                alt="fukuX メンズエステ専用SNS"
                width={1200}
                height={630}
                className="w-full h-auto"
              />
            </Link>

            {/* ─── 新着コラム（最新3件・0件なら非表示）。フッターより強い内部リンクとして
                トップ本文から /column へ導線を張る（/jobs トップの新着コラムと同方式）。 ─── */}
            {latestColumns.length > 0 && (
              <section className="mt-12">
                {/* FAQと同じアコーディオン（見出しが summary・初期閉・SSR済みでSEO評価は不変）。
                    外側は named group（group/columns）＝ArticleCard 内の無印 group（hover演出）と干渉しない。 */}
                <details className="group/columns">
                  <summary className="flex items-center gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                    <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                    <h2 className="text-xl font-bold text-slate-900 min-w-0 flex-1">新着コラム</h2>
                    <svg
                      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className="flex-shrink-0 text-pink-400 transition-transform duration-200 group-open/columns:rotate-180"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="pt-3">
                    <ul className="space-y-3">
                      {latestColumns.map((a) => (
                        <li key={a.id}>
                          <ArticleCard article={a} />
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-center mt-4">
                      <Link
                        href="/column"
                        className="text-xs font-bold px-5 py-2 rounded-full border border-pink-200 text-pink-600 transition-colors hover:bg-pink-50"
                      >
                        コラムをもっと見る →
                      </Link>
                    </div>
                  </div>
                </details>
              </section>
            )}

            {/* ─── よくある質問（福岡市全体・一般向け。エリアページのFAQと重複させない） ───
                エリアページと同じ二段折り畳み：見出し（縦バー＋h2）が summary・中のQ&Aも details。
                内容はSSRでHTMLに含まれるため、閉じていてもSEO評価は変わらない。
                外側は named group（group/faq）＝内側Q&A（無印 group）の▽回転と干渉しない。 */}
            <section className="mt-12">
              <details className="group/faq">
                <summary className="flex items-center gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                  <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                  <h2 className="text-xl font-bold text-slate-900 min-w-0 flex-1">
                    福岡メンズエステのよくある質問
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
                  {TOP_PAGE_FAQS.map((f) => (
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
          </div>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-2">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {/* ヘッダーと同じフクエスのロゴ（肉球） */}
              <Image src="/logo.png" alt="フクエス" width={20} height={20} className="w-5 h-5 flex-shrink-0" />
              <span className="text-slate-500 text-sm font-medium">
                フクエス ～福岡メンズエステポータル～
              </span>
            </div>
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
              {/* セラピスト求人：実ページ /jobs（フクエスワーク）への内部リンク（他は暫定 #）。 */}
              <Link
                href="/jobs"
                className="hover:text-pink-600 transition-colors whitespace-nowrap"
              >
                セラピスト求人（フクエスワーク）
              </Link>
              {[
                { label: "利用規約", href: "/terms" },
                // プライバシーポリシーはスマホのみ半角カナ表示（PCは全角）。href は変えない。
                { label: "プライバシーポリシー", mobile: "ﾌﾟﾗｲﾊﾞｼｰﾎﾟﾘｼｰ", href: "/privacy" },
                { label: "掲載について", href: "/listing" },
                { label: "お問い合わせ", href: "/contact" },
                // リンクバナー配布ページ（本体版・200×40）。
                { label: "リンクバナー", href: "/banner" },
              ].map(({ label, mobile, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="hover:text-pink-600 transition-colors whitespace-nowrap"
                >
                  {mobile ? (
                    <>
                      <span className="sm:hidden">{mobile}</span>
                      <span className="hidden sm:inline">{label}</span>
                    </>
                  ) : (
                    label
                  )}
                </Link>
              ))}
            </nav>
          </div>
          <p className="text-center text-xs text-slate-300 mt-6">
            © 2026 フクエス. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

