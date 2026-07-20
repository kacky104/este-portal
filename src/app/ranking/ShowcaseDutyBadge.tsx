'use client';

import { useEffect, useState } from 'react';
import { deriveTherapistStatusBadge, type StatusBadgeData } from '@/lib/therapistStatusBadge';

// セラピスト1位ショーケースの画像に重ねる出勤バッジ。
// 時刻依存判定のため、他カードと同じくマウント後にクライアント時刻で導出する。
export function ShowcaseDutyBadge({
  isAvailableNow,
  availableUntil,
  isAvailableNowCast,
  availableUntilCast,
  todayIsActive,
  todayStart,
  todayEnd,
}: {
  isAvailableNow: boolean;
  availableUntil: string | null;
  isAvailableNowCast: boolean;
  availableUntilCast: string | null;
  todayIsActive: boolean;
  todayStart: string | null;
  todayEnd: string | null;
}) {
  const [badge, setBadge] = useState<StatusBadgeData | null>(null);
  useEffect(() => {
    setBadge(
      deriveTherapistStatusBadge({
        ownerOn: isAvailableNow,
        ownerUntil: availableUntil,
        castOn: isAvailableNowCast,
        castUntil: availableUntilCast,
        todayIsActive,
        todayStart,
        todayEnd,
        now: new Date(),
      }),
    );
  }, [isAvailableNow, availableUntil, isAvailableNowCast, availableUntilCast, todayIsActive, todayStart, todayEnd]);

  if (!badge) return null;
  return (
    <span
      className={`absolute top-2 right-2 z-10 text-[10px] font-bold leading-none px-2 py-1 rounded-full shadow ${badge.blink ? 'animate-pulse' : ''}`}
      style={{ background: badge.bg, color: badge.color }}
    >
      {badge.label}
    </span>
  );
}
