'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { formatDiaryAge, formatDiaryDate } from '@/lib/diaryDate';

// ★ 第1091便（2026-10-02・カッキーさん）: 写メ日記の投稿日。
//   投稿から24時間以内は「◯分前」「◯時間前」（1分未満は「たった今」）、それ以降は日付（06/25）。
//   ★ サーバーの HTML（ISR）には必ず日付を出す。「◯分前」を焼き付けると、キャッシュの間ずっと同じ数字になるため。
//     ブラウザで組み上がったあとに今の時刻で言い換える（DiaryNewBadge と同じ考え方・不一致は起きない）。
//   ★ 「今」は1分きざみで、全カード共通の時計1本（setInterval を1つだけ）から受け取る。
//     裏に回っていたタブへ戻ったときも、その場で読み直す。
//   fallback: 24時間を過ぎたときに出す文字（省くと formatDiaryDate の「06/25」）。
const listeners = new Set<() => void>();
let timer: number | undefined;

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (timer === undefined) {
    timer = window.setInterval(notify, 60_000);
    document.addEventListener('visibilitychange', notify);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', notify);
      timer = undefined;
    }
  };
}

// 今の時刻（分）。同じ1分のあいだは同じ値を返す。サーバーとハイドレーション中は 0＝「まだ分からない」。
const getNowMin = () => Math.floor(Date.now() / 60_000);
const getServerNowMin = () => 0;

export function DiaryDate({ iso, fallback, className, style }: {
  iso: string;
  fallback?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const nowMin = useSyncExternalStore(subscribe, getNowMin, getServerNowMin);
  const age = nowMin > 0 ? formatDiaryAge(iso, nowMin * 60_000) : null;
  const text = age ?? fallback ?? formatDiaryDate(iso);
  if (className || style) return <span className={className} style={style}>{text}</span>;
  return <>{text}</>;
}
