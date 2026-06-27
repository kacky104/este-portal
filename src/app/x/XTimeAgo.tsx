'use client';

import { useEffect, useState } from 'react';

// 「◯分前」相対表示。サーバーは created_at(絶対時刻)を渡し、クライアントのマウント時に現在時刻で算出する
// （ISRキャッシュ焼き付き＆ハイドレーション不一致を回避。既存 DiaryNewBadge と同方針）。
function relative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 5) return 'たった今';
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}日前`;
  const d = new Date(t);
  const now = new Date();
  const md = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(d);
  return md;
}

export function XTimeAgo({ iso, className }: { iso: string; className?: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(relative(iso));
  }, [iso]);
  if (!text) return null; // マウント前は何も出さない（不一致回避）
  return <span className={className}>{text}</span>;
}
