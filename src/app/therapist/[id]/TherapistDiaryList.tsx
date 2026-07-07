'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { formatDiaryDate } from '@/lib/diaryDate';
import { DiaryNewBadge } from '@/components/DiaryNewBadge';

export type DiaryPostView = {
  id: number;
  images: string[];
  title: string | null;
  created_at: string;
};

// 2行クランプ用スタイル
const clamp2: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-all',
  fontSize: '11px',
};

export function TherapistDiaryList({ posts, name }: { posts: DiaryPostView[]; name: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // ホバー中に横方向へ自動スクロール
  const startAuto = () => {
    const step = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollLeft + el.clientWidth < el.scrollWidth - 1) {
        el.scrollLeft += 1;
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };
  const stopAuto = () => cancelAnimationFrame(rafRef.current);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 overflow-x-auto max-w-full min-w-0 pb-2 scrollbar-pink"
      onMouseEnter={startAuto}
      onMouseLeave={stopAuto}
    >
      {posts.map((post) => {
        const img = post.images[0] ?? null;
        return (
          <Link
            key={post.id}
            href={`/diary/${post.id}`}
            className="flex-shrink-0 w-[130px] text-left overflow-hidden border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            {/* 画像：スマホは縦長（下のテキスト枠ぶんを吸収しカード高さを維持）＋画像内オーバーレイ、
                PC は従来どおり正方形（テキストは下に別表示）。横幅・横スクロール挙動は不変。 */}
            <div className="relative w-[130px] h-[185px] sm:h-[130px] bg-slate-100">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl font-bold">
                  {name.charAt(0)}
                </div>
              )}
              {/* スマホのみ：更新日・タイトルを画像内オーバーレイ（下部スクリム＋白文字）。2列グリッド側と同じ見え方。 */}
              <div className="sm:hidden absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent">
                <p className="text-[10px] text-white/85" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                  {formatDiaryDate(post.created_at)}<DiaryNewBadge iso={post.created_at} />
                </p>
                {post.title && (
                  <p className="text-[11px] font-bold text-white line-clamp-2 mt-0.5 break-all" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                    {post.title}
                  </p>
                )}
              </div>
            </div>
            {/* PC/タブレットのみ：従来どおり画像下にテキスト（スクリムなし）。スマホでは非表示。 */}
            <div className="p-2 bg-white hidden sm:block">
              <p style={{ fontSize: '12px', color: '#999' }} className="mb-0.5">
                {formatDiaryDate(post.created_at)}<DiaryNewBadge iso={post.created_at} />
              </p>
              {post.title && (
                <p style={clamp2} className="text-slate-600 leading-snug">{post.title}</p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
