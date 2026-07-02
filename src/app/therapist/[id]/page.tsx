import { Suspense } from 'react';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { areaLabel } from '@/app/lib/areaLabel';
import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { FromCrumb } from './FromCrumb';
import { getBusinessDateRangeJST } from '@/lib/dutyStatus';
import { formatDate, formatTime, buildDisplayHours } from '@/lib/scheduleFormat';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { getScheduleWindowStatus } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { deriveTherapistStatusBadge } from '@/lib/therapistStatusBadge';
import { TherapistStatusBadge } from '@/components/TherapistStatusBadge';
import { NewBadge } from '@/components/NewBadge';
import { TherapistImageSlider } from './TherapistImageSlider';
import { TherapistDiaryList, type DiaryPostView } from './TherapistDiaryList';
import { CollapsibleProfile } from './CollapsibleProfile';
import { AutoFitName } from './AutoFitName';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { SaveButton } from '@/app/components/SaveButton';
import { ViewHistoryLogger } from '@/app/components/ViewHistoryLogger';
import { sanitizeBadges, getBadgeColors } from '@/lib/therapistBadges';
import { getReviewStats, getApprovedReviews } from '@/app/lib/reviews';
import { ReviewSummary } from '@/app/components/ReviewSummary';
import { ReviewList } from '@/app/components/ReviewList';
import { getLinkedXProfileForTherapist } from '@/app/lib/xLink';
import { VerifiedBadge } from '@/app/x/VerifiedBadge';

// ── helpers ───────────────────────────────────────────────────

function parseBodyType(raw: string | null) {
  if (!raw) return null;
  const hMatch   = raw.match(/T(\d+)/);
  const bMatch   = raw.match(/B(\d+)\(([A-Za-z]+)\)/);
  const wMatch   = raw.match(/W(\d+)/);
  const hipMatch = raw.match(/H(\d+)/);
  return {
    height: hMatch?.[1]   ?? null,
    bust:   bMatch?.[1]   ?? null,
    cup:    bMatch?.[2]   ?? null,
    waist:  wMatch?.[1]   ?? null,
    hip:    hipMatch?.[1] ?? null,
  };
}

// 出勤スケジュール整形（formatDate / formatTime / buildDisplayHours）は
// fukuX 側 /x/u/[handle] と共有するため src/lib/scheduleFormat.ts へ切り出し済み。

// ── page ──────────────────────────────────────────────────────

// ISR：10分ごとに再生成（保存時は /api/revalidate で /salon/[id] 配下を 'layout' 無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function TherapistPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createPublicClient();

  const { data: tRow, error: tError } = await supabase
    .from('therapists')
    .select('id, name, profile_image_url, profile_images, age, body_type, profile_text, work_hours, comment, area, salon_id, is_new_face, new_face_since, is_available_now, available_until, is_available_now_cast, available_until_cast, feature_badges, user_id')
    .eq('id', id)
    .single();

  if (tError || !tRow) notFound();

  const { data: salonRow } = await supabase
    .from('salons')
    .select('id, name, area, hours, address, theme, is_hidden')
    .eq('id', tRow.salon_id as number)
    .single();

  // 所属サロンが非表示（or 取得不可）ならセラピスト詳細も404にする（公開側から隠す）。
  if (!salonRow || salonRow.is_hidden) notFound();

  // 所属サロンと同じテーマ壁紙を背景に適用
  const theme = getTheme((salonRow?.theme as string | null) ?? null);
  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

  // 壁紙をテーマ背景色で薄く覆い読みやすさを確保。モバイル対応のため固定配置レイヤーで実装。
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

  // 写メ日記（新しい順）
  const { data: diaryRows } = await supabase
    .from('diary_posts')
    .select('id, images, title, created_at')
    .eq('therapist_id', Number(id))
    .order('created_at', { ascending: false });
  const diaryPosts: DiaryPostView[] = (diaryRows ?? []).map((p) => ({
    id: p.id as number,
    images: (p.images as string[] | null) ?? [],
    title: (p.title as string | null) ?? null,
    created_at: String(p.created_at),
  }));

  const dates = getBusinessDateRangeJST(7);

  const { data: schedRows } = await supabase
    .from('therapist_schedules')
    .select('schedule_date, is_active, start_time, end_time')
    .eq('therapist_id', id)
    .in('schedule_date', dates)
    .order('schedule_date', { ascending: true });

  const schedMap: Record<string, { is_active: boolean; start_time: string | null; end_time: string | null }> = {};
  (schedRows ?? []).forEach(row => {
    schedMap[String(row.schedule_date)] = {
      is_active:  Boolean(row.is_active),
      start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
      end_time:   row.end_time   ? String(row.end_time).slice(0, 5)   : null,
    };
  });

  const therapist = {
    id:              String(tRow.id),
    name:            (tRow.name as string) ?? '',
    profileImageUrl: (tRow.profile_image_url as string | null) ?? null,
    profileImages:   (tRow.profile_images as string[] | null) ?? null,
    age:             (tRow.age as string | null) ?? null,
    bodyType:        parseBodyType(tRow.body_type as string | null),
    profileText:     (tRow.profile_text as string | null) ?? null,
    workHours:       (tRow.work_hours as string | null) ?? null,
    comment:         (tRow.comment as string | null) ?? null,
    area:            (tRow.area as string | null) ?? null,
    salonId:         tRow.salon_id as number,
    isNewFace:       Boolean(tRow.is_new_face),
    newFaceSince:    (tRow.new_face_since as string | null) ?? null,
    // 特徴バッジ（既知のみ・重複除去・最大3つに正規化。色/ラベルは therapistBadges が唯一のソース）
    featureBadges:   sanitizeBadges(tRow.feature_badges),
  };

  const salon = salonRow
    ? {
        id:      salonRow.id as number,
        name:    (salonRow.name as string) ?? '',
        area:    (salonRow.area as string) ?? '',
        hours:   (salonRow.hours as string) ?? '',
        address: (salonRow.address as string) ?? '',
      }
    : null;

  // 表示用画像：profile_images を優先、無ければ既存の単一画像を1枚目として扱う（互換性）
  const images =
    therapist.profileImages && therapist.profileImages.length > 0
      ? therapist.profileImages.filter(Boolean)
      : therapist.profileImageUrl
        ? [therapist.profileImageUrl]
        : [];

  // 中央画像へ重ねるバッジ
  // 出勤ステータス：onDuty=出勤中(緑)、before=出勤予定(オレンジ)。after / お休み は非表示。
  // サイト標準（サロン一覧/詳細の本日出勤）に合わせ、まず「本日の出勤スケジュール（is_active）」で
  // ゲートし、出勤日のみ その日の実スケジュール時刻で時間帯を判定する。
  // 静的な work_hours は使わない（お休みでも出勤予定が出る不具合の原因だったため）。
  const todaySched = schedMap[dates[0]]; // dates[0] = 営業日基準の本日
  const todayWindow: 'off' | 'onDuty' | 'before' | 'after' = !todaySched?.is_active
    ? 'off'
    : todaySched.start_time && todaySched.end_time
      ? getScheduleWindowStatus(todaySched.start_time, todaySched.end_time)
      : 'onDuty'; // 出勤日だが時刻未設定 → 出勤中扱い（サイト標準と同じ）
  const dutyBadge =
    todayWindow === 'onDuty'
      ? { label: '出勤中', bg: '#22c55e' }
      : todayWindow === 'before'
        ? { label: '出勤予定', bg: '#f97316' }
        : null;
  const dutyBadgeNode = dutyBadge ? (
    <span
      style={{
        background: dutyBadge.bg,
        color: '#ffffff',
        fontSize: '12px',
        fontWeight: 700,
        padding: '4px 12px',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {dutyBadge.label}
    </span>
  ) : null;

  // 名前隣のステータスバッジ（今すぐ/出勤中/出勤予定/受付終了/お休み）。「今すぐ」最優先。
  // 今すぐの有効期限（available_until）は時刻依存のため、PC/スマホ共通のクライアントコンポーネント
  // TherapistStatusBadge がマウント時の現在時刻で再判定する（ISRキャッシュ焼き付き＆PC/スマホの食い違いを防止）。
  // サーバー初期描画用に同じ純関数でフォールバック値（initial）を作る。今すぐ判定はオーナー枠＋キャスト枠の和集合。
  const badgeProps = {
    ownerOn: Boolean(tRow.is_available_now),
    ownerUntil: (tRow.available_until as string | null) ?? null,
    castOn: Boolean(tRow.is_available_now_cast),
    castUntil: (tRow.available_until_cast as string | null) ?? null,
    todayIsActive: Boolean(todaySched?.is_active),
    todayStart: (todaySched?.start_time as string | null) ?? null,
    todayEnd: (todaySched?.end_time as string | null) ?? null,
  };
  const statusBadgeNode = (
    <TherapistStatusBadge {...badgeProps} initial={deriveTherapistStatusBadge({ ...badgeProps, now: new Date() })} />
  );

  // モバイルレイアウト用：本日が出勤日か（7日間スケジュールと同じ todayWindow 基準）と、本日のシフト時間。
  const isWorkingToday = todayWindow !== 'off';
  const todayShiftHours =
    todaySched?.is_active && todaySched.start_time && todaySched.end_time
      ? buildDisplayHours(todaySched.start_time, todaySched.end_time)
      : null;

  // NEW バッジ：is_new_face かつ new_face_since から30日以内
  const showNew = isNewFaceActive(therapist.isNewFace, therapist.newFaceSince);
  const newBadgeNode = showNew ? (
    <NewBadge className="shadow-[0_1px_4px_rgba(0,0,0,0.3)]" />
  ) : null;

  // 口コミ（承認済みのみ・公開）。getReviewStats/getApprovedReviews は内部で createPublicClient を
  // 使う（cookies() を呼ばない）ため、既存の ISR を壊さない。
  const therapistId = Number(id);
  // fukuX 連携：このセラピストが fukuX(x_profiles) に approved で居れば誘導カードを出す。
  // 公開読み取り（createPublicClient）なので ISR を壊さない。連携は頻繁に変わらずキャッシュ焼き付きも許容。
  const [reviewStats, reviews, xLink] = await Promise.all([
    getReviewStats(therapistId),
    getApprovedReviews(therapistId),
    getLinkedXProfileForTherapist((tRow.user_id as string | null) ?? null),
  ]);

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 会員の閲覧履歴を記録（クライアント側・ログイン中のみ） */}
      <ViewHistoryLogger itemType="therapist" itemId={Number(id)} />

      {/* 背景レイヤー（所属サロンと同じテーマ壁紙＋色オーバーレイ）— モバイル対応のため固定配置 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header（所属サロンのテーマ色と連動。他のテーマ対応ページと同じ仕組み） ─── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト（シンプル矢印形式）：トップ › サロン名 › セラピスト名 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link
            href="/"
            className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap"
            style={{ color: '#ec4899' }}
          >
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link
            href={`/salon/${therapist.salonId}`}
            className="hover:opacity-80 transition-opacity inline-block max-w-[35%] truncate align-middle"
            style={{ color: '#ec4899' }}
          >
            {salon?.name ?? 'サロン'}
          </Link>
          <Suspense fallback={null}>
            <FromCrumb salonId={therapist.salonId} />
          </Suspense>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span
            aria-current="page"
            className="inline-block max-w-[40%] truncate align-middle"
            style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}
          >
            {therapist.name}
          </span>
        </nav>

        {/* ─── 画像スライダー（カードから独立した透明ブロック） ─── */}
        {/* スマホ：-mx-4でmainのpx-4を打ち消し画面いっぱい(w-full)に。高さ500px / md以上700px */}
        <div className="relative -mx-4 md:mx-0 h-[500px] md:h-[700px] mb-6">
          {images.length > 0 ? (
            <TherapistImageSlider
              images={images}
              name={therapist.name}
              overlayTopLeft={dutyBadgeNode}
              overlayTopRight={newBadgeNode}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center text-white font-bold text-4xl shadow-lg">
                {therapist.name.charAt(0)}
              </div>
            </div>
          )}
        </div>

        {/* ─── Two-column layout ───────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left: main content */}
          <div className="lg:col-span-2 space-y-6 min-w-0">

            {/* ─── プロフィール情報カード（デスクトップでプロフィール等と同じ左カラム幅に揃える） ─── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 relative">
                {/* 保存ボタン（プロフィール情報ブロックの右上）。名前等の領域とは pr で干渉回避。 */}
                <div className="absolute top-2.5 right-2.5 z-10">
                  <SaveButton
                    kind="therapist"
                    item={{ id: Number(therapist.id), name: therapist.name, salonId: therapist.salonId }}
                    size={36}
                    variant="sakura"
                  />
                </div>

                {/* ── 名前＋出勤情報（デスクトップ：名前・年齢の右横に出勤時間=work_hours、その横にバッジ） ── */}
                <div className="hidden md:block mb-1 pr-12">
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                    <h1 className="text-2xl font-bold text-slate-900">
                      {therapist.name}
                      {therapist.age && <span className="ml-0.5">（{therapist.age}）</span>}
                    </h1>
                    {therapist.workHours && (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-500">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
                          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        {therapist.workHours}
                      </span>
                    )}
                    {statusBadgeNode}
                  </div>
                </div>

                {/* ── 名前＋出勤情報（モバイルのみ） ── */}
                {/* 名前の横の領域を、出勤日は「バッジ／今日のシフト時間」の2段、お休みは「お休みバッジ中央寄せ」に。
                    判定・出勤時間は 7日間スケジュールと同じデータ源（todayWindow / todaySched）を使用。 */}
                <div className="md:hidden flex items-stretch gap-2.5 mb-1 pr-12">
                  <h1 className="text-2xl font-bold text-slate-900 min-w-0 self-center break-words">
                    {therapist.name}
                    {therapist.age && <span className="ml-0.5">（{therapist.age}）</span>}
                  </h1>
                  {isWorkingToday ? (
                    // 出勤バッジは出勤時間の中央（左右対称な「12:00〜21:00」の "〜" の位置）の真上に来るよう中央寄せ。
                    <div className="flex flex-col items-center justify-center gap-1 flex-shrink-0">
                      {statusBadgeNode}
                      {todayShiftHours && (
                        <span className="text-sm font-medium text-slate-500 whitespace-nowrap">
                          {todayShiftHours}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center flex-shrink-0">
                      {statusBadgeNode}
                    </div>
                  )}
                </div>

                {/* Body type */}
                {therapist.bodyType && (
                  <div className="flex flex-wrap gap-2">
                    {therapist.bodyType.height && (
                      <BodyBadge label="T" value={`${therapist.bodyType.height}cm`} />
                    )}
                    {therapist.bodyType.bust && therapist.bodyType.cup && (
                      <BodyBadge label="B" value={`${therapist.bodyType.bust}(${therapist.bodyType.cup})`} />
                    )}
                    {therapist.bodyType.waist && (
                      <BodyBadge label="W" value={`${therapist.bodyType.waist}cm`} />
                    )}
                    {therapist.bodyType.hip && (
                      <BodyBadge label="H" value={`${therapist.bodyType.hip}cm`} />
                    )}
                  </div>
                )}

                {/* 特徴バッジ（スリーサイズの下。色/ラベルは therapistBadges を参照。空なら非表示） */}
                {therapist.featureBadges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 justify-center sm:justify-start">
                    {therapist.featureBadges.map((label) => {
                      const c = getBadgeColors(label);
                      if (!c) return null;
                      return (
                        <span
                          key={label}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border"
                          style={{ backgroundColor: c.fill, color: c.text, borderColor: c.border }}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ─── fukuX 連携（このセラピストが fukuX に approved で居るときのみ） ─── */}
            {xLink && (
              <a
                href={`/x/u/${xLink.handle}`}
                className="block bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-indigo-500 to-sky-500 flex-shrink-0" />
                  <h3 className="font-bold text-slate-900">fukuXで投稿中</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="relative w-12 h-12 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {xLink.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={xLink.avatarUrl} alt={xLink.displayName ?? xLink.handle} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-lg">{(xLink.displayName ?? xLink.handle).charAt(0) || '?'}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 truncate">{xLink.displayName ?? `@${xLink.handle}`}</span>
                      {xLink.isVerified && <VerifiedBadge kind="therapist" />}
                    </div>
                    <p className="text-xs text-slate-400 truncate">@{xLink.handle}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 flex-shrink-0">
                    見る
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </a>
            )}

            {/* 写メ日記（新着6件 + 全部見る）— プロフィールの上に表示 */}
            {diaryPosts.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-x-hidden min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700 flex-shrink-0" />
                    <h3 className="font-bold text-slate-900 truncate">写メ日記</h3>
                  </div>
                  <Link
                    href={`/therapist/${id}/diary`}
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
                <TherapistDiaryList posts={diaryPosts.slice(0, 6)} name={therapist.name} />
              </section>
            )}

            {/* Schedule（プロフィールの上に表示） */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionHeading>出勤スケジュール（7日間）</SectionHeading>
              <div className="space-y-2">
                {dates.map(date => {
                  const sched = schedMap[date];
                  const isActive = sched?.is_active ?? false;
                  const hours    = isActive
                    ? buildDisplayHours(sched.start_time, sched.end_time)
                    : null;
                  return (
                    <div
                      key={date}
                      className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm ${
                        isActive
                          ? 'bg-pink-50 border border-pink-100'
                          : 'bg-slate-50 border border-slate-100'
                      }`}
                    >
                      <span className={`font-medium ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                        {formatDate(date)}
                      </span>
                      {isActive ? (
                        <span className="text-pink-600 font-bold text-xs">
                          🕒 {hours || `${formatTime(sched.start_time)}〜${formatTime(sched.end_time)}`}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">お休み</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Profile text（折り畳み：クリックで開閉。サロン個別ページの折り畳みと同デザイン） */}
            {therapist.profileText && (
              <CollapsibleProfile title="プロフィール">
                <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                  {therapist.profileText}
                </p>
              </CollapsibleProfile>
            )}

            {therapist.comment && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <SectionHeading>ひとことコメント</SectionHeading>
                <p className="text-slate-600 text-sm leading-relaxed">{therapist.comment}</p>
              </section>
            )}

            {/* ─── 口コミ（承認済みのみ公開・3軸評価） ─── */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-orange-400 to-pink-600" />
                  <h3 className="font-bold text-slate-900">口コミ</h3>
                </div>
                {/* 投稿は所属店舗の投稿ページへ（セラピストを選んで投稿） */}
                <Link
                  href={`/salon/${therapist.salonId}/review/new`}
                  className="inline-block text-sm font-bold text-white px-4 py-2 rounded-xl shadow-sm flex-shrink-0"
                  style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
                >
                  口コミを書く
                </Link>
              </div>

              <ReviewSummary stats={reviewStats} />
              {/* 詳細ページでは最新1件のみ表示（getApprovedReviews は新しい順）。2件以上あれば専用ページへ。 */}
              <ReviewList reviews={reviews.slice(0, 1)} />
              {reviews.length > 1 && (
                <div className="text-right">
                  <Link
                    href={`/therapist/${id}/reviews`}
                    className="inline-block text-sm font-bold"
                    style={{
                      background: 'linear-gradient(to right, #ec4899, #f97316)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                    }}
                  >
                    すべての口コミを見る →
                  </Link>
                </div>
              )}
            </section>

          </div>

          {/* Right: sidebar */}
          <div className="space-y-6">

            {/* Salon link */}
            {salon && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                {/* モバイル：「所属サロン」ラベルの右隣に営業時間・地域。デスクトップ：ラベルの下に表示 */}
                <div className="flex flex-row items-center gap-2 lg:flex-col lg:items-start lg:gap-1 mb-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">所属サロン</p>
                  <div className="flex items-center gap-2 min-w-0">
                    {salon.hours && (
                      <span className="text-xs text-slate-500 whitespace-nowrap truncate">🕒 {salon.hours}</span>
                    )}
                    {salon.area && (
                      <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">📍 {areaLabel(salon.area)}</span>
                    )}
                  </div>
                </div>
                {/* 店名（2行になる場合フォントを縮めて1行に収める） */}
                <AutoFitName name={salon.name} className="mb-4" />
                <Link
                  href={`/salon/${salon.id}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-pink-600 text-white text-xs font-bold hover:bg-pink-700 transition-colors"
                >
                  サロン詳細を見る
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}

            {/* Back CTA */}
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-pink-300 text-pink-600 text-sm font-medium hover:bg-pink-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 5l-7 7 7-7" />
              </svg>
              一覧へ戻る
            </Link>
          </div>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

/* ── helper components ─────────────────────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
      <h3 className="font-bold text-slate-900">{children}</h3>
    </div>
  );
}

function BodyBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700">
      <span className="font-bold text-pink-500">{label}</span>
      {value}
    </span>
  );
}
