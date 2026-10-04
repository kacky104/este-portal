'use client';

import Link from 'next/link';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { CAST_GUIDE_ALT, CAST_GUIDE_IMAGE } from '@/lib/castGuide';

// コネックエフ「セラピストページの作り方」（第1170便・2026-10-04・カッキーさん）。★ conecf.com/cast-guide。
// ★ ホームの「セラピストページ連携」（CastLinkProgress）の見出しの横の「作り方」から開く。
// ★ 中身はマイページの /mypage/cast-guide と同じ画像1枚（lib/castGuide.ts）。読み取りは無い（外枠の ConecfShell が今までどおり契約を見るだけ）。
// ★ サイドバーの印は「はじめての方へ」（ご案内の仲間）。サイドバーには項目を足していない。

export default function ConecfCastGuidePage() {
  const href = useConecfHref();
  return (
    <ConecfShell current="guide" title="セラピストページの作り方">
      {() => (
        <div className="max-w-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CAST_GUIDE_IMAGE.src}
            alt={CAST_GUIDE_ALT}
            width={CAST_GUIDE_IMAGE.width}
            height={CAST_GUIDE_IMAGE.height}
            className="block w-full h-auto border border-slate-200 mb-5"
          />
          <div className="flex flex-col sm:flex-row gap-3 pb-6">
            <Link href={href('/')} className="flex-1 text-center py-4 bg-gradient-to-r from-[#b83a6f] to-[#d6558b] text-white text-[17px] font-black shadow-md hover:opacity-95">
              ホームへ戻る
            </Link>
            <Link href={href('/girls')} className="sm:w-56 flex items-center justify-center py-4 border-2 border-[#c8477d] bg-white text-[15px] font-bold text-[#b83a6f] hover:bg-pink-50">
              セラピスト一覧へ
            </Link>
          </div>
        </div>
      )}
    </ConecfShell>
  );
}
