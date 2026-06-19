import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getTheme, type ThemeKey } from "@/app/lib/themes";

// クイックナビ3カード専用の配色（テーマ連動）。テーマ色の薄い地＋同系の濃いアイコン/文字でコントラストを確保。
// 黒のみ暗い地＋ゴールド。未設定/不明テーマは getTheme が white に正規化するためフォールバックも white。
const QUICKNAV_COLORS: Record<ThemeKey, { bg: string; border: string; icon: string; text: string }> = {
  white:  { bg: '#F4F3EF', border: '#CFCDC6', icon: '#3A3A38', text: '#3A3A38' },
  black:  { bg: '#2B2A26', border: '#6B5A2E', icon: '#D4AF52', text: '#E6C878' },
  pink:   { bg: '#FBEAF0', border: '#ED93B1', icon: '#993556', text: '#72243E' },
  blue:   { bg: '#E6F1FB', border: '#85B7EB', icon: '#185FA5', text: '#0C447C' },
  red:    { bg: '#FCEBEB', border: '#F09595', icon: '#A32D2D', text: '#791F1F' },
  purple: { bg: '#EEEDFE', border: '#AFA9EC', icon: '#3C3489', text: '#26215C' },
};
import { SalonTherapists, SalonAllTherapists, SalonNewFaceTherapists } from "@/components/SalonTherapists";
import { SalonDiarySection } from "@/components/DiarySection";
import SalonHeaderSlider from "@/components/SalonHeaderSlider";

export default async function SalonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('salons')
    .select('id, name, rating, review_count, tags, price, area, hours, description, appeal, phone, address, access, closed_days, note, courses, theme')
    .eq('id', Number(id))
    .single();

  if (error || !row) notFound();

  const { data: imageRows } = await supabase
    .from('salon_images')
    .select('image_url, mobile_image_url')
    .eq('salon_id', Number(id))
    .order('display_order', { ascending: true })
    .limit(3);

  const salonImages = (imageRows ?? []).map(r => ({
    pc:     r.image_url        as string,
    mobile: (r.mobile_image_url as string | null) ?? null,
  }));

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

  const theme = getTheme(row.theme as string | null);
  const qn = QUICKNAV_COLORS[theme.key];

  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

  // 壁紙画像をテーマ背景色で薄く覆い、読みやすさを確保。
  // background-attachment: fixed はモバイルで無視されるため、固定配置のレイヤーで実装。
  const bgLayerStyle: React.CSSProperties = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  };

  const filledStars = Math.floor(salon.rating);

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: theme.text }}>

      {/* 背景レイヤー（壁紙＋テーマ色オーバーレイ）— モバイル対応のため固定配置 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
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

      <main className="max-w-4xl mx-auto px-4 py-8 overflow-x-hidden">

        {/* ─── パンくずリスト：トップ › サロン名（他ページと同形式） ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="inline-block max-w-[60%] truncate align-middle" style={{ color: '#333', fontWeight: 600 }}>
            {salon.name || 'サロン'}
          </span>
        </nav>

        {/* ─── Block 0: 店名（最上部・独立ブロック） ─────── */}
        <div className="rounded-2xl border shadow-sm p-5 mb-4 text-center" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          <h1
            className="font-bold whitespace-nowrap overflow-hidden"
            style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}
          >{salon.name}</h1>
        </div>

        {/* ─── Block 1: 画像スライダー ─────────────────── */}
        <div className="rounded-2xl border shadow-sm overflow-hidden mb-4" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          <SalonHeaderSlider images={salonImages} />
        </div>

        {/* ─── Two-column layout ───────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left: main content */}
          <div className="lg:col-span-2 space-y-6 min-w-0">

            {/* クイックナビ（装飾のみ・3カード横並び）。将来クリックでセクションへスクロール等を足せるよう各カードは独立要素にしておく。
                白背景＋薄ピンク枠線＋ピンク文字でテーマ非依存に視認可能。モバイルでも3カラム維持。 */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {/* 本日出勤 */}
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M16 11l2 2 4-4" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>本日出勤</span>
              </div>
              {/* 料金 */}
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M12 13L7 5" />
                  <path d="M12 13l5-8" />
                  <path d="M12 13v6" />
                  <path d="M8 14h8" />
                  <path d="M8 17h8" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>料金</span>
              </div>
              {/* 写メ日記 */}
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>写メ日記</span>
              </div>
            </div>

            {/* Today's therapists */}
            <div className="mt-8 rounded-3xl p-5 border shadow-sm" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">💖</span>
                <h2 className="text-base font-bold" style={{ color: theme.heading }}>本日出勤のセラピスト</h2>
              </div>
              <SalonTherapists salonId={Number(id)} />

              <div className="mt-4 text-center">
                <Link
                  href={`/salon/${id}/schedule`}
                  className="inline-flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity"
                  style={{
                    background: 'linear-gradient(to right, #ec4899, #f97316)',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '10px 24px',
                    fontWeight: 600,
                  }}
                >
                  すべて見る
                </Link>
              </div>
            </div>

            {/* Diary section */}
            <div className="mt-8 rounded-3xl p-5 border shadow-sm" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">📷</span>
                  <h2 className="text-base font-bold truncate" style={{ color: theme.heading }}>セラピスト写メ日記</h2>
                </div>
                <Link
                  href={`/salon/${id}/diary`}
                  className="inline-block text-sm font-bold flex-shrink-0"
                  style={{
                    background: 'linear-gradient(to right, #ec4899, #f97316)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    color: 'transparent',
                  }}
                >
                  全部見る →
                </Link>
              </div>
              <SalonDiarySection salonId={id} />
            </div>

            {/* Courses — shown only when DB data is available */}
            {salon.courses.length > 0 && (
              <section className="rounded-2xl border shadow-sm p-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
                <SectionHeading color={theme.heading}>コースメニュー・料金表</SectionHeading>
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
                        <h3 className="text-sm font-bold min-w-0 break-words" style={{ color: theme.heading }}>{name}</h3>
                      </div>
                      <div className="pl-4 space-y-1.5">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 text-sm border-b pb-1 last:border-0 last:pb-0" style={{ borderColor: theme.cardBorder }}>
                            <span className="min-w-0 break-words" style={{ color: theme.body }}>{item.duration}</span>
                            <span className="font-bold text-pink-600 flex-shrink-0 break-words text-right">{item.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-5 opacity-70" style={{ color: theme.body }}>※ 表示料金はすべて税込み価格です。</p>
              </section>
            )}

            {/* All therapists */}
            <div className="mt-8 rounded-3xl p-5 border shadow-sm" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">👩‍🦰</span>
                <h2 className="text-base font-bold" style={{ color: theme.heading }}>在籍セラピスト一覧</h2>
              </div>
              <SalonAllTherapists salonId={Number(id)} limit={4} />

              <div className="mt-4 text-center">
                <Link
                  href={`/salon/${id}/therapists`}
                  className="inline-flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity"
                  style={{
                    background: 'linear-gradient(to right, #ec4899, #f97316)',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '10px 24px',
                    fontWeight: 600,
                  }}
                >
                  すべて見る
                </Link>
              </div>
            </div>

            {/* New face therapists（該当0人のときはセクションごと非表示） */}
            <SalonNewFaceTherapists salonId={Number(id)} theme={theme} />

            {/* About */}
            <section className="rounded-2xl border shadow-sm p-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
              <SectionHeading color={theme.heading}>サロンについて</SectionHeading>
              <p className="text-sm leading-relaxed mb-4 break-words max-w-full whitespace-pre-wrap" style={{ color: theme.body }}>{salon.description}</p>
              <p className="text-sm leading-relaxed break-words max-w-full whitespace-pre-wrap" style={{ color: theme.body }}>{salon.appeal}</p>
            </section>
          </div>

          {/* Right: shop info */}
          <div className="space-y-6 min-w-0">

            {/* Price summary */}
            <div className="bg-pink-600 rounded-2xl p-5 text-white max-w-full">
              <p className="text-xs font-semibold opacity-80 mb-1">料金目安</p>
              <p className="text-2xl font-bold break-words max-w-full">{salon.price}</p>
              <p className="text-xs opacity-70 mt-1">※ コースにより異なります</p>
            </div>

            {/* Shop info */}
            <section className="rounded-2xl border shadow-sm p-5" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
              <SectionHeading color={theme.heading}>店舗基本情報</SectionHeading>
              <dl className="space-y-3.5 text-sm">
                <InfoRow icon={<PhoneIcon />}    label="電話番号" value={salon.phone}      labelColor={theme.body} valueColor={theme.heading} />
                <InfoRow icon={<ClockIcon />}    label="営業時間" value={salon.hours}      labelColor={theme.body} valueColor={theme.heading} />
                <InfoRow icon={<CalendarIcon />} label="定休日"   value={salon.closedDays} labelColor={theme.body} valueColor={theme.heading} />
                <InfoRow icon={<MapIcon />}      label="住所"     value={salon.address}    labelColor={theme.body} valueColor={theme.heading} />
                <InfoRow icon={<TrainIcon />}    label="アクセス" value={salon.access}     labelColor={theme.body} valueColor={theme.heading} />
              </dl>
            </section>

            {/* Note */}
            {salon.note && (
              <div className="rounded-xl border border-pink-100 bg-pink-50 p-4 text-xs text-pink-800 leading-relaxed max-w-full">
                <p className="font-semibold mb-1">ご利用にあたって</p>
                <p className="break-words max-w-full whitespace-pre-wrap">{salon.note}</p>
              </div>
            )}

          </div>
        </div>

        {/* ─── Block: 評価・営業時間（ページ下部へ移動） ─────── */}
        <div className="rounded-2xl border shadow-sm p-6 mt-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>

          {/* Rating row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < filledStars ? "text-pink-500" : "text-slate-300"} style={{ fontSize: "18px" }}>★</span>
              ))}
            </div>
            <span className="text-pink-600 font-bold text-lg">{salon.rating}</span>
            <span className="text-sm" style={{ color: theme.body }}>({salon.reviewCount}件の口コミ)</span>
          </div>

          {/* Hours + closed days */}
          <div className="flex flex-wrap items-center gap-2 text-sm max-w-full" style={{ color: theme.body }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 opacity-60">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            <span className="min-w-0 break-words">{salon.hours}</span>
            {salon.closedDays && (
              <>
                <span className="opacity-40">｜</span>
                <span className="min-w-0 break-words">定休：{salon.closedDays}</span>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t py-6 mt-12" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 text-center text-xs opacity-70" style={{ color: theme.body }}>
          © 2026 福岡メンズエステポータル. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

/* ── Helper components ─────────────────────────────────── */

function SectionHeading({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
      <h3 className="font-bold" style={color ? { color } : undefined}>{children}</h3>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  labelColor,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  labelColor?: string;
  valueColor?: string;
}) {
  return (
    <div className="flex gap-3">
      <dt className="flex items-start gap-1.5 flex-shrink-0 w-20 text-[11px] pt-0.5" style={{ color: labelColor ?? '#94a3b8' }}>
        <span className="mt-px">{icon}</span>
        {label}
      </dt>
      <dd className="text-[13px] leading-relaxed min-w-0 break-words" style={{ color: valueColor ?? '#334155' }}>{value}</dd>
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
