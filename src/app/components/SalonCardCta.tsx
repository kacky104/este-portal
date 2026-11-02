'use client';

import Link from 'next/link';
import { TelNoticeLink } from '@/app/components/TelNoticeLink';
import { LineNoticeLink } from '@/app/components/LineNoticeLink';
import { logSalonAction } from '@/app/lib/logSalonAction';
import { reserveStyle, phoneStyle, lineStyle, calendarIcon, phoneIcon, lineIcon } from '@/app/salon/[id]/SalonCtaBar';

// ★ 第1718便: 店舗カード（TOP・地域）の予約ボタン行（ネット予約／電話をする／LINE予約）。
//   置き場所はタブ（写メ日記・新人・クーポン…）の上。登録済みのものだけ並べる：
//   ・ネット予約 … 予約受付ON＋有効な予約コースあり（salon.bookable）。使っていない店は出さない＝残りのボタンが横に伸びる
//   ・電話をする … 電話番号あり（ポップアップ「フクエスを見た」→発信は店舗詳細と同じ TelNoticeLink）。
//                 ★ PC（lg 以上）では出さない（カッキーさん 11/2）。電話しか無い店は PC では行ごと出さない
//   ・LINE予約   … URL あり（空・'#' は出さない）。★ 第1720便: 電話と同じく「フクエスを見た」のポップアップを挟む（LineNoticeLink）
//   1つも無ければ行ごと出さない。配色・アイコンは店舗詳細の SalonCtaBar と共通。
//   計測（logSalonAction）は店舗詳細と同じ RPC（同一セッション内の同じ店舗×同じアクションは1回）。
//   カード全体の onClick（router.push）とは、行の div で stopPropagation して二重遷移を防ぐ
//   （電話のポップアップは createPortal だが React のイベントはツリーを辿って上がるので、これで一緒に止まる）。
export function SalonCardCta({ salonId, phone, lineUrl, bookable }: { salonId: number; phone: string | null; lineUrl: string | null; bookable: boolean }) {
  const showBook = bookable;
  const showTel = Boolean(phone);
  const showLine = Boolean(lineUrl);
  if (!showBook && !showTel && !showLine) return null;

  const btn = 'flex-1 min-w-0 inline-flex items-center justify-center gap-1 rounded-lg px-1 py-2 text-[12px] font-bold whitespace-nowrap shadow-sm transition-all';

  // PC で出すものが電話だけなら、行ごと lg で隠す（空の余白を残さない）
  const onlyTel = showTel && !showBook && !showLine;

  return (
    <div className={`flex items-stretch gap-1.5 pb-2${onlyTel ? ' lg:hidden' : ''}`} onClick={(e) => e.stopPropagation()}>
      {showBook && (
        <Link href={`/salon/${salonId}/book`} onClick={() => logSalonAction(salonId, 'book')} className={`${btn} text-white hover:brightness-105`} style={reserveStyle}>
          {calendarIcon}ネット予約
        </Link>
      )}
      {showTel && (
        <TelNoticeLink phone={phone!} onCall={() => logSalonAction(salonId, 'tel')} className={`${btn} lg:hidden bg-white hover:bg-pink-50`} style={phoneStyle}>
          {phoneIcon}電話をする
        </TelNoticeLink>
      )}
      {showLine && (
        <LineNoticeLink href={lineUrl!} onOpen={() => logSalonAction(salonId, 'line')} className={`${btn} text-white hover:brightness-105`} style={lineStyle}>
          {lineIcon}LINE予約
        </LineNoticeLink>
      )}
    </div>
  );
}
