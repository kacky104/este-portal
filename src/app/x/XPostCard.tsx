'use client';

import { useState } from 'react';
import Link from 'next/link';
import { XTimeAgo } from './XTimeAgo';
import { VerifiedBadge } from './VerifiedBadge';
import { XImageLightbox } from './XImageLightbox';
import type { XPost } from './xPosts';

const KIND_LABEL: Record<string, string> = {
  user: 'ユーザー',
  therapist: 'セラピスト',
  shop: 'お店',
};

// 画像1〜4枚のグリッド（写メ日記のグリッド作法を参考に。1枚=単独、2/4枚=2列、3枚=先頭大）。
// 各画像クリックでライトボックス（全画面拡大）を開く。クリックした画像のインデックスを渡し、
// 複数枚なら拡大したまま左右ナビできる（XImageLightbox 側で対応）。
function ImageGrid({
  images,
  alt,
  onImageClick,
}: {
  images: string[];
  alt: string;
  onImageClick: (index: number) => void;
}) {
  if (images.length === 0) return null;

  // 1枚のときは正方形トリミングをやめ、元のアスペクト比のまま表示（縦長対策に max-h で頭打ち）。
  if (images.length === 1) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onImageClick(0);
          }}
          aria-label={`${alt}の画像1を拡大表示`}
          className="relative bg-slate-100 cursor-zoom-in p-0 border-0 block w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0]} alt={`${alt}-1`} className="w-full h-auto max-h-[80vh] object-contain" />
        </button>
      </div>
    );
  }

  // 複数枚（2〜4枚）は従来どおり正方形グリッド（3枚=先頭大）。
  const cls = 'grid-cols-2';
  return (
    <div className={`mt-2 grid ${cls} gap-1 rounded-xl overflow-hidden`}>
      {images.slice(0, 4).map((src, i) => (
        <button
          type="button"
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            onImageClick(i);
          }}
          aria-label={`${alt}の画像${i + 1}を拡大表示`}
          className={`relative bg-slate-100 cursor-zoom-in p-0 border-0 block w-full ${
            images.length === 3 && i === 0 ? 'row-span-2 aspect-[1/2]' : 'aspect-square'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${alt}-${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
        </button>
      ))}
    </div>
  );
}

export function XPostCard({
  post,
  liked,
  likeCount,
  following,
  showFollow,
  likePending,
  followPending,
  onToggleLike,
  onToggleFollow,
  showReplyLink = true,
}: {
  post: XPost;
  liked: boolean;
  likeCount: number;
  following: boolean;
  showFollow: boolean; // フォローボタンを描画するか（投稿主が therapist/shop かつ自分以外・自分が therapist でない 等の条件で親が判定）
  likePending: boolean;
  followPending: boolean;
  onToggleLike: (post: XPost) => void;
  onToggleFollow: (authorId: string) => void;
  // タイムライン/プロフィールでは true（タップで投稿詳細へ）。投稿詳細ページ内のカードでは false にして
  // リプライ件数を静的表示にする（リプライへの個別返信導線を作らず＝1階層フラットを維持）。
  showReplyLink?: boolean;
}) {
  const a = post.author;
  // 投稿画像の全画面拡大。クリックした画像のインデックスを保持（null で閉じ）。複数枚は左右ナビ可。
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  return (
    <article className="x-card rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(168,85,247,0.25)] p-4">
      {/* ヘッダー：アバター・名前・@handle・kind・時刻・フォロー（名前/アバターはプロフィールへリンク） */}
      <div className="flex items-start gap-2.5">
        <Link
          href={`/x/u/${a.handle}`}
          className="relative w-10 h-10 rounded-full overflow-hidden border border-slate-100 shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0"
        >
          {a.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.avatarUrl} alt={a.displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-bold text-sm">{a.displayName.charAt(0) || '?'}</span>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link href={`/x/u/${a.handle}`} className="font-bold text-sm text-slate-900 truncate max-w-[40%] hover:underline">
              {a.displayName}
            </Link>
            {a.kind === 'shop' && a.isVerified && <VerifiedBadge />}
            <Link href={`/x/u/${a.handle}`} className="text-xs text-slate-400 truncate hover:underline">
              @{a.handle}
            </Link>
            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
              {KIND_LABEL[a.kind] ?? a.kind}
            </span>
            {/* セラピストが店舗所属なら所属先を小さく表示（店舗プロフィールへリンク） */}
            {a.affiliatedShop && (
              <Link
                href={`/x/u/${a.affiliatedShop.handle}`}
                className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 hover:bg-emerald-100 transition-colors truncate max-w-[40%]"
              >
                {a.affiliatedShop.displayName}所属
              </Link>
            )}
            <span className="text-xs text-slate-300">·</span>
            <XTimeAgo iso={post.createdAt} className="text-xs text-slate-400" />
          </div>
        </div>

        {showFollow && (
          <button
            type="button"
            onClick={() => onToggleFollow(a.id)}
            disabled={followPending}
            className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full transition-colors disabled:opacity-50 ${
              following
                ? 'border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500'
                : 'text-white'
            }`}
            style={following ? undefined : { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            {following ? 'フォロー中' : 'フォロー'}
          </button>
        )}
      </div>

      {/* 本文 */}
      {post.body && (
        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words mt-2 ml-[50px]">
          {post.body}
        </p>
      )}

      {/* 画像 */}
      <div className="ml-[50px]">
        <ImageGrid images={post.images} alt={a.displayName} onImageClick={setLightboxIndex} />
      </div>

      {/* いいね・リプライ */}
      <div className="mt-2 ml-[50px] flex items-center gap-5">
        <button
          type="button"
          onClick={() => onToggleLike(post)}
          disabled={likePending}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50 ${
            liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span className="tabular-nums font-medium">{likeCount}</span>
        </button>

        {/* リプライ数。一覧ではタップで投稿詳細へ。詳細ページ内では静的表示（深い返信導線を作らない）。 */}
        {showReplyLink ? (
          <Link
            href={`/x/post/${post.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-500 transition-colors"
            aria-label="リプライを見る"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span className="tabular-nums font-medium">{post.replyCount}</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-400" aria-label="リプライ数">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span className="tabular-nums font-medium">{post.replyCount}</span>
          </span>
        )}
      </div>

      {/* 投稿画像の全画面拡大ライトボックス（複数枚は左右ナビ） */}
      {lightboxIndex !== null && (
        <XImageLightbox
          images={post.images}
          startIndex={lightboxIndex}
          alt={a.displayName}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </article>
  );
}
