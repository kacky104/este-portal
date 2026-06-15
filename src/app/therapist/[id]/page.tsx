import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { checkDutyStatus } from '@/lib/dutyStatus';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const GRADS    = [
  'from-pink-300 to-rose-400',
  'from-fuchsia-300 to-pink-400',
  'from-rose-300 to-pink-500',
  'from-pink-400 to-fuchsia-400',
];

function getJSTDateStr(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
}

function formatAge(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? `${digits}歳` : null;
}

function buildHoursStr(start: string, end: string): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const prefix = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0)) ? '翌' : '';
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}

export default async function TherapistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId  = Number(id);
  if (isNaN(numId)) notFound();

  const supabase = await createClient();

  // ── セラピスト取得 ──
  const { data: t, error } = await supabase
    .from('therapists')
    .select('id, name, work_hours, area, comment, profile_image_url, profile_text, age, body_type, salon_id')
    .eq('id', numId)
    .single();

  if (error || !t) notFound();

  // ── サロン名取得 ──
  let salonName = '';
  const salonId = t.salon_id as number | null;
  if (salonId) {
    const { data: salon } = await supabase
      .from('salons')
      .select('name')
      .eq('id', salonId)
      .single();
    salonName = (salon?.name as string) ?? '';
  }

  // ── 7日分スケジュール取得 ──
  const now   = new Date();
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    return getJSTDateStr(d);
  });

  const { data: schedData } = await supabase
    .from('therapist_schedules')
    .select('schedule_date, is_active, start_time, end_time')
    .eq('therapist_id', numId)
    .in('schedule_date', dates);

  type SchedRow = { is_active: boolean; start: string; end: string };
  const schedMap: Record<string, SchedRow> = {};
  (schedData ?? []).forEach(row => {
    schedMap[row.schedule_date as string] = {
      is_active: Boolean(row.is_active),
      start:     row.start_time ? String(row.start_time).slice(0, 5) : '',
      end:       row.end_time   ? String(row.end_time).slice(0, 5)   : '',
    };
  });

  // ── 今日の出勤バッジ ──
  const todayStr      = dates[0];
  const todaySchedule = schedMap[todayStr];
  const todayHours    =
    todaySchedule?.is_active && todaySchedule.start && todaySchedule.end
      ? buildHoursStr(todaySchedule.start, todaySchedule.end)
      : '';

  type Badge = { label: string; cls: string };
  let dutyBadge: Badge = { label: '本日はお休み', cls: 'bg-slate-100 text-slate-500' };
  if (todayHours) {
    const { status } = checkDutyStatus(todayHours);
    if      (status === 'onDuty') dutyBadge = { label: '出勤中',       cls: 'bg-emerald-50 text-emerald-600 border border-emerald-200' };
    else if (status === 'before') dutyBadge = { label: '本日出勤予定', cls: 'bg-sky-50 text-sky-600 border border-sky-100' };
    else                          dutyBadge = { label: '受付終了',     cls: 'bg-rose-50 text-rose-400 border border-rose-100' };
  }

  // ── フィールド ──
  const name         = (t.name            as string | null) ?? '';
  const profileImage = (t.profile_image_url as string | null) ?? null;
  const profileText  = (t.profile_text    as string | null) ?? null;
  const age          = (t.age             as string | null) ?? null;
  const bodyType     = (t.body_type       as string | null) ?? null;
  const comment      = (t.comment         as string | null) ?? null;
  const grad         = GRADS[numId % GRADS.length];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── ヘッダー ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
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

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-4">

        {/* 戻るボタン */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* ─── プロフィールカード ─── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">

          {/* ヒーロー画像 / グラデーション */}
          <div className={`relative h-44 bg-gradient-to-br ${grad} flex items-center justify-center`}>
            {profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileImage}
                alt={name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-white/30 flex items-center justify-center text-white font-black text-5xl">
                {name.charAt(0)}
              </div>
            )}
          </div>

          {/* 情報エリア */}
          <div className="p-5 space-y-3">
            <div>
              <h1 className="text-2xl font-black text-slate-900">{name}</h1>
              {salonName && salonId && (
                <Link
                  href={`/salon/${salonId}`}
                  className="inline-flex items-center gap-1 text-sm text-pink-600 hover:text-pink-700 font-medium mt-0.5"
                >
                  {salonName}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              )}
            </div>

            {/* メタバッジ */}
            {(formatAge(age) || bodyType) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {formatAge(age) && <span className="bg-pink-50 text-pink-600 border border-pink-100 px-3 py-1 rounded-full font-bold">{formatAge(age)}</span>}
                {bodyType      && <span className="bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 rounded-full font-medium">{bodyType}</span>}
              </div>
            )}

            {/* 出勤バッジ */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${dutyBadge.cls}`}>
                {dutyBadge.label}
              </span>
              {todayHours && (
                <span className="text-xs text-pink-500 font-medium">🕒 {todayHours}</span>
              )}
            </div>

            {/* プロフィール文 / コメント */}
            {(profileText || comment) && (
              <p className="text-sm text-slate-600 bg-slate-50/70 rounded-2xl p-4 leading-relaxed">
                {profileText || comment}
              </p>
            )}
          </div>
        </div>

        {/* ─── 7日間スケジュール ─── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-black text-slate-700 mb-3">📅 今週のスケジュール</h2>
          <div className="grid grid-cols-7 gap-1 text-center">
            {dates.map((dateStr, idx) => {
              const s       = schedMap[dateStr];
              const dayLabel = WEEKDAYS[new Date(dateStr + 'T00:00:00').getDay()];
              const active  = !!(s?.is_active && s.start && s.end);
              const hours   = active ? buildHoursStr(s.start, s.end) : '';
              const [startPart, endPart] = hours.split('〜');

              return (
                <div
                  key={dateStr}
                  className={`p-1.5 rounded-xl border flex flex-col justify-between min-h-[64px] ${
                    active
                      ? idx === 0
                        ? 'bg-pink-100/60 border-pink-300 text-pink-700'
                        : 'bg-pink-50/30 border-pink-100 text-pink-600'
                      : 'bg-slate-50 border-slate-100 text-slate-300'
                  }`}
                >
                  <div className={`font-bold text-[10px] pb-0.5 border-b ${active ? 'border-pink-100/60' : 'border-slate-100/60'}`}>
                    {idx === 0 ? '今日' : dayLabel}
                  </div>
                  {active ? (
                    <div className="text-[9px] font-black leading-tight flex flex-col justify-center flex-1 pt-1 tracking-tighter">
                      <span>{startPart}</span>
                      <span className="text-[7px] text-pink-300 -my-0.5">▼</span>
                      <span>{endPart}</span>
                    </div>
                  ) : (
                    <div className="text-[9px] py-2 text-slate-300 flex-1 flex items-center justify-center">休み</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── サロン詳細リンク ─── */}
        {salonId && salonName && (
          <Link
            href={`/salon/${salonId}`}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-sm shadow-md hover:opacity-90 transition-opacity"
          >
            {salonName} の詳細を見る →
          </Link>
        )}

      </main>
    </div>
  );
}
