import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { getBusinessDateRangeJST, getScheduleWindowStatus } from "@/lib/dutyStatus";
import { WeeklySchedule, type DaySchedule } from "./WeeklySchedule";
import { SalonNewFaceTherapists } from "@/components/SalonTherapists";

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
    .select('id, name, age, profile_image_url, is_available_now, available_until, is_new_face, new_face_since, body_type')
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

  // 写メ日記の有無を1クエリでまとめて取得（diary_posts を1件以上持つ therapist_id の集合）
  let diaryIds = new Set<string>();
  if (therapists.length > 0) {
    const { data: diaryRows } = await supabase
      .from('diary_posts')
      .select('therapist_id')
      .in('therapist_id', therapists.map(t => t.id));
    diaryIds = new Set((diaryRows ?? []).map(r => String(r.therapist_id)));
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
      age:            (t.age as string | null) ?? null,
      imageUrl:       (t.profile_image_url as string | null) ?? null,
      startTime:      start,
      endTime:        end,
      isAvailableNow: Boolean(t.is_available_now),
      availableUntil: (t.available_until as string | null) ?? null,
      isNewFace:      Boolean(t.is_new_face),
      newFaceSince:   (t.new_face_since as string | null) ?? null,
      bodyType:       (t.body_type as string | null) ?? null,
      hasDiary:       diaryIds.has(String(t.id)),
    });
  }

  // 並び順は個別サロンページと統一:
  //   1. 今すぐ（is_available_now かつ available_until が未来）
  //   2. 出勤中・出勤予定（開始時間が早い順）
  //   3. 受付終了
  // ステータスは「本日」のみライブ判定。未来日は全員「出勤予定」なので開始時間順のみ。
  const todayStr = dates[0];
  const availableNowActive = (t: DaySchedule) =>
    t.isAvailableNow && t.availableUntil != null && new Date(t.availableUntil) > new Date();
  const rankToday = (t: DaySchedule): number => {
    if (availableNowActive(t)) return 0;
    const s = getScheduleWindowStatus(t.startTime, t.endTime);
    return s === 'after' ? 2 : 1; // onDuty / before → 1, after（受付終了）→ 2
  };
  for (const d of dates) {
    if (d === todayStr) {
      byDate[d].sort((a, b) => {
        const ra = rankToday(a), rb = rankToday(b);
        if (ra !== rb) return ra - rb;
        return a.startTime.localeCompare(b.startTime);
      });
    } else {
      byDate[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
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
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 週間出勤予定（他ページと同形式） ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || 'サロン'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>週間出勤予定</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>週間出勤予定</p>
        </div>

        <WeeklySchedule dates={dates} byDate={byDate} theme={theme} />

        {/* 新人紹介（緑バー・全件表示。該当0人ならセクションごと非表示） */}
        <SalonNewFaceTherapists salonId={Number(id)} theme={theme} header="bar" maxItems={null} from="schedule" />
      </main>
    </div>
  );
}
