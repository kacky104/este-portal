import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { SalonTherapists, SalonAllTherapists } from "@/components/SalonTherapists";
import { SalonDiarySection } from "@/components/DiarySection";

export default async function SalonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('salons')
    .select('id, name, rating, review_count, tags, price, area, hours, description, appeal, phone, address, access, closed_days, note, courses')
    .eq('id', Number(id))
    .single();

  if (error || !row) notFound();

  const salon = {
    id:          row.id as number,
    name:        (row.name as string) ?? '',
    rating:      (row.rating as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    tags:        (row.tags as string[]) ?? [],
    price:       (row.price as string) ?? '',
    area:        (row.area as string) ?? '',
    hours:       (row.hours as string) ?? '',
    description: (row.description as string) ?? '',
    appeal:      (row.appeal as string) ?? '',
    courses:     ((row.courses as { name: string; duration: string; price: string }[] | null) ?? []),
    phone:       (row.phone as string) ?? '',
    address:     (row.address as string) ?? '',
    access:      (row.access as string) ?? '',
    closedDays:  (row.closed_days as string) ?? '',
    note:        (row.note as string | undefined) ?? undefined,
  };

  const filledStars = Math.floor(salon.rating);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              福岡メンズエステポータル
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── Back button ─────────────────────────────── */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-6"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          サロン一覧へ戻る
        </Link>

        {/* ─── Hero ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          {/* Thumbnail banner */}
          <div className="h-48 bg-gradient-to-br from-pink-100 via-rose-50 to-pink-50 relative flex items-center justify-center">
            <span className="text-[120px] text-pink-300/20 select-none" aria-hidden="true">♨</span>
            <span className="absolute top-4 left-4 text-xs font-semibold px-3 py-1 rounded-full bg-white text-pink-600 border border-pink-200 shadow-sm">
              {salon.area}
            </span>
          </div>

          <div className="p-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-3">{salon.name}</h1>

            {/* Rating row */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={i < filledStars ? "text-pink-500" : "text-slate-300"} style={{ fontSize: "18px" }}>★</span>
                ))}
              </div>
              <span className="text-pink-600 font-bold text-lg">{salon.rating}</span>
              <span className="text-slate-400 text-sm">({salon.reviewCount}件の口コミ)</span>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {salon.tags.map((tag) => (
                <span key={tag} className="text-xs px-3 py-1 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                  {tag}
                </span>
              ))}
            </div>

            {/* Hours */}
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              <span>{salon.hours}</span>
              {salon.closedDays && (
                <>
                  <span className="text-slate-300">｜</span>
                  <span>定休：{salon.closedDays}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ─── Two-column layout ───────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left: main content */}
          <div className="lg:col-span-2 space-y-6">

            {/* Today's therapists */}
            <div className="mt-8 bg-white rounded-3xl p-5 border border-pink-100/60 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">💖</span>
                <h2 className="text-base font-bold text-slate-900">本日出勤のセラピスト</h2>
              </div>
              <SalonTherapists salonId={Number(id)} />
            </div>

            {/* About */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionHeading>サロンについて</SectionHeading>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">{salon.description}</p>
              <p className="text-slate-600 text-sm leading-relaxed">{salon.appeal}</p>
            </section>

            {/* Courses — shown only when DB data is available */}
            {salon.courses.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <SectionHeading>コースメニュー・料金表</SectionHeading>
                <div className="space-y-5">
                  {Array.from(
                    salon.courses.reduce((map, c) => {
                      if (!map.has(c.name)) map.set(c.name, []);
                      map.get(c.name)!.push(c);
                      return map;
                    }, new Map<string, { name: string; duration: string; price: string }[]>())
                  ).map(([name, items]) => (
                    <div key={name}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-pink-400 flex-shrink-0" />
                        <h3 className="text-sm font-bold text-slate-800">{name}</h3>
                      </div>
                      <div className="pl-4 space-y-1.5">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm border-b border-slate-50 pb-1 last:border-0 last:pb-0">
                            <span className="text-slate-500">{item.duration}</span>
                            <span className="font-bold text-pink-600">{item.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-5">※ 表示料金はすべて税込み価格です。</p>
              </section>
            )}

            {/* All therapists */}
            <div className="mt-8 bg-white rounded-3xl p-5 border border-pink-100/60 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">👩‍🦰</span>
                <h2 className="text-base font-bold text-slate-900">在籍セラピスト一覧</h2>
              </div>
              <SalonAllTherapists salonId={Number(id)} />
            </div>

            {/* Diary section */}
            <div className="mt-8 bg-white rounded-3xl p-5 border border-pink-100/60 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📷</span>
                <h2 className="text-base font-bold text-slate-900">所属セラピストの写メ日記</h2>
              </div>
              <SalonDiarySection salonId={id} />
            </div>
          </div>

          {/* Right: shop info */}
          <div className="space-y-6">

            {/* Price summary */}
            <div className="bg-pink-600 rounded-2xl p-5 text-white">
              <p className="text-xs font-semibold opacity-80 mb-1">料金目安</p>
              <p className="text-2xl font-bold">{salon.price}</p>
              <p className="text-xs opacity-70 mt-1">※ コースにより異なります</p>
            </div>

            {/* Shop info */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <SectionHeading>店舗基本情報</SectionHeading>
              <dl className="space-y-3.5 text-sm">
                <InfoRow icon={<PhoneIcon />}    label="電話番号" value={salon.phone} />
                <InfoRow icon={<ClockIcon />}    label="営業時間" value={salon.hours} />
                <InfoRow icon={<CalendarIcon />} label="定休日"   value={salon.closedDays} />
                <InfoRow icon={<MapIcon />}      label="住所"     value={salon.address} />
                <InfoRow icon={<TrainIcon />}    label="アクセス" value={salon.access} />
              </dl>
            </section>

            {/* Note */}
            {salon.note && (
              <div className="rounded-xl border border-pink-100 bg-pink-50 p-4 text-xs text-pink-800 leading-relaxed">
                <p className="font-semibold mb-1">ご利用にあたって</p>
                <p>{salon.note}</p>
              </div>
            )}

            {/* Back CTA */}
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-pink-300 text-pink-600 text-sm font-medium hover:bg-pink-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              一覧へ戻る
            </Link>
          </div>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 福岡メンズエステポータル. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

/* ── Helper components ─────────────────────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
      <h3 className="font-bold text-slate-900">{children}</h3>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <dt className="flex items-start gap-1.5 text-slate-400 flex-shrink-0 w-20 text-[11px] pt-0.5">
        <span className="mt-px">{icon}</span>
        {label}
      </dt>
      <dd className="text-slate-700 text-[13px] leading-relaxed">{value}</dd>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TrainIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="16" rx="2" /><path d="M9 18v3M15 18v3M9 21h6M4 10h16" />
    </svg>
  );
}
