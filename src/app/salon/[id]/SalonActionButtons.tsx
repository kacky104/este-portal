'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SaveButton } from '@/app/components/SaveButton';
import { TelNoticeLink } from '@/app/components/TelNoticeLink';
import { logSalonAction } from '@/app/lib/logSalonAction';

// サロン詳細ページの主要アクション（ネット予約／電話をする）。
//
// 送客アクションの計測（2026-08-06）:
//   3ボタンのクリックを increment_salon_action RPC で店舗別に記録する（/admin で集計を見る）。
//   計測のためにクライアントコンポーネント化したが、props は全て serializable なので
//   サーバー側（salon/[id]/page.tsx）からの呼び出し方は従来のまま。
//   ・電話 … ポップアップの「電話をかける」を押した瞬間（開いただけでは数えない）
//   ・LINE … LINE予約ボタンのクリック（'#' の無効プレビューは数えない）
//   ・予約 … ネット予約ボタンのクリック（予約完了ではなく予約ページへの遷移）
//   同一セッション内の同じ店舗×同じアクションは1回だけ（logSalonAction 側で制御）。
//
//  - ネット予約ボタンは常時表示。salonId があれば /salon/[id]/book への内部リンクにする
//    （受付可否＝booking_enabled＋コース有無は book ページ側で判定・案内する）。
//  - reserveUrl : 外部ネット予約URL（将来用）。salonId 未指定時のフォールバック。
//                 指定時は <a href> で外部予約ページへ（target=_blank）。
//  - phone      : 電話番号。指定時は tel: リンク（スマホは発信／PCも tel: で対応）。
//                 未設定のときは無効プレビュー表示。
//
// salonId / salonName を渡すと、右端にサロン保存ボタン（SaveButton paw）を表示する。
// 保存状態は SaveButton 側が localStorage で自己完結管理するため、ここでの初期状態取得は不要。
export function SalonActionButtons({
  reserveUrl,
  phone,
  lineUrl,
  salonId,
  salonName,
  bookable,
}: {
  reserveUrl?: string | null;
  phone?: string | null;
  lineUrl?: string | null;
  salonId?: number;
  salonName?: string;
  /** 追従バナーにネット予約を出すか（予約受付ON＋予約コースあり）。未指定は従来どおり出す。 */
  bookable?: boolean;
}) {
  const base =
    'flex-1 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1.5 sm:px-4 py-3.5 text-xs sm:text-sm font-bold shadow-sm whitespace-nowrap transition-all';

  // 主CTA＝ネット予約（ブランドグラデ：オレンジ→マゼンタ）。
  const reserveStyle: React.CSSProperties = { background: 'linear-gradient(to right,#FB923C,#DB2777)' };
  // 副CTA＝電話をする（白地＋ブランド枠の従ボタン）。
  const phoneStyle: React.CSSProperties = { color: '#DB2777', border: '1.5px solid #F4B6CE' };
  // LINE予約＝LINEブランドの緑（#06C755）。line_url が '#' のときは表示のみ・クリック不可。
  const lineStyle: React.CSSProperties = { background: '#06C755' };

  const calendarIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
  const phoneIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
  const lineIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.9-4.3A8.38 8.38 0 0 1 4 12.5 8.5 8.5 0 0 1 12.5 4 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );

  // LINE予約：空欄は非表示・'#' は表示するがクリック不可・URLはクリックで新規タブ。
  const lineRaw = (lineUrl ?? '').trim();
  const lineDisabled = lineRaw === '#';

  // ネット予約の遷移先：salonId があれば常に内部の予約ページへ（受付可否は book 側で判定）。
  // salonId 無し時のみ外部 reserveUrl をフォールバックに使う。
  const bookHref = salonId != null ? `/salon/${salonId}/book` : null;

  // ── 追従バナー（画面下）：上の3ボタン行が画面の上へ消えたら出す ──
  // 登録済みのものだけ並べる（電話＝番号あり／LINE＝URLあり・'#' 以外／ネット予約＝予約受付ON＋予約コースあり）。
  const rowRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [barShown, setBarShown] = useState(false);
  const barBook = bookable !== false && Boolean(bookHref || reserveUrl);
  const barTel = Boolean(phone);
  const barLine = Boolean(lineRaw) && !lineDisabled;
  const barCount = (barBook ? 1 : 0) + (barTel ? 1 : 0) + (barLine ? 1 : 0);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || barCount === 0) return;
    const io = new IntersectionObserver(
      ([e]) => setBarShown(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [barCount]);

  // バナーの高さを CSS 変数に出す（左下ポップアップ画像をその分だけ上げる）。
  // ページ最下部のフッターが隠れないよう、body の下に同じ高さの余白も足す。
  useEffect(() => {
    if (barCount === 0) return;
    const root = document.documentElement;
    const h = barRef.current?.offsetHeight ?? 0;
    const prevPad = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${h}px`;
    root.style.setProperty('--salon-cta-bar-h', barShown ? `${h}px` : '0px');
    return () => {
      document.body.style.paddingBottom = prevPad;
      root.style.removeProperty('--salon-cta-bar-h');
    };
  }, [barShown, barCount]);

  const barBtn = 'flex-1 min-w-0 inline-flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-bold whitespace-nowrap transition-all';

  return (
    <div className="mb-4">
      <div ref={rowRef} className="flex items-stretch gap-1.5 sm:gap-3">
        {/* ── ネット予約（主CTA） ── */}
        {bookHref ? (
          <Link href={bookHref} onClick={() => logSalonAction(salonId, 'book')} className={`${base} text-white hover:brightness-105`} style={reserveStyle}>
            {calendarIcon}ネット予約
          </Link>
        ) : reserveUrl ? (
          <a href={reserveUrl} onClick={() => logSalonAction(salonId, 'book')} target="_blank" rel="noopener noreferrer" className={`${base} text-white hover:brightness-105`} style={reserveStyle}>
            {calendarIcon}ネット予約
          </a>
        ) : (
          // 予約受付OFFかつ外部URL未設定：無効プレビュー（押下しても何も起きない）。
          <button type="button" aria-disabled="true" className={`${base} text-white cursor-default`} style={reserveStyle}>
            {calendarIcon}ネット予約
          </button>
        )}

        {/* ── 電話をする（副CTA） ── */}
        {phone ? (
          // タップで「フクエスを見た」ポップアップ→発信（tel: 直リンクをやめて文言を挟む）。
          <TelNoticeLink phone={phone} onCall={() => logSalonAction(salonId, 'tel')} className={`${base} bg-white hover:bg-pink-50`} style={phoneStyle}>
            {phoneIcon}電話をする
          </TelNoticeLink>
        ) : (
          // phone 未設定：今は無効。データ接続後は tel: の番号を差し込むだけ。
          <button type="button" aria-disabled="true" className={`${base} bg-white cursor-default`} style={phoneStyle}>
            {phoneIcon}電話をする
          </button>
        )}

        {/* ── LINE予約（空欄は非表示・'#' はクリック不可・URLは新規タブ） ── */}
        {lineRaw && (
          lineDisabled ? (
            <button type="button" aria-disabled="true" className={`${base} text-white cursor-default`} style={lineStyle}>
              {lineIcon}LINE予約
            </button>
          ) : (
            <a href={lineRaw} onClick={() => logSalonAction(salonId, 'line')} target="_blank" rel="noopener noreferrer" className={`${base} text-white hover:brightness-105`} style={lineStyle}>
              {lineIcon}LINE予約
            </a>
          )
        )}

        {/* ── サロン保存ボタン（右端・既存 SaveButton paw を流用。状態は SaveButton 側で自己完結） ── */}
        {salonId != null && (
          <span className="flex-shrink-0 inline-flex items-center">
            <SaveButton kind="salon" item={{ id: salonId, name: salonName ?? '' }} variant="paw" />
          </span>
        )}
      </div>

      {/* ── 追従バナー（画面下・上のボタン行がスクロールで消えたら出現） ── */}
      {barCount > 0 && (
        <div
          ref={barRef}
          aria-hidden={!barShown}
          className={`fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-pink-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-[opacity,transform] duration-200 ${
            barShown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
          }`}
        >
          <div className="mx-auto max-w-md flex items-stretch gap-2">
            {barBook && (bookHref ? (
              <Link href={bookHref} tabIndex={barShown ? 0 : -1} onClick={() => logSalonAction(salonId, 'book')} className={`${barBtn} text-white hover:brightness-105`} style={reserveStyle}>
                {calendarIcon}ネット予約
              </Link>
            ) : (
              <a href={reserveUrl!} tabIndex={barShown ? 0 : -1} onClick={() => logSalonAction(salonId, 'book')} target="_blank" rel="noopener noreferrer" className={`${barBtn} text-white hover:brightness-105`} style={reserveStyle}>
                {calendarIcon}ネット予約
              </a>
            ))}
            {barTel && (
              <TelNoticeLink phone={phone!} onCall={() => logSalonAction(salonId, 'tel')} className={`${barBtn} bg-white hover:bg-pink-50`} style={phoneStyle}>
                {phoneIcon}電話をする
              </TelNoticeLink>
            )}
            {barLine && (
              <a href={lineRaw} tabIndex={barShown ? 0 : -1} onClick={() => logSalonAction(salonId, 'line')} target="_blank" rel="noopener noreferrer" className={`${barBtn} text-white hover:brightness-105`} style={lineStyle}>
                {lineIcon}LINE予約
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
