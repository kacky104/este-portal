// セラピストページとは（第1666便・2026-10-26・カッキーさんの指示）。
// ★ 店舗オーナー様向け。「作り方」（/mypage/cast-guide・画像1枚）の前に読む「そもそも何か」のページ。
// ★ マイページの「セラピストページ連携」（今すぐの画面・CastLinkProgress）の見出しの横「セラピストページとは」から開く。
// ★ ログインだけで開ける（中身は全店同じ）。読み取りは無い。色は作り方ページにそろえる（ピンク）。
// ★ 書いてある中身の正本：
//   - 今すぐの受付時間 … src/lib/imasugu.ts IMASUGU_WINDOW_MIN（45分）
//   - ランキングの加点 … src/lib/rankingPoints.ts（セラピスト +5／お店のおすすめランキングは連携率÷2）
//   - スケジュールのタブ … src/app/actions/castSchedule.ts isCastScheduleEnabled（CRM でお店が出しているときだけ）
//   - 記録帳はお店・運営に見えない … src/app/cast/CastCustomers.tsx
//   どれかを変えたら、ここの文言も直すこと。

import type { Metadata } from 'next';
import Link from 'next/link';
import { CastAboutArticle } from '@/app/components/CastAboutArticle';

export const metadata: Metadata = { title: 'セラピストページとは｜フクエス マイページ' };

export default function CastAboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* ★ 第1679便: 本文は CastAboutArticle（コネックエフと共通） */}
        <CastAboutArticle manageAt="お店のマイページ" qrAt="マイページの「セラピスト」" />

        {/* ★ PC は横並び・スマホは縦並び（作り方ページと同じ並び） */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <Link href="/mypage/cast-guide" className="flex-1 text-center py-4 bg-gradient-to-r from-[#b83a6f] to-[#d6558b] text-white text-[17px] font-black shadow-md hover:opacity-95">
            作り方を見る →
          </Link>
          <Link href="/mypage" className="sm:w-56 flex items-center justify-center py-4 border-2 border-[#c8477d] bg-white text-[15px] font-bold text-[#b83a6f] hover:bg-pink-50">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
