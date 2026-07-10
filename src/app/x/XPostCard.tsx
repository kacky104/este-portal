'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { XTimeAgo } from './XTimeAgo';
import { VerifiedBadge } from './VerifiedBadge';
import { XImageLightbox } from './XImageLightbox';
import { PostBody } from './PostBody';
import { XComposer } from './XComposer';
import { RepostIcon } from './RepostIcon';
import { useMe } from './XMeProvider';
import { safeHref, linkDomain } from './xLink';
import type { XPost } from './xPosts';

const sb = createClient();

const KIND_LABEL: Record<string, string> = {
  user: 'ユーザー',
  therapist: 'セラピスト',
  shop: 'お店',
  official: '運営',
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
          className="relative bg-[color:var(--x-inset)] cursor-zoom-in p-0 border-0 block w-full"
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
          className={`relative bg-[color:var(--x-inset)] cursor-zoom-in p-0 border-0 block w-full ${
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
  saved,
  savePending,
  onToggleSave,
  reposted = false,
  repostCount = 0,
  repostPending = false,
  onToggleRepost,
  repostLabel,
  showReplyLink = true,
  clampBody = true,
  flat = false,
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
  // 保存（ブックマーク）。onToggleSave を渡したときだけ保存ボタンを描画する（未指定の呼び出し元は従来どおり非表示）。
  saved?: boolean;
  savePending?: boolean;
  onToggleSave?: (post: XPost) => void;
  // リポスト。onToggleRepost を渡したときだけリポストボタンを描画する（未指定の呼び出し元は従来どおり非表示）。
  // 自分の投稿にはボタンを出さない（isOwn で判定）。件数の出し方はいいねに一致（常に数字を表示）。
  reposted?: boolean;
  repostCount?: number;
  repostPending?: boolean;
  onToggleRepost?: (post: XPost) => void;
  // 値があればカード上部に「RepostIcon 小＋グレーテキストで {repostLabel}」を描画（例:「◯◯ さんがリポスト」）。
  repostLabel?: string;
  // タイムライン/プロフィールでは true（タップで投稿詳細へ）。投稿詳細ページ内のカードでは false にして
  // リプライ件数を静的表示にする（リプライへの個別返信導線を作らず＝1階層フラットを維持）。
  showReplyLink?: boolean;
  // 本文の行数クランプ（8行＋「続きを読む」）。一覧系は既定 true。投稿単体ページのメイン投稿だけ
  // false を渡して全文表示にする（リプライ一覧のカードは既定 true のままクランプ）。
  clampBody?: boolean;
  // 【試験実装 2026-07-10】X風の全幅行モード。true で浮遊カードの装飾（角丸・影）を外し
  // 全幅の行として描画する（区切り線は親コンテナの divide-y が担当）。タイムラインのみで使用。
  flat?: boolean;
}) {
  const a = post.author;
  const { me } = useMe();
  const isOwn = !!me && me.id === a.id; // 自分の投稿＝編集/削除メニューを出す

  // 投稿画像の全画面拡大。クリックした画像のインデックスを保持（null で閉じ）。複数枚は左右ナビ可。
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // 編集/削除のローカル状態（親の再配線なしで自己完結：編集は override で上書き、削除は非表示）。
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [override, setOverride] = useState<
    Pick<XPost, 'body' | 'images' | 'linkUrl' | 'repliesDisabled' | 'editedAt'> | null
  >(null);
  // 表示は override 反映後の値（body/images/link/編集済みが編集で変わる。author/id/createdAt/replyCount は不変）。
  const view = override ? { ...post, ...override } : post;

  const onDelete = async () => {
    setMenuOpen(false);
    if (!window.confirm('この投稿を削除しますか？\nこの操作は取り消せません。リプライやいいねも一緒に削除されます。')) return;
    const { error } = await sb.from('x_posts').delete().eq('id', post.id);
    if (error) {
      window.alert(`削除できませんでした：${error.message}`);
      return;
    }
    setDeleted(true);
  };

  if (deleted) return null;

  return (
    <article
      className={
        flat
          ? 'x-card bg-[color:var(--x-surface)] px-4 py-3'
          : 'x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-4'
      }
    >
      {/* リポストラベル（値があるときだけ）：カード上部に RepostIcon 小＋グレーテキスト。本文に合わせて軽くインデント。 */}
      {repostLabel && (
        <div className="flex items-center gap-1.5 text-xs text-[color:var(--x-text-muted)] mb-2 ml-[50px]">
          <RepostIcon size={14} className="flex-shrink-0" />
          <span className="truncate">{repostLabel}</span>
        </div>
      )}

      {/* ヘッダー：アバター・名前・@handle・kind・時刻・フォロー（名前/アバターはプロフィールへリンク） */}
      <div className="flex items-start gap-2.5">
        <Link
          href={`/x/u/${a.handle}`}
          className="relative w-10 h-10 rounded-full overflow-hidden border border-[color:var(--x-border)] shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0"
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
            <Link href={`/x/u/${a.handle}`} className="font-bold text-sm text-[color:var(--x-text-primary)] truncate max-w-[40%] hover:underline">
              {a.displayName}
            </Link>
            {(a.kind === 'official' || ((a.kind === 'shop' || a.kind === 'therapist') && a.isVerified)) && <VerifiedBadge kind={a.kind} />}
            <Link href={`/x/u/${a.handle}`} className="text-xs text-[color:var(--x-text-muted)] truncate hover:underline">
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
            <span className="text-xs text-[color:var(--x-text-muted)]">·</span>
            <XTimeAgo iso={post.createdAt} className="text-xs text-[color:var(--x-text-muted)]" />
            {/* 編集済み表示 */}
            {view.editedAt && <span className="text-[10px] text-[color:var(--x-text-muted)]">(編集済み)</span>}
          </div>
        </div>

        {showFollow && (
          <button
            type="button"
            onClick={() => onToggleFollow(a.id)}
            disabled={followPending}
            className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full transition-colors disabled:opacity-50 ${
              following
                ? 'border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:border-rose-200 hover:text-rose-500'
                : 'text-white'
            }`}
            style={following ? undefined : { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            {following ? 'フォロー中' : 'フォロー'}
          </button>
        )}

        {/* 自分の投稿のみ：…メニュー（編集/削除）。カード遷移と競合しないよう stopPropagation。 */}
        {isOwn && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-label="投稿メニュー"
              className="w-8 h-8 -mr-1 -mt-1 rounded-full text-[color:var(--x-text-muted)] hover:bg-[color:var(--x-inset)] hover:text-[color:var(--x-text-secondary)] flex items-center justify-center transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <>
                {/* 画面どこかをタップで閉じる */}
                <button
                  type="button"
                  aria-label="メニューを閉じる"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 top-9 z-20 w-32 rounded-xl bg-[color:var(--x-surface)] shadow-lg border border-[color:var(--x-border)] py-1 overflow-hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      setEditing(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm font-medium text-[color:var(--x-text-primary)] hover:bg-[color:var(--x-surface-hover)]"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="w-full text-left px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50"
                  >
                    削除
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 本文（#タグ はリンク化・8行クランプ＋「続きを読む」は PostBody 側で処理）。
          単体ページのメイン投稿だけ clampBody=false で全文表示。 */}
      {view.body && <PostBody text={view.body} clamp={clampBody} />}

      {/* リンク（任意・http/https のみ）。ドメイン名を新タブで開く。カードの他タップと競合しないよう stopPropagation。 */}
      {safeHref(view.linkUrl) && (
        <a
          href={safeHref(view.linkUrl)!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-[50px] mt-2 inline-flex items-center gap-1.5 max-w-full text-sm font-medium text-[color:var(--x-accent)] hover:underline"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span className="truncate">{linkDomain(view.linkUrl!)}</span>
        </a>
      )}

      {/* 画像 */}
      <div className="ml-[50px]">
        <ImageGrid images={view.images} alt={a.displayName} onImageClick={setLightboxIndex} />
      </div>

      {/* いいね・リプライ */}
      <div className="mt-2 ml-[50px] flex items-center gap-5">
        <button
          type="button"
          onClick={() => onToggleLike(post)}
          disabled={likePending}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50 ${
            liked ? 'text-rose-500' : 'text-[color:var(--x-text-muted)] hover:text-rose-400'
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
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--x-text-muted)] hover:text-indigo-500 transition-colors"
            aria-label="リプライを見る"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span className="tabular-nums font-medium">{post.replyCount}</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-[color:var(--x-text-muted)]" aria-label="リプライ数">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span className="tabular-nums font-medium">{post.replyCount}</span>
          </span>
        )}

        {/* リポスト。onToggleRepost が渡っていれば常に表示（件数も）。いいねと同じ作法。
            リポスト済み=緑(#10B981=emerald-500)・未=グレー。件数は常に数字表示（いいねに一致）。
            自分の投稿（isOwn）は「表示・無効」：グレー固定・トグルホバー無し・押しても無反応（トーストも出さない）。
            件数（何人がリポストしたか）は自分の投稿でも表示する。self ガードは server action 側にも残す。 */}
        {onToggleRepost && (
          <button
            type="button"
            onClick={isOwn ? undefined : () => onToggleRepost(post)}
            disabled={isOwn || repostPending}
            aria-pressed={!isOwn && reposted}
            aria-label={isOwn ? 'リポスト数' : reposted ? 'リポストを解除' : 'リポスト'}
            className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
              isOwn
                ? 'text-[color:var(--x-text-muted)] cursor-default disabled:opacity-100'
                : `disabled:opacity-50 ${reposted ? 'text-emerald-500' : 'text-[color:var(--x-text-muted)] hover:text-emerald-500'}`
            }`}
          >
            <RepostIcon size={18} />
            <span className="tabular-nums font-medium">{repostCount}</span>
          </button>
        )}

        {/* 保存（ブックマーク）。onToggleSave が渡されたときだけ表示。保存済み=amber塗り・未保存=枠線。
            右端に寄せる（ml-auto）。カードの他タップ（詳細遷移）と競合しないよう stopPropagation。 */}
        {onToggleSave && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(post);
            }}
            disabled={savePending}
            aria-pressed={!!saved}
            aria-label={saved ? '保存を解除' : '保存する'}
            className={`ml-auto inline-flex items-center text-sm transition-colors disabled:opacity-50 ${
              saved ? 'text-amber-500' : 'text-[color:var(--x-text-muted)] hover:text-amber-500'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
      </div>

      {/* 投稿画像の全画面拡大ライトボックス（複数枚は左右ナビ） */}
      {lightboxIndex !== null && (
        <XImageLightbox
          images={view.images}
          startIndex={lightboxIndex}
          alt={a.displayName}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* 編集モーダル（自分の投稿のみ・XComposer を編集モードで再利用） */}
      {editing && me && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={() => setEditing(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl bg-[color:var(--x-surface)] shadow-2xl border border-[color:var(--x-border)] p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="閉じる"
              className="absolute top-3 right-3 w-8 h-8 rounded-full text-[color:var(--x-text-muted)] hover:bg-[color:var(--x-inset)] flex items-center justify-center"
            >
              ✕
            </button>
            <h2 className="text-sm font-black text-[color:var(--x-text-primary)] mb-1">投稿を編集</h2>
            <XComposer
              me={me}
              editPost={view}
              myAffiliatedShop={a.affiliatedShop}
              onPosted={(updated) => {
                setOverride({
                  body: updated.body,
                  images: updated.images,
                  linkUrl: updated.linkUrl,
                  repliesDisabled: updated.repliesDisabled,
                  editedAt: updated.editedAt,
                });
                setEditing(false);
              }}
            />
          </div>
        </div>
      )}
    </article>
  );
}
