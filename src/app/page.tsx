import Link from "next/link";
import { ShuffledSalons } from "./components/ShuffledSalons";
import { TherapistScroller } from "./components/TherapistScroller";
import { createPublicClient } from "./lib/supabase/public";
import HeaderImageSlider from "@/components/HeaderImageSlider";
import { FeaturedSalonSlider } from "./components/FeaturedSalonSlider";
import { SavedSalonsMenu } from "./components/SavedSalonsMenu";
import { AccountMenu } from "./components/AccountMenu";
import { NotificationBell } from "./components/NotificationBell";
import { fetchSalons } from "./lib/salons";
import { getBusinessDateJST } from "@/lib/dutyStatus";
import { ALL_AREA } from "./lib/areas";
import { getFeaturedSalons } from "./lib/featured";

// フィルタ判定／DB連動キー（変更不可）。画面表示はすべて areaLabel() を通す。
const AREAS = [
  "福岡全域",
  "博多・住吉",
  "中洲・天神・薬院",
  "北九州・小倉",
  "久留米",
  "福岡県その他",
  "出張",
] as const;

// ISR：トップは10分キャッシュ（並び順のランダム化はクライアント側で行うため固定HTMLでよい）。
// オーナー編集時は /api/revalidate から revalidatePath('/') で即時更新する。
export const revalidate = 600;

export default async function Home() {
  // cookie を読まない匿名クライアント（ISR を効かせるため。公開データ専用）。
  const supabase = createPublicClient();
  const todayJST = getBusinessDateJST();

  // ── 互いに依存しない3処理を並列実行（往復の積み上がりを解消） ──
  // ピックアップは area=null の共通セット（＝トップ用）。地域ページは各エリアの設定を使う。
  const [salons, featuredSalons, todaySchedRes] = await Promise.all([
    fetchSalons(supabase, { showOnTopOnly: true }), // トップは show_on_top=true のみ表示
    getFeaturedSalons(supabase, null),
    supabase
      .from('therapist_schedules')
      .select('start_time, end_time')
      .eq('schedule_date', todayJST)
      .eq('is_active', true),
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

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
          <div className="flex items-center gap-5">
            <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-500">
              <Link href="#salons" className="hover:text-pink-600 transition-colors">
                サロン一覧
              </Link>
              <Link href="#salons" className="hover:text-pink-600 transition-colors">
                エリアから探す
              </Link>
              <Link href="#" className="hover:text-pink-600 transition-colors">
                新着情報
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <SavedSalonsMenu />
              <NotificationBell /><AccountMenu />
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
        <section className="relative overflow-hidden bg-white pt-5 pb-5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(236,72,153,0.06),transparent)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-300/50 to-transparent" />

          <div className="relative max-w-5xl mx-auto px-4 text-center">
            {/* eyebrow */}
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 tracking-[0.2em] mb-4">
              <span className="w-6 h-px bg-slate-300" />
              福岡に特化したメンズエステポータルサイト
              <span className="w-6 h-px bg-slate-300" />
            </p>

            {/* リード文（緑系グラデ：ヘッダーのサブと同系） */}
            <p className="text-[18px] sm:text-[22px] leading-snug">
              <span
                className="inline-block font-medium"
                style={{
                  background: 'linear-gradient(95deg,#10B981,#84CC16)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                福岡でメンズエステを探すなら
              </span>
            </p>

            {/* ブランド名（h1は1つ。フクエスはヘッダーと同じ橙→マゼンタのグラデ） */}
            <h1
              className="inline-block text-[44px] sm:text-[56px] font-extrabold leading-tight tracking-tight mb-1"
              style={{
                background: 'linear-gradient(95deg,#FB923C,#DB2777)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            >
              フクエス
            </h1>

            {/* アピール（タグライン）：あなた=橙 / お店=マゼンタ、他は通常色 */}
            <p className="text-[18px] sm:text-[22px] font-medium text-slate-900 leading-snug mb-3">
              <span style={{ color: '#FB923C' }}>あなた</span>と<span style={{ color: '#DB2777' }}>お店</span>をマッチング
            </p>

            {/* 説明文（句点なし。モバイルは「福岡全域から」で改行、デスクトップは読点で1行） */}
            <p className="text-slate-400 text-sm max-w-xl mx-auto mb-3 leading-relaxed">
              博多・天神・北九州・久留米など福岡全域から<span className="hidden sm:inline">、</span><br className="sm:hidden" />口コミ評価の高い人気サロンをご紹介
            </p>
          </div>
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

        {/* ─── Today's therapists ──────────────────────────────── */}
        <section className="pt-5 pb-2.5 sm:py-10 bg-white border-t border-pink-50">
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
            <TherapistScroller showAge />
          </div>
        </section>

        {/* ─── Salon list ──────────────────────────────────────── */}
        <section id="salons" className="pt-8 pb-12">
          <div className="max-w-5xl mx-auto px-4">
            {/* 地域バッジ列を最上部に出し、その下に見出し＋説明文→カード（heading で順序制御） */}
            <ShuffledSalons
              salons={salons}
              areas={[...AREAS]}
              currentArea={ALL_AREA}
              tabsAsLinks
              showAge
              areaNextToDuty
              ratingAtBottom
              compactTherapists
              showSaveButton
              wideDesktop
              heading={
                <>
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
                    <h2 className="text-xl font-bold text-slate-900">掲載サロン一覧</h2>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    表示順はページ読み込みのたびにシャッフルされます
                  </p>
                </>
              }
            />

            <div className="text-center mt-10">
              <Link
                href="/salons"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-full border border-pink-300 text-pink-600 text-sm font-medium hover:bg-pink-50 hover:border-pink-400 transition-all"
              >
                サロンをすべて見る
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="flex justify-center mt-6">
              <div className="inline-flex flex-wrap justify-center gap-px rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                {[
                  ["掲載サロン", "68件"],
                  ["口コミ総数", "2,400件以上"],
                  ["対応エリア", "福岡全域"],
                ].map(([label, val], i) => (
                  <div
                    key={label}
                    className={`flex flex-col items-center px-6 py-3 ${i > 0 ? "border-l border-slate-200" : ""}`}
                  >
                    <span className="text-[11px] text-slate-400 mb-0.5">{label}</span>
                    <span className="text-sm font-bold text-slate-700">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-2">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-md bg-pink-50 border border-pink-200 flex items-center justify-center">
                <span className="text-pink-500 text-[10px] font-bold leading-none">◆</span>
              </div>
              <span className="text-slate-500 text-sm font-medium">
                フクエス ～福岡メンズエステポータル～
              </span>
            </div>
            <nav className="flex gap-5 text-xs text-slate-400">
              {["利用規約", "プライバシーポリシー", "掲載について", "お問い合わせ"].map(
                (label) => (
                  <Link
                    key={label}
                    href="#"
                    className="hover:text-pink-600 transition-colors"
                  >
                    {label}
                  </Link>
                )
              )}
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
