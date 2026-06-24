'use client';

import { useState } from 'react';
import { StarIcon } from './Stars';

// 投稿フォーム用の★入力（0.5刻み）。各星を左半分=x.5 / 右半分=x.0 のヒットエリアに分割し、
// ホバーでプレビュー表示する。アイコンは Stars.tsx の StarIcon を再利用（表示と同じ見た目）。
// <form> タグは使わない。
const FILL = '#FB923C';
const EMPTY = '#e2e8f0'; // slate-200

export function StarRatingInput({
  value,
  onChange,
  size = 34,
  label,
}: {
  value: number; // 0=未選択
  onChange: (v: number) => void;
  size?: number;
  label?: string;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-sm font-bold text-slate-600 w-20 flex-shrink-0">{label}</span>}
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, display - i));
          const pct = `${fill * 100}%`;
          return (
            <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
              {/* 見た目（下地グレー＋オレンジを幅クリップで重ねる） */}
              <span className="absolute inset-0">
                <StarIcon size={size} color={EMPTY} />
              </span>
              <span className="absolute inset-0 overflow-hidden" style={{ width: pct }}>
                <StarIcon size={size} color={FILL} />
              </span>
              {/* ヒットエリア：左半分=0.5、右半分=1.0 */}
              <button
                type="button"
                aria-label={`${label ? label + ' ' : ''}${i + 0.5}点`}
                className="absolute inset-y-0 left-0 w-1/2 z-10 cursor-pointer"
                onMouseEnter={() => setHover(i + 0.5)}
                onClick={() => onChange(i + 0.5)}
              />
              <button
                type="button"
                aria-label={`${label ? label + ' ' : ''}${i + 1}点`}
                className="absolute inset-y-0 right-0 w-1/2 z-10 cursor-pointer"
                onMouseEnter={() => setHover(i + 1)}
                onClick={() => onChange(i + 1)}
              />
            </span>
          );
        })}
      </div>
      <span className="text-sm font-bold text-slate-600 tabular-nums w-8 flex-shrink-0">
        {value > 0 ? value.toFixed(1) : '–'}
      </span>
    </div>
  );
}
