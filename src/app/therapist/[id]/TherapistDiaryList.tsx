'use client';

import { useRef, useState, useEffect } from 'react';

export type DiaryPostView = {
  id: number;
  images: string[];
  comment: string | null;
  created_at: string;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

// カード用：日付のみ（例「2026/06/18」）
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

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
  const [selected, setSelected] = useState<DiaryPostView | null>(null);

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

  // モーダル表示中は背面スクロールを止め、Escで閉じる
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  return (
    <>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-pink"
        onMouseEnter={startAuto}
        onMouseLeave={stopAuto}
      >
        {posts.map((post) => {
          const img = post.images[0] ?? null;
          return (
            <button
              key={post.id}
              type="button"
              onClick={() => setSelected(post)}
              className="flex-shrink-0 w-[130px] text-left rounded-xl overflow-hidden border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              {/* 正方形画像 */}
              <div className="w-[130px] h-[130px] bg-slate-100">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl font-bold">
                    {name.charAt(0)}
                  </div>
                )}
              </div>
              {/* テキストエリア */}
              <div className="p-2 bg-white">
                <p style={{ fontSize: '12px', color: '#999' }} className="mb-0.5">
                  {formatDate(post.created_at)} 更新
                </p>
                {post.comment && (
                  <p style={clamp2} className="text-slate-600 leading-snug">{post.comment}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* モーダル */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative bg-white rounded-2xl overflow-hidden max-w-md w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="閉じる"
              className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
            >
              ✕
            </button>
            {selected.images[0] && (
              <div className="bg-slate-100 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.images[0]}
                  alt={name}
                  className="w-full max-h-[55vh] object-contain"
                />
              </div>
            )}
            <div className="p-4 overflow-y-auto">
              <p style={{ fontSize: '11px', color: '#999' }} className="mb-2">
                📅 {formatDateTime(selected.created_at)}
              </p>
              {selected.comment && (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-all">
                  {selected.comment}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
