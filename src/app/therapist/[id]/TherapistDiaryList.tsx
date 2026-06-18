'use client';

import { useRef, useState } from 'react';

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

// 投稿1件分の画像スライダー（複数枚のときのみ矢印・ドット・スワイプ）
function PostSlider({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const startX = useRef<number | null>(null);

  if (images.length === 0) return null;
  const single = images.length === 1;
  const go = (d: number) => setIdx((p) => (p + d + images.length) % images.length);

  return (
    <div
      className="relative w-full bg-slate-100 rounded-xl overflow-hidden select-none touch-pan-y"
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[idx]} alt={alt} draggable={false} className="w-full max-h-[480px] object-contain mx-auto" />

      {!single && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="前の画像"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="次の画像"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`${i + 1}枚目`}
                className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-pink-500' : 'bg-white/80 border border-pink-200'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TherapistDiaryList({ posts, name }: { posts: DiaryPostView[]; name: string }) {
  return (
    <div className="space-y-5">
      {posts.map((post) => (
        <article key={post.id} className="border border-slate-100 rounded-2xl p-3 space-y-3">
          <p className="text-[11px] text-slate-400">📅 {formatDateTime(post.created_at)}</p>
          {post.images.length > 0 && <PostSlider images={post.images} alt={name} />}
          {post.comment && (
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{post.comment}</p>
          )}
        </article>
      ))}
    </div>
  );
}
