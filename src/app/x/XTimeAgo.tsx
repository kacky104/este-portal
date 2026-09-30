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

// ★ 第1017便（2026-09-30・カッキーさん）: 投稿カードの右上の日付。
//   今日の投稿＝「◯分前」、1時間を超えたら「◯時間前」。今日でなければ日付（同年「9/30」・年違い「2025/9/30」）。
//   ★ 日付は日本時間で「今日かどうか」を見る。マウント後に現在時刻で算出（hydration 不一致回避）。
function jstYmd(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function postTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const now = Date.now();
  if (jstYmd(t) === jstYmd(now)) {
    const sec = Math.max(0, Math.floor((now - t) / 1000));
    if (sec < 60) return 'たった今';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分前`;
    return `${Math.floor(min / 60)}時間前`;
  }
  const d = new Date(t);
  const sameYear = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(d)
    === new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date(now));
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
}

export function XPostTime({ iso, className }: { iso: string; className?: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(postTime(iso));
    // 今日の投稿は「◯分前」が動くので、1分ごとに更新
    const id = window.setInterval(() => setText(postTime(iso)), 60_000);
    return () => window.clearInterval(id);
  }, [iso]);
  if (!text) return null;
  return <span className={className}>{text}</span>;
}
