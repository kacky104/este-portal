'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { THERAPISTS, type Therapist } from '@/data/therapists';

const AVATAR_GRADIENTS = [
  'from-pink-300 to-rose-400',
  'from-fuchsia-300 to-pink-400',
  'from-rose-300 to-pink-500',
  'from-pink-400 to-fuchsia-400',
  'from-red-300 to-rose-400',
  'from-pink-300 to-pink-500',
  'from-fuchsia-400 to-rose-300',
  'from-rose-300 to-fuchsia-400',
];

const AVATAR_SYMBOLS = ['✿', '❀', '✾', '♡', '✦', '❋', '✽', '❁'];

// 日本時間（JST）で現在出勤中かどうかを判定する関数
function checkDutyStatus(workHours: string): { isOnDuty: boolean; startHourStr: string } {
  if (!workHours || !workHours.includes('〜')) {
    return { isOnDuty: false, startHourStr: '' };
  }

  // Vercel（海外サーバー）でも確実に日本時間を取得する
  const nowJST = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  const currentHour = nowJST.getUTCHours();
  const currentMinute = nowJST.getUTCMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  // 「12:00〜21:00」をバラす
  const [startStr, endStr] = workHours.split('〜');
  const [startHour, startMin] = startStr.trim().split(':').map(Number);
  const [endHour, endMin] = endStr.trim().split(':').map(Number);

  const startInMinutes = startHour * 60 + startMin;
  let endInMinutes = endHour * 60 + endMin;

  // 深夜をまたぐシフト（例：16:00〜02:00）の対応
  if (endInMinutes < startInMinutes) {
    endInMinutes += 24 * 60;
  }

  // 現在時刻がシフト内にあるか判定
  const isOnDuty = currentTimeInMinutes >= startInMinutes && currentTimeInMinutes <= endInMinutes;

  return { isOnDuty, startHourStr: startStr.trim() };
}

function TherapistCard({ therapist, index }: { therapist: Therapist; index: number }) {
  const gradient = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
  const symbol = AVATAR_SYMBOLS[index % AVATAR_SYMBOLS.length];

  // 出勤状態をチェック
  const { isOnDuty, startHourStr } = checkDutyStatus(therapist.workHours);

  return (
    <Link
      href={`/salon/${therapist.salonId}`}
      className="group flex-shrink-0 w-44 rounded-2xl border border-pink-100 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300 overflow-hidden"
    >
      {/* Avatar area */}
      <div className={`relative h-28 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        {/* Decorative soft circle */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/30 flex items-center justify-center">
              <span className="text-white/90 font-bold text-2xl leading-none select-none">
                {therapist.name.charAt(0)}
              </span>
            </div>
          </div>
        </div>
        {/* Decorative symbol */}
        <span className="absolute bottom-2 right-3 text-white/50 text-xl select-none" aria-hidden="true">
          {symbol}
        </span>

        {/* Dynamic Status badge */}
        {isOnDuty ? (
          <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-500 border border-emerald-100 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            出勤中
          </span>
        ) : (
          <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
            {startHourStr}〜
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-bold text-sm text-slate-900 group-hover:text-pink-600 transition-colors mb-0.5">
          {therapist.name}
        </p>
        <p className="text-[10px] text-slate-400 truncate mb-2">{therapist.salonName}</p>

        {/* Work hours */}
        <div className="flex items-center gap-1 mb-2">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pink-400 flex-shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span className="text-[10px] text-pink-500 font-medium">{therapist.workHours}</span>
        </div>

        {/* Comment */}
        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">
          {therapist.comment}
        </p>
      </div>
    </Link>
  );
}

export function TherapistScroller() {
  const [activeTherapists, setActiveTherapists] = useState<Therapist[]>([]);

  // サーバーとクライアントでの時間表示のミスマッチ（Hydration Error）を防ぐための処理
  useEffect(() => {
    // 今まさに出勤している女の子だけに絞り込む
    const filtered = THERAPISTS.filter(t => checkDutyStatus(t.workHours).isOnDuty);
    setActiveTherapists(filtered);
  }, []);

  if (activeTherapists.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/20">
        現在、出勤時間外のセラピストのみです ✿
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink">
      {activeTherapists.map((therapist, i) => (
        <TherapistCard key={therapist.id} therapist={therapist} index={i} />
      ))}
    </div>
  );
}
