'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMyAgreementNotice } from '@/app/actions/listingAgreement';
import { AGREEMENT_TITLE } from '@/lib/listingAgreement';

// マイページ上の「申込書 兼 誓約書のご提出をお願いします」の帯（第1175便・2026-10-04・カッキーさん）。
// ★ まだ提出していない店（一度も出していない・文面が新しくなってまだ出していない）にだけ出す。提出済みの店には何も出ない。
// ★ 押すとサインのページ（/mypage/agreement）へ。マイページは今までどおり使える（止めない）。
// ★ 読み取りはマイページを開いたときに1回（どの画面でも置きっぱなし＝画面を切り替えても読み直さない）。読めなければ出さない。
// ★ 色はお支払いのお願いの帯と同じ黄。横幅・拡大は「運営からのお知らせ」の帯（OpsNoticeBar）と同じ。
export function AgreementNoticeBar({ zoom = 1 }: { zoom?: number }) {
  const [need, setNeed] = useState<'none' | 'new' | 'renew'>('none');
  useEffect(() => {
    let alive = true;
    void getMyAgreementNotice().then((r) => { if (alive) setNeed(r.need); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (need === 'none') return null;
  return (
    <div className="max-w-2xl mx-auto px-4 pt-3" style={zoom === 1 ? undefined : { zoom }}>
      <Link href="/mypage/agreement" className="flex items-center gap-2 border border-amber-300 bg-amber-50 px-3 sm:px-4 py-2 sm:py-2.5 text-amber-900 hover:bg-amber-100">
        <span className="min-w-0 flex-1 text-[13px] sm:text-[15px] font-bold leading-snug">
          {need === 'renew' ? `「${AGREEMENT_TITLE}」の文面が新しくなりました。あらためてご提出をお願いします。` : `「${AGREEMENT_TITLE}」のご提出をお願いします。`}
          <span className="ml-1 font-normal text-amber-800/80">（1〜2分で終わります）</span>
        </span>
        <span className="flex-shrink-0 text-[12px] sm:text-[13px] font-black underline">提出する ›</span>
      </Link>
    </div>
  );
}
