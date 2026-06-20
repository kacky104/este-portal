import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { getBusinessDateRangeJST } from '@/lib/dutyStatus';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { getScheduleWindowStatus } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { NewBadge } from '@/components/NewBadge';
import { TherapistImageSlider } from './TherapistImageSlider';
import { TherapistDiaryList, type DiaryPostView } from './TherapistDiaryList';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${weekday})`;
}

function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m || 0)}`;
}

function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const prefix = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0)) ? '翌' : '';
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}

// ── page ──────────────────────────────────────────────────────

export default async function TherapistPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;

  const supabase = await createClient();

  const { data: tRow, error: tError } = await supabase
    .from('therapists')
    .select('id, name, profile_image_url, profile_images, age, body_type, profile_text, work_hours, comment, area, salon_id, is_new_face, new_face_since')
    .eq('id', id)
    .single();

  if (tError || !tRow) notFound();

  const { data: salonRow } = await supabase
    .from('salons')
    .select('id, name, area, hours, address, theme')
    .eq('id', tRow.salon_id as number)
    .single();

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

  // NEW バッジ：is_new_face かつ new_face_since から30日以内
  const showNew = isNewFaceActive(therapist.isNewFace, therapist.newFaceSince);
  const newBadgeNode = showNew ? (
    <NewBadge className="shadow-[0_1px_4px_rgba(0,0,0,0.3)]" />
  ) : null;

  // パンくずの中間項目を ?from= で動的に切り替え
  const fromCrumb =
    from === 'schedule'
      ? { label: '出勤情報', href: `/salon/${therapist.salonId}/schedule` }
      : from === 'therapists'
        ? { label: 'セラピスト一覧', href: `/salon/${therapist.salonId}/therapists` }
        : null;

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: theme.text }}>

      {/* 背景レイヤー（所属サロンと同じテーマ壁紙＋色オーバーレイ）— モバイル対応のため固定配置 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

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
          {fromCrumb && (
            <>
              <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
              <Link
                href={fromCrumb.href}
                className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap"
                style={{ color: '#ec4899' }}
              >
                {fromCrumb.label}
              </Link>
            </>
          )}
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

        {/* ─── プロフィール情報カード ───────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{therapist.name}</h1>
            <div className="flex items-center gap-2 mb-4">
              {therapist.age && (
                <span className="text-sm text-slate-500">{therapist.age}歳</span>
              )}
              {therapist.area && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {therapist.area}
                </span>
              )}
            </div>

            {/* Body type */}
            {therapist.bodyType && (
              <div className="flex flex-wrap gap-2 mb-4">
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

            {therapist.workHours && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
                <span>{therapist.workHours}</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Two-column layout ───────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left: main content */}
          <div className="lg:col-span-2 space-y-6 min-w-0">

            {/* Profile text */}
            {therapist.profileText && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <SectionHeading>プロフィール</SectionHeading>
                <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                  {therapist.profileText}
                </p>
              </section>
            )}

            {therapist.comment && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <SectionHeading>ひとことコメント</SectionHeading>
                <p className="text-slate-600 text-sm leading-relaxed">{therapist.comment}</p>
              </section>
            )}

            {/* Schedule */}
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

            {/* 写メ日記（新着6件 + 全部見る） */}
            {diaryPosts.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-x-hidden min-w-0">
                <div className="flex items-center justify-between gap-2 mb-4">
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
          </div>

          {/* Right: sidebar */}
          <div className="space-y-6">

            {/* Salon link */}
            {salon && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 mb-3 uppercase tracking-wide">所属サロン</p>
                <p className="font-bold text-slate-900 mb-1">{salon.name}</p>
                {salon.area && (
                  <p className="text-xs text-slate-500 mb-3">📍 {salon.area}</p>
                )}
                {salon.hours && (
                  <p className="text-xs text-slate-500 mb-4">🕒 {salon.hours}</p>
                )}
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
          © 2026 福岡メンズエステポータル. All rights reserved.
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
