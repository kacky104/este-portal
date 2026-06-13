'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { THERAPISTS, type Therapist } from '@/data/therapists';

const AVATAR_GRADIENTS = ['from-pink-300 to-rose-400', 'from-fuchsia-300 to-pink-400'];

function TherapistCard({ therapist }: { therapist: Therapist }) {
  // ブラウザ上の「生の現在時刻」と「判定結果」を画面に生々しく出すための状態
  const [debugInfo, setDebugInfo] = useState({
    currentTimeStr: '取得中...',
    parsedShift: '解析中...',
    finalResult: '判定中...',
    isOnDuty: true // 変わらない原因を探るため、初期値はあえて出勤中にします
  });

  useEffect(() => {
    // 1. ブラウザが認識している「今の日本時間」をそのまま取得
    const options = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
    const jstString = new Intl.DateTimeFormat('ja-JP', options).format(new Date());
    const [currentHour, currentMinute] = jstString.split(':').map(Number);
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    // 2. 文字列のセパレーターをあらゆる文字でスプリット（ハイフン、波線、読点、スペースなど）
    const parts = therapist.workHours.split(/[〜～~~\-—−－\s]+/);

    let isOnDuty = false;
    let parsedShift = '失敗';

    if (parts.length >= 2) {
      const startStr = parts[0].trim();
      const endStr = parts[1].trim();
      parsedShift = `${startStr} と ${endStr}`;

      const [startHour, startMin] = startStr.split(':').map(Number);
      const [endHour, endMin] = endStr.split(':').map(Number);

      const startInMinutes = startHour * 60 + (startMin || 0);
      let endInMinutes = endHour * 60 + (endMin || 0);

      if (endInMinutes < startInMinutes) {
        endInMinutes += 24 * 60;
      }

      isOnDuty = currentTimeInMinutes >= startInMinutes && currentTimeInMinutes <= endInMinutes;
    } else {
      parsedShift = `分割失敗(パーツ数:${parts.length})`;
    }

    setDebugInfo({
      currentTimeStr: `${jstString} (${currentTimeInMinutes}分)`,
      parsedShift: parsedShift,
      finalResult: isOnDuty ? '出勤中と判定！' : '【時間外】と判定！',
      isOnDuty: isOnDuty
    });
  }, [therapist.workHours]);

  return (
    <div className="flex-shrink-0 w-44 rounded-2xl border border-red-300 bg-amber-50 p-2 text-[11px] text-slate-800 shadow-md">
      <p className="font-bold text-pink-600 text-xs">{therapist.name} さん</p>
      <p className="text-slate-500">元データ: 「{therapist.workHours}」</p>

      {/* 🔍 ここが超重要情報です */}
      <div className="mt-2 p-1.5 bg-white rounded border border-amber-200 text-[10px] font-mono leading-tight text-red-600">
        <div>⏰ 日本今ここ: {debugInfo.currentTimeStr}</div>
        <div>🧩 分割結果: {debugInfo.parsedShift}</div>
        <div>🏁 最終結論: <span className="font-bold bg-amber-200 px-1">{debugInfo.finalResult}</span></div>
      </div>

      <div className="mt-2 text-center">
        {debugInfo.isOnDuty ? (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white font-bold">🟢出勤中バッジ</span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-slate-400 text-white font-bold">⚪時間外バッジ</span>
        )}
      </div>
    </div>
  );
}

export function TherapistScroller() {
  const [list, setList] = useState<Therapist[]>([]);

  useEffect(() => {
    // 原因を探すため、一時的に全員を強制表示してログを見ます
    setList(THERAPISTS);
  }, []);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 w-full bg-slate-100 p-2 rounded-xl">
      {list.map((therapist) => (
        <TherapistCard key={therapist.id} therapist={therapist} />
      ))}
    </div>
  );
}
