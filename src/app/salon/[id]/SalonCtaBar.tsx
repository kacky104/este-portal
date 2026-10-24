'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TelNoticeLink } from '@/app/components/TelNoticeLink';
import { logSalonAction } from '@/app/lib/logSalonAction';

// ★ 第1625便: 店舗詳細の追従バナー（画面下）を部品に切り出し。
//   ・店舗詳細（/salon/[id]）… SalonActionButtons から使う。上のボタン行が画面の上へ消えたら出す（shown で制御）。
//   ・サブページ（セラピスト一覧・料金・出勤・口コミ…）… layout.tsx から SalonSubpageCtaBar で常に出す。
//   登録済みのものだけ並べる（電話＝番号あり／LINE＝URLあり・'#' 以外／ネット予約＝予約受付ON＋予約コースあり）。
//   1つも無ければバナー自体を出さない。計測（logSalonAction）・電話のポップアップは上のボタン行と同じ。

export const reserveStyle: React.CSSProperties = { background: 'linear-gradient(to right,#FB923C,#DB2777)' };
export const phoneStyle: React.CSSProperties = { color: '#DB2777', border: '1.5px solid #F4B6CE' };
export const lineStyle: React.CSSProperties = { background: '#06C755' };

export const calendarIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
export const phoneIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
export const lineIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.9-4.3A8.38 8.38 0 0 1 4 12.5 8.5 8.5 0 0 1 12.5 4 8.38 8.38 0 0 1 21 11.5z" />
  </svg>
);

type BarProps = {
  salonId?: number;
  phone?: string | null;
  lineUrl?: string | null;
  /** 内部の予約ページ（/salon/[id]/book）。無ければ reserveUrl を使う */
  bookHref?: string | null;
  reserveUrl?: string | null;
  /** ネット予約を出すか（予約受付ON＋予約コースあり）。未指定は出す */
  bookable?: boolean;
  shown: boolean;
};

export function salonCtaBarCount({ phone, lineUrl, bookHref, reserveUrl, bookable }: Omit<BarProps, 'shown' | 'salonId'>): number {
  const lineRaw = (lineUrl ?? '').trim();
  const barBook = bookable !== false && Boolean(bookHref || reserveUrl);
  const barTel = Boolean(phone);
  const barLine = Boolean(lineRaw) && lineRaw !== '#';
  return (barBook ? 1 : 0) + (barTel ? 1 : 0) + (barLine ? 1 : 0);
}

export function SalonCtaBar({ salonId, phone, lineUrl, bookHref, reserveUrl, bookable, shown }: BarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const lineRaw = (lineUrl ?? '').trim();
  const barBook = bookable !== false && Boolean(bookHref || reserveUrl);
  const barTel = Boolean(phone);
  const barLine = Boolean(lineRaw) && lineRaw !== '#';
  const barCount = (barBook ? 1 : 0) + (barTel ? 1 : 0) + (barLine ? 1 : 0);

  // バナーの高さを CSS 変数に出す（左下ポップアップ画像をその分だけ上げる）。
  // ページ最下部のフッターが隠れないよう、body の下に同じ高さの余白も足す。
  useEffect(() => {
    if (barCount === 0) return;
    const root = document.documentElement;
    const h = barRef.current?.offsetHeight ?? 0;
    const prevPad = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${h}px`;
    root.style.setProperty('--salon-cta-bar-h', shown ? `${h}px` : '0px');
    return () => {
      document.body.style.paddingBottom = prevPad;
      root.style.removeProperty('--salon-cta-bar-h');
    };
  }, [shown, barCount]);

  if (barCount === 0) return null;

  const barBtn = 'flex-1 min-w-0 inline-flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-bold whitespace-nowrap transition-all';

  return (
    <div
      ref={barRef}
      aria-hidden={!shown}
      className={`fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-pink-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-[opacity,transform] duration-200 ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
      }`}
    >
      <div className="mx-auto max-w-md flex items-stretch gap-2">
        {barBook && (bookHref ? (
          <Link href={bookHref} tabIndex={shown ? 0 : -1} onClick={() => logSalonAction(salonId, 'book')} className={`${barBtn} text-white hover:brightness-105`} style={reserveStyle}>
            {calendarIcon}ネット予約
          </Link>
        ) : (
          <a href={reserveUrl!} tabIndex={shown ? 0 : -1} onClick={() => logSalonAction(salonId, 'book')} target="_blank" rel="noopener noreferrer" className={`${barBtn} text-white hover:brightness-105`} style={reserveStyle}>
            {calendarIcon}ネット予約
          </a>
        ))}
        {barTel && (
          <TelNoticeLink phone={phone!} onCall={() => logSalonAction(salonId, 'tel')} className={`${barBtn} bg-white hover:bg-pink-50`} style={phoneStyle}>
            {phoneIcon}電話をする
          </TelNoticeLink>
        )}
        {barLine && (
          <a href={lineRaw} tabIndex={shown ? 0 : -1} onClick={() => logSalonAction(salonId, 'line')} target="_blank" rel="noopener noreferrer" className={`${barBtn} text-white hover:brightness-105`} style={lineStyle}>
            {lineIcon}LINE予約
          </a>
        )}
      </div>
    </div>
  );
}

// サブページ用（layout.tsx から呼ぶ）。最初から出しておく。
// ・店舗詳細そのもの（/salon/[id]）… SalonActionButtons 側が出すので、ここでは出さない（二重防止）
// ・ネット予約（/book）・口コミ投稿（/review/...）… 入力フォームのページなので出さない
export function SalonSubpageCtaBar({ salonId, phone, lineUrl, bookable }: { salonId: number; phone: string | null; lineUrl: string | null; bookable: boolean }) {
  const pathname = usePathname() ?? '';
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const base = `/salon/${salonId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/+$/, '') : '';
  const hide = rest === '' || rest.startsWith('/book') || rest.startsWith('/review/');
  if (hide) return null;
  return (
    <SalonCtaBar
      salonId={salonId}
      phone={phone}
      lineUrl={lineUrl}
      bookHref={`/salon/${salonId}/book`}
      bookable={bookable}
      shown={mounted}
    />
  );
}
