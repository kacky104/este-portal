import type { ReactNode } from 'react';

// ランキング各タブ共通の豪華見出し（金グラデ文字＋王冠＋装飾ライン）。説明の文字色はテーマ連動。
export function RankingHeading({
  title,
  description,
  bodyColor,
}: {
  title: string;
  description: ReactNode;
  bodyColor: string;
}) {
  return (
    <div className="mb-5 text-center">
      <div className="flex items-center justify-center gap-2.5 mb-2">
        <span className="h-px w-10 sm:w-16" style={{ background: 'linear-gradient(to right, transparent, #E8A317)' }} />
        <svg viewBox="0 0 576 512" width="24" height="24" fill="#E8A317" aria-hidden className="drop-shadow-sm">
          <path d="M309 106c11.4-7 19-19.7 19-34 0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34l-39.5 74c-9.8 16.4-32.4 20-47 7.4L86 158c5-6.4 8-14.4 8-23 0-22.1-17.9-40-40-40S14 92.9 14 115s17.9 40 40 40c1.7 0 3.5-.1 5.1-.3l45.5 244.5c3.2 17.9 18.8 30.8 37 30.8h332.8c18.2 0 33.8-12.9 37-30.8L516.9 154.7c1.7.2 3.4.3 5.1.3 22.1 0 40-17.9 40-40s-17.9-40-40-40-40 17.9-40 40c0 8.6 3 16.6 8 23l-76.5 69.9c-14.6 12.6-37.2 9-47-7.4L309 106z" />
        </svg>
        <span className="h-px w-10 sm:w-16" style={{ background: 'linear-gradient(to left, transparent, #E8A317)' }} />
      </div>
      <h2
        className="text-2xl sm:text-3xl font-black tracking-wider"
        style={{ backgroundImage: 'linear-gradient(180deg,#F9D976,#E8A317,#B8860B)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
      >
        {title}
      </h2>
      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: bodyColor }}>{description}</p>
    </div>
  );
}
