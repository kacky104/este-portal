import Link from "next/link";
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { notFound } from "next/navigation";
import { createPublicClient } from "@/app/lib/supabase/public";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { getBusinessDateRangeJST, getScheduleWindowStatus } from "@/lib/dutyStatus";
import { WeeklySchedule, type DaySchedule } from "./WeeklySchedule";
import { SalonNewFaceTherapists } from "@/components/SalonTherapists";
import { sanitizeBadges } from "@/lib/therapistBadges";
import { isImasuguLiveCamel, imasuguUntilCamel } from "@/lib/imasugu";
import type { Metadata } from "next";
import { buildSalonSubpageMetadata } from "../subpageMetadata";
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。詳細は ../subpageMetadata.ts。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return buildSalonSubpageMetadata(id, "schedule", "週間出勤予定");
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  // 第1段：salons と在籍セラピストは互いに独立なので並列取得。
  const [
    { data: salonRow, error },
    { data: therapistRows },
  ] = await Promise.all([
    supabase
      .from('salons')
      .select('id, name, theme')
      .eq('id', Number(id))
      .single(),
    supabase
      .from('therapists')
      .select('id, name, age, profile_image_url, is_available_now, available_until, is_available_now_cast, available_until_cast, is_new_face, new_face_since, body_type, feature_badges, user_id')
      .eq('salon_id', Number(id)),
  ]);

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  // 営業日基準（午前6時始まり）の7日間
  const dates = getBusinessDateRangeJST(7);

  const therapists = therapistRows ?? [];
  const tMap = new Map(therapists.map(t => [String(t.id), t]));
  const therapistIds = therapists.map(t => t.id);
  const userIds = therapists.map(t => t.user_id).filter((u): u is string => typeof u === 'string' && u !== '');

  // 第2段：壁紙（theme.key 依存）・スケジュール・写メ日記有無（therapistIds 依存）を並列取得。
  // therapistIds が空のときは .in が0件を返すため、結果は従来どおり空になる。
  const [wallpaperRes, schedRes, diaryRes, reviewRes, xRes] = await Promise.all([
    supabase
      .from('theme_wallpapers')
      .select('image_url')
      .eq('theme_key', theme.key)
      .maybeSingle(),
    supabase
      .from('therapist_schedules')
      .select('therapist_id, schedule_date, is_active, start_time, end_time')
      .in('therapist_id', therapistIds)
      .in('schedule_date', dates),
    supabase
      .from('diary_posts')
      .select('therapist_id')
      .in('therapist_id', therapistIds),
    supabase
      .from('therapist_reviews')
      .select('therapist_id')
      .in('therapist_id', therapistIds)
      .eq('status', 'approved'),
    supabase
      .from('x_profiles')
      .select('auth_user_id, handle')
      .in('auth_user_id', userIds)
      .eq('kind', 'therapist')
      .eq('status', 'approved')
      .not('handle', 'is', null),
  ]);

  const wallpaperUrl = (wallpaperRes.data?.image_url as string | undefined) ?? null;

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

  const schedRows: Array<{ therapist_id: unknown; schedule_date: unknown; is_active: unknown; start_time: unknown; end_time: unknown }> = schedRes.data ?? [];

  // 写メ日記の有無（diary_posts を1件以上持つ therapist_id の集合）。
  const diaryIds = new Set((diaryRes.data ?? []).map(r => String(r.therapist_id)));

  // 承認済み口コミ件数（therapist_id → 件数）。
  const reviewCountByTherapist: Record<string, number> = {};
  (reviewRes.data ?? []).forEach(r => {
    const key = String(r.therapist_id);
    reviewCountByTherapist[key] = (reviewCountByTherapist[key] ?? 0) + 1;
  });

  // fukuX 利用中（approved な therapist プロフィール）の auth_user_id → handle マップ。
  const fukuxHandleByUser = new Map<string, string>();
  (xRes.data ?? []).forEach(r => {
    if (r.handle) fukuxHandleByUser.set(String(r.auth_user_id), String(r.handle));
  });

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
      isAvailableNowCast: Boolean(t.is_available_now_cast),
      availableUntilCast: (t.available_until_cast as string | null) ?? null,
      isNewFace:      Boolean(t.is_new_face),
      newFaceSince:   (t.new_face_since as string | null) ?? null,
      bodyType:       (t.body_type as string | null) ?? null,
      hasDiary:       diaryIds.has(String(t.id)),
      reviewCount:    reviewCountByTherapist[String(t.id)] ?? 0,
      onFukuX:        fukuxHandleByUser.has(String(t.user_id)),
      xHandle:        fukuxHandleByUser.get(String(t.user_id)) ?? null,
      featureBadges:  sanitizeBadges(t.feature_badges),
    });
  }

  // 並び順は個別サロンページと統一:
  //   1. 今すぐ（is_available_now かつ available_until が未来）
  //   2. 出勤中・出勤予定（開始時間が早い順）
  //   3. 受付終了
  // ステータスは「本日」のみライブ判定。未来日は全員「出勤予定」なので開始時間順のみ。
  const todayStr = dates[0];
  const availableNowActive = (t: DaySchedule) => isImasuguLiveCamel(t);
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
        // 本日の今すぐ（rankToday 0）同士は残り時間少ない順（有効期限昇順）。その他は出勤開始時刻順。
        if (ra === 0) return imasuguUntilCamel(a) - imasuguUntilCamel(b);
        return a.startTime.localeCompare(b.startTime);
      });
    } else {
      byDate[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
  }

  const salonName = (salonRow.name as string) ?? '';

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 背景レイヤー（個別サロンページと同じテーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2"><SavedSalonsMenu /><VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu /></div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 週間出勤予定（他ページと同形式） ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || '店舗'}
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

        <WeeklySchedule dates={dates} byDate={byDate} theme={theme} salonId={Number(id)} />

        {/* 新人紹介（緑バー・全件表示。該当0人ならセクションごと非表示） */}
        <SalonNewFaceTherapists salonId={Number(id)} theme={theme} header="bar" maxItems={null} from="schedule" showSaveButton />
      </main>
    </div>
  );
}
