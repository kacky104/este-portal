// セラピストページの作り方（第1169便・2026-10-04・カッキーさんの指示）。
// ★ マイページの「セラピストページ連携」（今すぐの画面・CastLinkProgress）の見出しの横の「作り方」から開く説明ページ。
// ★ ここはログインだけで開ける（中身は全店同じ）。読み取りは無い。fukuX・コネックエフのご案内と同じ作り＝画像1枚＋下にボタン。
// ★ 本文はカッキーさん作成の画像1枚。★ 第1170便: 画像と alt は lib/castGuide.ts に移した（コネックエフの conecf.com/cast-guide と同じものを出すため）。
//   ★ 画像の「お問い合わせ」は押せないので、下に押せるボタンでも置く（マイページの「運営事務局」）。

import type { Metadata } from 'next';
import Link from 'next/link';
import { CAST_GUIDE_ALT, CAST_GUIDE_IMAGE } from '@/lib/castGuide';

export const metadata: Metadata = { title: 'セラピストページの作り方｜フクエス マイページ' };

export default function CastGuidePage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CAST_GUIDE_IMAGE.src}
          alt={CAST_GUIDE_ALT}
          width={CAST_GUIDE_IMAGE.width}
          height={CAST_GUIDE_IMAGE.height}
          className="block w-full h-auto border border-slate-200 mb-6"
        />

        {/* ★ PC は横並び・スマホは縦並び */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <Link href="/mypage" className="flex-1 text-center py-4 bg-gradient-to-r from-[#b83a6f] to-[#d6558b] text-white text-[17px] font-black shadow-md hover:opacity-95">
            マイページへ戻る
          </Link>
          <Link href="/mypage?tab=support" className="sm:w-56 flex items-center justify-center py-4 border-2 border-[#c8477d] bg-white text-[15px] font-bold text-[#b83a6f] hover:bg-pink-50">
            お問い合わせ
          </Link>
        </div>
      </div>
    </main>
  );
}
