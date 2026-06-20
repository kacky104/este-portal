'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SalonTheme } from '@/app/lib/themes';
import { isNewFaceActive } from '@/lib/newFace';
import { formatBodySizes } from '@/lib/bodyType';
import { getScheduleWindowStatus } from '@/lib/dutyStatus';
import { NewBadge } from '@/components/NewBadge';

export type DaySchedule = {
  id:             string;
  name:           string;
  age:            string | null;
  imageUrl:       string | null;
  startTime:      string;   // "HH:MM"
  endTime:        string;   // "HH:MM"
  isAvailableNow: boolean;
  availableUntil: string | null;
  isNewFace:      boolean;
  newFaceSince:   string | null;
  bodyType:       string | null;
  hasDiary:       boolean;
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 2026年 日本の祝日（振替休日・国民の休日を含む）
const HOLIDAYS_2026 = new Set([
  '2026-01-01', // 元日
  '2026-01-12', // 成人の日
  '2026-02-11', // 建国記念の日
  '2026-02-23', // 天皇誕生日
  '2026-03-20', // 春分の日
  '2026-04-29', // 昭和の日
  '2026-05-03', // 憲法記念日
  '2026-05-04', // みどりの日
  '2026-05-05', // こどもの日
  '2026-05-06', // 振替休日（5/3が日曜のため）
  '2026-07-20', // 海の日
  '2026-08-11', // 山の日
  '2026-09-21', // 敬老の日
  '2026-09-22', // 国民の休日
  '2026-09-23', // 秋分の日
  '2026-10-12', // スポーツの日
  '2026-11-03', // 文化の日
  '2026-11-23', // 勤労感謝の日
]);

function dateParts(dateStr: string): { md: string; wd: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WEEKDAYS[d.getDay()] };
}

// 曜日・祝日に応じた文字色（日曜・祝日=赤、土曜=青、平日=null＝デフォルト）
function dayColor(dateStr: string): string | null {
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  if (dow === 0 || HOLIDAYS_2026.has(dateStr)) return '#dc2626';
  if (dow === 6) return '#2563eb';
  return null;
}

function displayHours(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const overnight = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0));
  return `${start}〜${overnight ? '翌' : ''}${end}`;
}

// 出勤ステータスのバッジ表示（本日のみライブ判定。未来日は一律「出勤予定」）
function statusBadge(t: DaySchedule, isToday: boolean): { label: string; cls: string } {
  const status = isToday ? getScheduleWindowStatus(t.startTime, t.endTime) : 'before';
  switch (status) {
    case 'onDuty': return { label: '出勤中',       cls: 'bg-emerald-50 text-emerald-600 animate-pulse' };
    case 'after':  return { label: '受付終了',     cls: 'bg-rose-50 text-rose-400' };
    default:       return { label: '出勤予定',     cls: 'bg-slate-100 text-slate-500' };
  }
}

function TherapistCard({ t, isToday }: { t: DaySchedule; isToday: boolean }) {
  const router = useRouter();
  const availableNow =
    t.isAvailableNow && t.availableUntil != null && new Date(t.availableUntil) > new Date();
  const isNew = isNewFaceActive(t.isNewFace, t.newFaceSince);
  const badge = statusBadge(t, isToday);
  const bodySizes = formatBodySizes(t.bodyType);
  // 出勤中バッジと同一条件（本日タブの onDuty のみ）。出勤中カードの外枠を緑キラリ。
  const working = isToday && getScheduleWindowStatus(t.startTime, t.endTime) === 'onDuty';

  return (
    <Link
      href={`/therapist/${t.id}?from=schedule`}
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm flex h-28 overflow-hidden hover:shadow-md transition-all duration-200${working ? ' therapist-working-shimmer' : ''}`}
    >
      <div className="relative w-28 flex-shrink-0 overflow-hidden bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center">
        {t.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.imageUrl} alt={t.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-white/70 font-bold text-2xl">{t.name.charAt(0)}</span>
        )}
        {/* 今すぐバッジ（写真右上オーバーレイ）。表示条件は従来どおり今すぐフラグの子のみ。 */}
        {availableNow && (
          <span className="absolute top-1.5 right-1.5 z-10" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
            今すぐ
          </span>
        )}
        {/* NEWバッジ（写真左下オーバーレイ）。表示条件は従来どおり新規30日以内の子のみ。 */}
        {isNew && <NewBadge className="absolute bottom-1.5 left-1.5 z-10" />}
      </div>
      <div className="p-3 flex-1 flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <p className="font-bold text-sm truncate min-w-0 text-slate-900">{t.name}</p>
          {t.age && <span className="text-[11px] text-slate-500 flex-shrink-0">({t.age})</span>}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        {bodySizes && (
          <p className="text-slate-500 mb-0.5 md:whitespace-nowrap md:overflow-hidden md:text-ellipsis" style={{ fontSize: '12px' }}>{bodySizes}</p>
        )}
        <p className="text-xs font-medium text-pink-600">🕒 {displayHours(t.startTime, t.endTime)}</p>
        {/* 写メ日記バッジ（日記が1件以上ある子のみ）。カード全体は /therapist/[id] へのリンクのため、
            ここは preventDefault + stopPropagation で日記一覧ページへ遷移させる。 */}
        {t.hasDiary && (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/therapist/${t.id}/diary`); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); router.push(`/therapist/${t.id}/diary`); } }}
            className="inline-flex items-center gap-1 mt-1 rounded-md border border-pink-500 text-pink-600 font-bold hover:bg-pink-50 transition-colors cursor-pointer self-start"
            style={{ fontSize: '11px', padding: '3px 9px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            写メ日記
          </span>
        )}
      </div>
    </Link>
  );
}

export function WeeklySchedule({
  dates,
  byDate,
  theme,
}: {
  dates: string[];
  byDate: Record<string, DaySchedule[]>;
  theme: SalonTheme;
}) {
  const [selected, setSelected] = useState(dates[0]);
  const list = byDate[selected] ?? [];
  const isToday = selected === dates[0];

  return (
    <div>
      {/* 日付アイコン（7日分を画面幅に均等分割） */}
      <div className="flex gap-1 pb-2 mb-5">
        {dates.map((d) => {
          const { md, wd } = dateParts(d);
          const active = d === selected;
          // 選択中（ピンク背景）は白文字を優先。それ以外は土日祝の色を適用。
          const textColor = active ? undefined : dayColor(d) ?? undefined;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelected(d)}
              className="flex-1 min-w-0 px-0.5 py-2 rounded-2xl border flex flex-col items-center gap-0.5 transition-colors"
              style={
                active
                  ? { backgroundColor: '#ec4899', borderColor: '#ec4899', color: '#ffffff' }
                  : { backgroundColor: theme.card, borderColor: theme.cardBorder, color: theme.body }
              }
            >
              <span className="text-xs sm:text-sm font-bold leading-none" style={{ color: textColor }}>{md}</span>
              <span className="text-[11px] leading-none" style={{ color: textColor }}>{wd}</span>
            </button>
          );
        })}
      </div>

      {/* 選択日のセラピストカード */}
      {list.length === 0 ? (
        <p className="text-center text-sm py-10 rounded-2xl border border-dashed" style={{ color: theme.body, borderColor: theme.cardBorder }}>
          この日の出勤予定はありません
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((t) => (
            <TherapistCard key={t.id} t={t} isToday={isToday} />
          ))}
        </div>
      )}
    </div>
  );
}
