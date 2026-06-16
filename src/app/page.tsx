import Link from "next/link";
import { ShuffledSalons } from "./components/ShuffledSalons";
import { TherapistScroller } from "./components/TherapistScroller";
import { createClient } from "./lib/supabase/server";
import { DiarySection } from "@/components/DiarySection";
import HeaderImageSlider from "@/components/HeaderImageSlider";
import { FeaturedSalonSlider, type FeaturedSalon } from "./components/FeaturedSalonSlider";

const AREAS = [
  "福岡全域",
  "博多・住吉",
  "中洲・天神・薬院",
  "北九州・小倉",
  "久留米",
  "福岡県その他",
  "出張",
] as const;

export default async function Home() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('salons')
    .select('id, name, rating, review_count, tags, price, area, hours, description');

  const salons = (rows ?? []).map(row => ({
    id:          row.id as number,
    name:        (row.name as string) ?? '',
    rating:      (row.rating as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    tags:        (row.tags as string[]) ?? [],
    price:       (row.price as string) ?? '',
    area:        (row.area as string) ?? '',
    hours:       (row.hours as string) ?? '',
    description: (row.description as string) ?? '',
  }));

  // ── ピックアップサロン取得 ──────────────────────────────
  const todayJST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  let featuredSalons: FeaturedSalon[] = [];

  const { data: featuredRows, error: featuredErr } = await supabase
    .from('featured_salons')
    .select('salon_id, display_order, image_url')
    .order('display_order', { ascending: true })
    .limit(5);

  if (!featuredErr && featuredRows && featuredRows.length > 0) {
    const featuredIds = featuredRows.map(r => r.salon_id as number);
    const imageUrlMap = Object.fromEntries(
      featuredRows.map(r => [r.salon_id as number, (r.image_url as string | null) ?? null])
    );

    const [{ data: featuredSalonData }, { data: therapistData }] = await Promise.all([
      supabase.from('salons').select('id, name, area, price, rating').in('id', featuredIds),
      supabase.from('therapists').select('id, salon_id, profile_image_url')
        .in('salon_id', featuredIds)
        .not('profile_image_url', 'is', null),
    ]);

    // 本日出勤セット
    const therapistIds = (therapistData ?? []).map(t => t.id);
    let onDutySet = new Set<unknown>();
    if (therapistIds.length > 0) {
      const { data: schedData } = await supabase
        .from('therapist_schedules')
        .select('therapist_id')
        .in('therapist_id', therapistIds)
        .eq('schedule_date', todayJST)
        .eq('is_active', true);
      onDutySet = new Set((schedData ?? []).map(r => r.therapist_id));
    }

    const salonInfoMap = Object.fromEntries(
      (featuredSalonData ?? []).map(s => [s.id as number, s])
    );

    const built = featuredIds
      .filter(id => salonInfoMap[id])
      .map(salonId => {
        const s = salonInfoMap[salonId];
        const therapists = (therapistData ?? []).filter(t => (t.salon_id as number) === salonId);
        const sorted = [...therapists].sort((a, b) =>
          (onDutySet.has(a.id) ? 0 : 1) - (onDutySet.has(b.id) ? 0 : 1)
        );
        return {
          salonId,
          salonName:       (s.name   as string) ?? '',
          area:            (s.area   as string) ?? '',
          price:           (s.price  as string) ?? '',
          rating:          (s.rating as number) ?? 0,
          imageUrl:        imageUrlMap[salonId] ?? undefined,
          therapistImages: sorted
            .map(t => t.profile_image_url as string | null)
            .filter((u): u is string => Boolean(u))
            .slice(0, 4),
        };
      });

    // ページ読み込みのたびにランダムシャッフル
    for (let i = built.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [built[i], built[j]] = [built[j], built[i]];
    }
    featuredSalons = built;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              福岡メンズエステポータル
            </span>
          </Link>
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
        </div>
      </header>

      <main>
        {/* ─── Header Image Slider ─────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 pt-6 pb-2">
          <HeaderImageSlider />
        </section>

        {/* ─── Hero ────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-white pt-16 pb-14">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(236,72,153,0.06),transparent)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-300/50 to-transparent" />

          <div className="relative max-w-5xl mx-auto px-4 text-center">
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-pink-400 tracking-[0.2em] uppercase mb-5">
              <span className="w-6 h-px bg-pink-300" />
              Fukuoka Mens Esthetics Portal
              <span className="w-6 h-px bg-pink-300" />
            </p>

            <h1 className="mb-5 leading-snug">
              <span className="block text-xl font-black text-slate-900 tracking-tight flex items-center justify-center flex-wrap gap-1.5 text-center w-full">
                <span className="text-pink-500">福岡に特化した</span>メンズエステポータルサイト
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-pink-500 via-rose-400 to-orange-400 bg-clip-text text-transparent">
                あなたとお店をマッチング
              </span>
            </h1>

            <p className="text-slate-500 text-sm max-w-xl mx-auto mb-10 leading-relaxed">
              博多・天神・北九州・久留米など、福岡全域のエリアから口コミ評価の高い人気サロンをご紹介。あなたにぴったりのサロンを見つけてください。
            </p>
          </div>
        </section>

        {/* ─── Pickup Salons ───────────────────────────────────── */}
        {featuredSalons.length > 0 && (
          <section className="py-10 bg-white border-t border-pink-50">
            <div className="max-w-5xl mx-auto px-4">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                <h2 className="text-xl font-bold text-slate-900">ピックアップサロン</h2>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
                  おすすめ
                </span>
              </div>
              <p className="text-xs text-slate-400 pl-7 mb-6">編集部が厳選した注目のサロンをご紹介します</p>
              <FeaturedSalonSlider salons={featuredSalons} />
            </div>
          </section>
        )}

        {/* ─── Today's therapists ──────────────────────────────── */}
        <section className="py-10 bg-white border-t border-pink-50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                <h2 className="text-xl font-bold text-slate-900">本日の出勤セラピスト</h2>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
                  本日出勤
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 pl-7 mb-6">
              スクロールして全員を確認できます ｜ カードをタップするとサロン詳細ページへ移動します
            </p>
            <TherapistScroller />
          </div>
        </section>

        {/* ─── Latest diaries ──────────────────────────────────── */}
        <section className="py-10 bg-white border-t border-pink-50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
                <h2 className="text-xl font-bold text-slate-900">最新の写メ日記</h2>
              </div>
              <Link href="/diary" className="text-xs text-pink-500 font-semibold hover:underline">
                もっと見る →
              </Link>
            </div>
            <p className="text-xs text-slate-400 pl-7 mb-6">セラピストたちの最新投稿をチェック</p>
            <DiarySection />
          </div>
        </section>

        {/* ─── Salon list ──────────────────────────────────────── */}
        <section id="salons" className="py-12">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
              <h2 className="text-xl font-bold text-slate-900">掲載サロン一覧</h2>
            </div>
            <p className="text-xs text-slate-400 pl-7 mb-8">
              2026年6月 更新 ｜ 表示順はページ読み込みのたびにシャッフルされます
            </p>

            <ShuffledSalons salons={salons} areas={[...AREAS]} />

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
                福岡メンズエステポータル
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
            © 2026 福岡メンズエステポータル. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
