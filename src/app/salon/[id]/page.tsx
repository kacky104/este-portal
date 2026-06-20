import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getTheme, breadcrumbCurrentColor, type ThemeKey } from "@/app/lib/themes";
import { getBusinessDateJST } from "@/lib/dutyStatus";

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

// 本日出勤数のハートバッジ専用の配色（テーマ連動）。fill=ハートの塗り / num=数字色（黒のみ濃い文字）。
const HEART_COLORS: Record<ThemeKey, { fill: string; num: string }> = {
  white:  { fill: '#3A3A38', num: '#ffffff' },
  black:  { fill: '#D4AF52', num: '#2B2A26' },
  pink:   { fill: '#D4537E', num: '#ffffff' },
  blue:   { fill: '#2576CC', num: '#ffffff' },
  red:    { fill: '#D63A3A', num: '#ffffff' },
  purple: { fill: '#6258C7', num: '#ffffff' },
};
import { SalonTherapists, SalonAllTherapists, SalonNewFaceTherapists } from "@/components/SalonTherapists";
import { SalonDiarySection } from "@/components/DiarySection";
import SalonHeaderSlider from "@/components/SalonHeaderSlider";
import { SalonNameBanner } from "./SalonNameBanner";
import { CollapsibleCourses } from "./CollapsibleCourses";
import { CollapsibleSection } from "./CollapsibleSection";

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
  const heart = HEART_COLORS[theme.key];

  // 在籍セラピストを取得（本日出勤数・今すぐ数の集計に使用）。
  const { data: salonTherapistRows } = await supabase
    .from('therapists')
    .select('id, is_available_now, available_until')
    .eq('salon_id', Number(id));
  const therapistRowsForCount = salonTherapistRows ?? [];
  const therapistIds = therapistRowsForCount.map(t => t.id);

  // 本日出勤セラピスト数（GridCardの「N名」と同一ロジック：当日の is_active スケジュールを持つ人数）。
  let onDutyCount = 0;
  // 本日の出勤総数（出勤予定・出勤中・受付終了の合計＝お休み除く。is_active かつ start/end が存在する人数）。
  let todayScheduledCount = 0;
  if (therapistIds.length > 0) {
    const today = getBusinessDateJST();
    const { data: schedRows } = await supabase
      .from('therapist_schedules')
      .select('therapist_id, is_active, start_time, end_time')
      .in('therapist_id', therapistIds)
      .eq('schedule_date', today);
    const activeRows = (schedRows ?? []).filter(r => Boolean(r.is_active));
    onDutyCount = new Set(activeRows.map(r => String(r.therapist_id))).size;
    todayScheduledCount = new Set(
      activeRows
        .filter(r => Boolean(r.start_time) && Boolean(r.end_time))
        .map(r => String(r.therapist_id))
    ).size;
  }

  // 今すぐ数（時刻ベース：is_available_now=true かつ available_until が未来）。最大3名。
  const nowMsForImasugu = Date.now();
  const imasuguCount = Math.min(
    3,
    therapistRowsForCount.filter(t =>
      Boolean(t.is_available_now) &&
      t.available_until != null &&
      new Date(t.available_until as string).getTime() > nowMsForImasugu
    ).length
  );

  // 写メ日記の48時間以内投稿数（このサロン所属セラピストの diary_posts を created_at で集計）。
  let diaryRecentCount = 0;
  if (therapistIds.length > 0) {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('diary_posts')
      .select('id', { count: 'exact', head: true })
      .in('therapist_id', therapistIds)
      .gte('created_at', cutoff);
    diaryRecentCount = count ?? 0;
  }

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

  // 店舗基本情報の中身（スマホ=サロンについての下／デスクトップ=右サイドバー の2箇所で共用）
  const shopInfoRows = (
    <dl className="space-y-3.5 text-sm">
      <InfoRow icon={<PhoneIcon />}    label="電話番号" value={salon.phone}      labelColor={theme.body} valueColor={theme.heading} />
      <InfoRow icon={<ClockIcon />}    label="営業時間" value={salon.hours}      labelColor={theme.body} valueColor={theme.heading} />
      <InfoRow icon={<CalendarIcon />} label="定休日"   value={salon.closedDays} labelColor={theme.body} valueColor={theme.heading} />
      <InfoRow icon={<MapIcon />}      label="住所"     value={salon.address}    labelColor={theme.body} valueColor={theme.heading} />
      <InfoRow icon={<TrainIcon />}    label="アクセス" value={salon.access}     labelColor={theme.body} valueColor={theme.heading} />
    </dl>
  );

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
          <span aria-current="page" className="inline-block max-w-[60%] truncate align-middle" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>
            {salon.name || 'サロン'}
          </span>
        </nav>

        {/* ─── Block 0: 店名（最上部・独立ブロック／初回キラリ演出） ─────── */}
        <SalonNameBanner name={salon.name} cardBg={theme.card} cardBorder={theme.cardBorder} heading={theme.heading} />

        {/* ─── Block 1: 画像スライダー ─────────────────── */}
        <div className="rounded-2xl border shadow-sm overflow-hidden mb-4" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          <SalonHeaderSlider images={salonImages} />
        </div>

        {/* ─── Two-column layout ───────────────────────── */}
        {/* スマホはブロック間の隙間を半分（space-y-3 / gap-3）。md+ は従来どおり。 */}
        <div className="grid lg:grid-cols-3 gap-3 md:gap-6">

          {/* Left: main content */}
          <div className="lg:col-span-2 space-y-3 md:space-y-6 min-w-0">

            {/* クイックナビ（装飾のみ・2行×3カード）。将来クリックやバッジを足せるよう各カードは独立要素にしておく。
                テーマ連動カラーで全テーマ視認可能。モバイルでも3カラム維持。段間は space-y で1段目と同間隔。 */}
            <div className="space-y-2 sm:space-y-3">
            {/* 1段目：本日出勤 / 料金 / 写メ日記 */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {/* 本日出勤（週間出勤予定ページへのリンク） */}
              <Link href={`/salon/${id}/schedule`} className="relative flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                {/* 本日出勤人数のハートバッジ（1名以上のときのみ右上にはみ出して表示）。Link内のためタップでも遷移する。 */}
                {onDutyCount > 0 && (
                  <svg
                    width="50" height="50" viewBox="0 0 100 100"
                    className="absolute drop-shadow"
                    style={{ top: '-12px', right: '-12px' }}
                    aria-label={`本日出勤 ${onDutyCount}名`}
                  >
                    <path d="M50 86 C50 86 14 60 14 34 C14 21 25 13 35 13 C43 13 48 19 50 25 C52 19 57 13 65 13 C75 13 86 21 86 34 C86 60 50 86 50 86 Z" fill={heart.fill} />
                    <text x="50" y="43" textAnchor="middle" dominantBaseline="central" fill={heart.num} fontWeight="600" fontSize={onDutyCount >= 10 ? 26 : 34}>{onDutyCount}</text>
                  </svg>
                )}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M16 11l2 2 4-4" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>本日出勤</span>
              </Link>
              {/* 今すぐ（顔＋ハート・今すぐ一覧ページへのリンク） */}
              <Link href={`/salon/${id}/imasugu`} className="relative flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                {/* 今すぐ人数のハートバッジ（1名以上のときのみ右上にはみ出して表示）。本日出勤カードと同一デザイン。Link内のためタップでも遷移する。 */}
                {imasuguCount > 0 && (
                  <svg
                    width="50" height="50" viewBox="0 0 100 100"
                    className="absolute drop-shadow"
                    style={{ top: '-12px', right: '-12px' }}
                    aria-label={`今すぐ ${imasuguCount}名`}
                  >
                    <path d="M50 86 C50 86 14 60 14 34 C14 21 25 13 35 13 C43 13 48 19 50 25 C52 19 57 13 65 13 C75 13 86 21 86 34 C86 60 50 86 50 86 Z" fill={heart.fill} />
                    <text x="50" y="43" textAnchor="middle" dominantBaseline="central" fill={heart.num} fontWeight="600" fontSize={imasuguCount >= 10 ? 26 : 34}>{imasuguCount}</text>
                  </svg>
                )}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9 9.5h.01" />
                  <path d="M15 9.5h.01" />
                  <path d="M12 17c1.5 -1.2 2.6 -2.1 2.6 -3.2a1.3 1.3 0 0 0 -2.6 -0.6a1.3 1.3 0 0 0 -2.6 0.6c0 1.1 1.1 2 2.6 3.2z" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>今すぐ</span>
              </Link>
              {/* 写メ日記（サロンの写メ日記一覧ページへのリンク） */}
              <Link href={`/salon/${id}/diary`} className="relative flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                {/* 48時間以内の投稿数のハートバッジ（1件以上のときのみ右上にはみ出して表示） */}
                {diaryRecentCount > 0 && (
                  <svg
                    width="50" height="50" viewBox="0 0 100 100"
                    className="absolute drop-shadow"
                    style={{ top: '-12px', right: '-12px' }}
                    aria-label={`写メ日記 48時間以内 ${diaryRecentCount}件`}
                  >
                    <path d="M50 86 C50 86 14 60 14 34 C14 21 25 13 35 13 C43 13 48 19 50 25 C52 19 57 13 65 13 C75 13 86 21 86 34 C86 60 50 86 50 86 Z" fill={heart.fill} />
                    <text x="50" y="43" textAnchor="middle" dominantBaseline="central" fill={heart.num} fontWeight="600" fontSize={diaryRecentCount >= 10 ? 26 : 34}>{diaryRecentCount}</text>
                  </svg>
                )}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>写メ日記</span>
              </Link>
            </div>

            {/* 2段目：今すぐ / クーポン / 口コミ（装飾のみ） */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {/* 料金（¥・コースメニュー・料金表ページへのリンク） */}
              <Link href={`/salon/${id}/price`} className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M12 13L7 5" />
                  <path d="M12 13l5-8" />
                  <path d="M12 13v6" />
                  <path d="M8 14h8" />
                  <path d="M8 17h8" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>料金</span>
              </Link>
              {/* 口コミ（メッセージ） */}
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" />
                  <path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>口コミ</span>
              </div>
              {/* クーポン（チケット・掲載型クーポン一覧ページへのリンク） */}
              <Link href={`/salon/${id}/coupon`} className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M15 5l0 2" />
                  <path d="M15 11l0 2" />
                  <path d="M15 17l0 2" />
                  <path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>クーポン</span>
              </Link>
            </div>

            {/* 3段目：セラピスト一覧 / お知らせ / 店舗情報 */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {/* セラピスト一覧（大人数グループ） */}
              <Link href={`/salon/${id}/therapists`} className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                  <path d="M8 21v-1a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v1" />
                  <path d="M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                  <path d="M17 10h2a2 2 0 0 1 2 2v1" />
                  <path d="M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                  <path d="M3 13v-1a2 2 0 0 1 2 -2h2" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>セラピスト一覧</span>
              </Link>
              {/* お知らせ（鳴るベル） */}
              <Link href={`/salon/${id}/news`} className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
                  <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
                  <path d="M21 6.727a11.05 11.05 0 0 0 -2.794 -3.727" />
                  <path d="M3 6.727a11.05 11.05 0 0 1 2.792 -3.727" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>お知らせ</span>
              </Link>
              {/* 店舗情報（ストア） */}
              <Link href={`/salon/${id}/info`} className="flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 sm:py-4 shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all" style={{ backgroundColor: qn.bg, borderColor: qn.border }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: qn.icon }}>
                  <path d="M3 21l18 0" />
                  <path d="M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4" />
                  <path d="M5 21l0 -10.15" />
                  <path d="M19 21l0 -10.15" />
                  <path d="M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4" />
                </svg>
                <span className="text-[11px] sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color: qn.text }}>店舗情報</span>
              </Link>
            </div>
            </div>

            {/* Today's therapists */}
            <div className="mt-8 rounded-3xl p-5 border shadow-sm" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">💖</span>
                  <h2 className="text-base font-bold" style={{ color: theme.heading }}>本日の出勤セラピスト<span className="text-2xl font-extrabold mx-1" style={{ color: '#ec4899' }}>{todayScheduledCount}</span>人</h2>
                </div>
                <Link
                  href={`/salon/${id}/schedule`}
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
              <SalonTherapists salonId={Number(id)} />
            </div>

            {/* Diary section（本日の出勤との隙間を半分に：space-y を上書き） */}
            <div className="!mt-1.5 md:!mt-3 rounded-3xl p-5 border shadow-sm" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
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

            {/* Courses — shown only when DB data is available（折り畳み式） */}
            {salon.courses.length > 0 && (
              <CollapsibleCourses courses={salon.courses} theme={theme} />
            )}

            {/* All therapists（折り畳み式） */}
            <CollapsibleSection theme={theme} className="!mt-1.5 md:!mt-3 rounded-2xl p-6 border shadow-sm" title="在籍セラピスト一覧">
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
            </CollapsibleSection>

            {/* About（折り畳み式・在籍セラピスト一覧の下） */}
            <CollapsibleSection theme={theme} className="rounded-2xl border shadow-sm p-6" title="サロンについて">
              <p className="text-sm leading-relaxed mb-4 break-words max-w-full whitespace-pre-wrap" style={{ color: theme.body }}>{salon.description}</p>
              <p className="text-sm leading-relaxed break-words max-w-full whitespace-pre-wrap" style={{ color: theme.body }}>{salon.appeal}</p>
            </CollapsibleSection>

            {/* Shop info（スマホのみ：サロンについての下に表示・折り畳み。デスクトップは右サイドバーに表示） */}
            <CollapsibleSection theme={theme} className="lg:hidden rounded-2xl border shadow-sm p-6" title="店舗基本情報">
              {shopInfoRows}
            </CollapsibleSection>

            {/* New face therapists（該当0人のときはセクションごと非表示） */}
            <SalonNewFaceTherapists salonId={Number(id)} theme={theme} />
          </div>

          {/* Right: shop info */}
          <div className="space-y-3 md:space-y-6 min-w-0">

            {/* Price summary */}
            <div className="bg-pink-600 rounded-2xl p-5 text-white max-w-full">
              <p className="text-xs font-semibold opacity-80 mb-1">料金目安</p>
              <p className="text-2xl font-bold break-words max-w-full">{salon.price}</p>
              <p className="text-xs opacity-70 mt-1">※ コースにより異なります</p>
            </div>

            {/* Rating（評価・口コミ件数。店舗基本情報の上） */}
            <div className="rounded-2xl border shadow-sm p-5" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={i < filledStars ? "text-pink-500" : "text-slate-300"} style={{ fontSize: "18px" }}>★</span>
                  ))}
                </div>
                <span className="text-pink-600 font-bold text-lg">{salon.rating}</span>
                <span className="text-sm" style={{ color: theme.body }}>({salon.reviewCount}件の口コミ)</span>
              </div>
            </div>

            {/* Shop info（デスクトップのみ：右サイドバーに常時展開で表示。スマホは左カラムのサロンについての下） */}
            <CollapsibleSection theme={theme} className="hidden lg:block rounded-2xl border shadow-sm p-5" title="店舗基本情報" mobileOnly>
              {shopInfoRows}
            </CollapsibleSection>

            {/* Note */}
            {salon.note && (
              <div className="rounded-xl border border-pink-100 bg-pink-50 p-4 text-xs text-pink-800 leading-relaxed max-w-full">
                <p className="font-semibold mb-1">ご利用にあたって</p>
                <p className="break-words max-w-full whitespace-pre-wrap">{salon.note}</p>
              </div>
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
