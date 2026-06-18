import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getTheme } from "@/app/lib/themes";
import { getBusinessDateRangeJST } from "@/lib/dutyStatus";
import { WeeklySchedule, type DaySchedule } from "./WeeklySchedule";

export default async function SalonSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: salonRow, error } = await supabase
    .from('salons')
    .select('id, name, theme')
    .eq('id', Number(id))
    .single();

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

  // 個別サロンページと同じ背景レイヤー（壁紙＋テーマ色オーバーレイ、モバイル対応の固定配置）
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

  // 営業日基準（午前5時始まり）の7日間
  const dates = getBusinessDateRangeJST(7);

  const { data: therapistRows } = await supabase
    .from('therapists')
    .select('id, name, profile_image_url, is_available_now, available_until, is_new_face, new_face_since')
    .eq('salon_id', Number(id));

  const therapists = therapistRows ?? [];
  const tMap = new Map(therapists.map(t => [String(t.id), t]));

  let schedRows: Array<{ therapist_id: unknown; schedule_date: unknown; is_active: unknown; start_time: unknown; end_time: unknown }> = [];
  if (therapists.length > 0) {
    const { data } = await supabase
      .from('therapist_schedules')
      .select('therapist_id, schedule_date, is_active, start_time, end_time')
      .in('therapist_id', therapists.map(t => t.id))
      .in('schedule_date', dates);
    schedRows = data ?? [];
  }

  // 日付ごとに出勤予定セラピストを構築
  const byDate: Record<string, DaySchedule[]> = {};
  for (const d of dates) byDate[d] = [];

  for (const row of schedRows) {
    if (!row.is_active) continue;
    const start = row.start_time ? String(row.start_time).slice(0, 5) : null;
    const end   = row.end_time   ? String(row.end_time).slice(0, 5)   : null;
    if (!start || !end) continue;

    const dateStr = String(row.schedule_date);
    if (!byDate[dateStr]) continue;

    const t = tMap.get(String(row.therapist_id));
    if (!t) continue;

    byDate[dateStr].push({
      id:             String(t.id),
      name:           (t.name as string) ?? '',
      imageUrl:       (t.profile_image_url as string | null) ?? null,
      startTime:      start,
      endTime:        end,
      isAvailableNow: Boolean(t.is_available_now),
      availableUntil: (t.available_until as string | null) ?? null,
      isNewFace:      Boolean(t.is_new_face),
      newFaceSince:   (t.new_face_since as string | null) ?? null,
    });
  }

  // 出勤開始が早い順に並べる
  for (const d of dates) {
    byDate[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const salonName = (salonRow.name as string) ?? '';

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: theme.text }}>

      {/* 背景レイヤー（個別サロンページと同じテーマ壁紙） */}
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

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* 戻るリンク */}
        <Link
          href={`/salon/${id}`}
          className="inline-flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity mb-6"
          style={{ color: theme.body }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          サロンページへ戻る
        </Link>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>週間出勤予定</p>
        </div>

        <WeeklySchedule dates={dates} byDate={byDate} theme={theme} />
      </main>
    </div>
  );
}
