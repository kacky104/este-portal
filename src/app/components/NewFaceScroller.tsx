'use client';

import Link from 'next/link';
// 「出勤中のセラピスト」と同じ Card・同じスクロール体裁を流用（改変しない）。
import { Card, type TherapistItem } from '@/app/components/TherapistScroller';

// トップのサロン一覧30枚目直下に挿入する「新人セラピスト一覧」セクション。
// 「出勤中のセラピスト」と同構造（グラデ縦バー＋タイトル＋右上「一覧を見る →」）＋ TherapistScroller と同じ
// overflow-x-auto / scrollbar-pink のカード横スクロール。データは page.tsx が ISR で取得して props で渡す。
// 0件は呼び出し側（page.tsx）で insertBlocks に積まないため通常ここへは来ないが、念のため空ガードも持つ。
export function NewFaceScroller({ therapists }: { therapists: TherapistItem[] }) {
  if (therapists.length === 0) return null;

  return (
    <div>
      {/* セクション見出し（「出勤中のセラピスト」と同一マークアップ：グラデ縦バー＋タイトル＋右端「一覧を見る →」） */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-3">
          {/* 新人＝NEW（緑）に合わせ、縦バー・見出し文字とも emerald→lime のグラデに（#10B981→#84CC16） */}
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-emerald-500 to-lime-500" />
          <h2
            className="text-xl font-bold"
            style={{
              background: 'linear-gradient(to right, #10B981, #84CC16)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            新人セラピスト一覧
          </h2>
        </div>
        {/* タイトル行の右端に「もっと見る →」（スマホ・PC 共通表示。末尾カードでも導線を確保） */}
        <Link
          href="/therapist/new"
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold flex-shrink-0 whitespace-nowrap"
          style={{
            background: 'linear-gradient(to right, #ec4899, #f97316)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          もっと見る →
        </Link>
      </div>

      {/* カード横スクロール（TherapistScroller と同じ overflow-x-auto ＋ scrollbar-pink） */}
      <div className="flex gap-[3px] sm:gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {therapists.map((t, i) => <Card key={t.id} therapist={t} index={i} showAge />)}

        {/* 末尾：新人一覧ページへの「一覧を見る」カード（出勤中列と同じ体裁） */}
        <Link
          href="/therapist/new"
          className="flex-shrink-0 w-[105px] h-[153px] sm:w-44 sm:h-64 rounded-2xl overflow-hidden shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center gap-2"
          style={{ background: 'linear-gradient(to bottom right, #ec4899, #f97316)' }}
        >
          <span className="flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-white/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-7 sm:h-7">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
          <span className="text-white font-bold text-xs sm:text-sm">一覧を見る</span>
        </Link>
      </div>
    </div>
  );
}
