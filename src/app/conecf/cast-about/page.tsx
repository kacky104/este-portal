'use client';

import Link from 'next/link';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { CastAboutArticle } from '@/app/components/CastAboutArticle';

// コネックエフ「セラピストページとは」（第1679便・2026-10-28・カッキーさん）。★ conecf.com/cast-about。
// ★ ホームの「セラピストページ連携」（CastLinkProgress）の見出しの横「セラピストページとは」から開く（マイページの /mypage/cast-about と同じ本文）。
// ★ 本文は CastAboutArticle（共通）。違うのは「コネックエフで管理」「セラピスト一覧で QR」の2か所。読み取りは無い。

export default function ConecfCastAboutPage() {
  const href = useConecfHref();
  return (
    <ConecfShell current="guide" title="セラピストページとは">
      {() => (
        <div className="max-w-3xl">
          <CastAboutArticle manageAt="コネックエフ" qrAt="コネックエフの「セラピスト一覧」" />
          <div className="flex flex-col sm:flex-row gap-3 pb-6">
            <Link href={href('/cast-guide')} className="flex-1 text-center py-4 bg-gradient-to-r from-[#b83a6f] to-[#d6558b] text-white text-[17px] font-black shadow-md hover:opacity-95">
              作り方を見る →
            </Link>
            <Link href={href('/')} className="sm:w-56 flex items-center justify-center py-4 border-2 border-[#c8477d] bg-white text-[15px] font-bold text-[#b83a6f] hover:bg-pink-50">
              ホームへ戻る
            </Link>
          </div>
        </div>
      )}
    </ConecfShell>
  );
}
