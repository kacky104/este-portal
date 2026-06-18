'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SalonTheme } from '@/app/lib/themes';
import { isNewFaceActive } from '@/lib/newFace';
import { NewBadge } from '@/components/NewBadge';

export type DaySchedule = {
  id:             string;
  name:           string;
  imageUrl:       string | null;
  startTime:      string;   // "HH:MM"
  endTime:        string;   // "HH:MM"
  isAvailableNow: boolean;
  availableUntil: string | null;
  isNewFace:      boolean;
  newFaceSince:   string | null;
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function dateParts(dateStr: string): { md: string; wd: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WEEKDAYS[d.getDay()] };
}

function displayHours(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const overnight = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0));
  return `${start}〜${overnight ? '翌' : ''}${end}`;
}

function TherapistCard({ t, theme }: { t: DaySchedule; theme: SalonTheme }) {
  const availableNow =
    t.isAvailableNow && t.availableUntil != null && new Date(t.availableUntil) > new Date();
  const isNew = isNewFaceActive(t.isNewFace, t.newFaceSince);

  return (
    <Link
      href={`/therapist/${t.id}`}
      className="rounded-2xl border shadow-sm flex h-28 overflow-hidden hover:shadow-md transition-all duration-200"
      style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
    >
      <div className="relative w-28 flex-shrink-0 overflow-hidden bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center">
        {t.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.imageUrl} alt={t.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-white/70 font-bold text-2xl">{t.name.charAt(0)}</span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <p className="font-bold text-sm truncate min-w-0" style={{ color: theme.heading }}>{t.name}</p>
          {isNew && <NewBadge />}
          {availableNow && (
            <span style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
              今すぐ
            </span>
          )}
        </div>
        <p className="text-xs font-medium text-pink-600">🕒 {displayHours(t.startTime, t.endTime)}</p>
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

  return (
    <div>
      {/* 日付アイコン（横並び） */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' }}>
        {dates.map((d) => {
          const { md, wd } = dateParts(d);
          const active = d === selected;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelected(d)}
              className="flex-shrink-0 w-14 py-2 rounded-2xl border flex flex-col items-center gap-0.5 transition-colors"
              style={
                active
                  ? { backgroundColor: '#ec4899', borderColor: '#ec4899', color: '#ffffff' }
                  : { backgroundColor: theme.card, borderColor: theme.cardBorder, color: theme.body }
              }
            >
              <span className="text-sm font-bold leading-none">{md}</span>
              <span className="text-[11px] leading-none">{wd}</span>
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
            <TherapistCard key={t.id} t={t} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}
