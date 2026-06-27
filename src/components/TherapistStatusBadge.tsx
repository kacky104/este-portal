'use client';

import { useEffect, useState } from 'react';
import { deriveTherapistStatusBadge, type StatusBadgeData } from '@/lib/therapistStatusBadge';

// セラピストプロフィールの名前隣ステータスバッジ（PC・スマホ共通で使う唯一の実装）。
// 今すぐの有効期限（available_until）判定はマウント時の現在時刻で行い、ISRキャッシュへの焼き付きを避ける
// （ImasuguCountBadge / ImasuguList と同じ既定パターン）。サーバー初期描画は initial を出し、
// クライアント初期描画も同じ initial を出すためハイドレーション不一致は起きない。マウント後に再判定する。
export function TherapistStatusBadge({
  ownerOn,
  ownerUntil,
  castOn,
  castUntil,
  todayIsActive,
  todayStart,
  todayEnd,
  initial,
}: {
  ownerOn: boolean;
  ownerUntil: string | null;
  castOn: boolean;
  castUntil: string | null;
  todayIsActive: boolean;
  todayStart: string | null;
  todayEnd: string | null;
  initial: StatusBadgeData;
}) {
  const [data, setData] = useState<StatusBadgeData>(initial);

  useEffect(() => {
    const recompute = () =>
      setData(
        deriveTherapistStatusBadge({
          ownerOn, ownerUntil, castOn, castUntil,
          todayIsActive, todayStart, todayEnd,
          now: new Date(),
        }),
      );
    recompute();
    // 今すぐ失効・出勤窓の切り替わりに追従するため1分ごとに再評価。
    const id = window.setInterval(recompute, 60 * 1000);
    return () => window.clearInterval(id);
  }, [ownerOn, ownerUntil, castOn, castUntil, todayIsActive, todayStart, todayEnd]);

  return (
    <span
      className={`inline-flex items-center rounded-full text-[11px] font-bold px-2.5 py-0.5 whitespace-nowrap ${data.blink ? 'animate-pulse' : ''}`}
      style={{ background: data.bg, color: data.color, boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}
    >
      {data.label}
    </span>
  );
}
