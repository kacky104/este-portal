'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { VerifiedBadge } from './VerifiedBadge';
import { XTimeAgo } from './XTimeAgo';
import { markStorySeen } from './xStoriesShared';
import type { StoryGroup } from './xStories';

const sb = createClient();

const STORY_MS = 5000; // 1枚あたりの自動送り時間

// フルスクリーンのストーリービューア。groups をまたいで連続再生する。
// startGroupIndex から開始し、各グループ内は古い順（stories は昇順）に再生。全て終わったら onClose。
export function XStoryViewer({
  groups,
  startGroupIndex,
  myProfileId,
  onClose,
}: {
  groups: StoryGroup[];
  startGroupIndex: number;
  myProfileId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [gi, setGi] = useState(startGroupIndex); // 現在のグループ
  const [si, setSi] = useState(0); // グループ内のストーリー
  const [deleting, setDeleting] = useState(false);

  const group = groups[gi];
  const story = group?.stories[si];

  // 表示中のストーリーを既読に反映。
  useEffect(() => {
    if (group && story) markStorySeen(group.author.id, story.id);
  }, [group, story]);

  // 前後移動。グループ境界をまたぐ。全末尾で閉じる。
  const goNext = useCallback(() => {
    const g = groups[gi];
    if (!g) return onClose();
    if (si < g.stories.length - 1) {
      setSi((v) => v + 1);
    } else if (gi < groups.length - 1) {
      setGi((v) => v + 1);
      setSi(0);
    } else {
      onClose();
    }
  }, [groups, gi, si, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) {
      setSi((v) => v - 1);
    } else if (gi > 0) {
      const prevG = groups[gi - 1];
      setGi((v) => v - 1);
      setSi(prevG.stories.length - 1); // 前グループの末尾へ
    }
    // 先頭より前は何もしない
  }, [groups, gi, si]);

  // 自動送りタイマー（story が変わるたびリセット）。
  useEffect(() => {
    if (!story) return;
    const timer = window.setTimeout(goNext, STORY_MS);
    return () => window.clearTimeout(timer);
  }, [story, goNext]);

  // body スクロールロック＋Escで閉じる。
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, goNext, goPrev]);

  // 下スワイプで閉じる（タッチのY移動を見る）。
  const touchStartY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartY.current;
    touchStartY.current = null;
    if (start == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? start) - start;
    if (dy > 80) onClose();
  };

  const handleDelete = async () => {
    if (deleting || !story) return;
    if (!window.confirm('このストーリーを削除しますか？')) return;
    setDeleting(true);
    const { error } = await sb.from('x_stories').delete().eq('id', story.id);
    setDeleting(false);
    if (error) {
      window.alert('削除できませんでした');
      return;
    }
    // 削除後は残りを詰めるのが複雑なので、いったん閉じてバーを再取得する。
    router.refresh();
    onClose();
  };

  if (!group || !story) return null;

  const isMine = myProfileId != null && group.author.id === myProfileId;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 上部プログレスバー（ストーリー数ぶん分割・現在のものだけアニメーション進行） */}
      <div className="flex gap-1 px-3 pt-3">
        {group.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className={`h-full bg-white ${i < si ? 'w-full' : i === si ? 'x-story-progress' : 'w-0'}`}
              style={i === si ? { animationDuration: `${STORY_MS}ms` } : undefined}
            />
          </div>
        ))}
      </div>

      {/* ヘッダー: アバター＋名前（プロフィールへ）＋相対時刻／自分ならゴミ箱／閉じる */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Link href={`/x/u/${encodeURIComponent(group.author.handle)}`} onClick={onClose} className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="w-9 h-9 rounded-full overflow-hidden border border-white/50 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
            {group.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-sm">{group.author.displayName.charAt(0) || '?'}</span>
            )}
          </span>
          <span className="min-w-0 flex items-center gap-1.5">
            <span className="font-bold text-white text-sm truncate">{group.author.displayName}</span>
            {group.author.isVerified && <VerifiedBadge kind={group.author.kind} />}
            <XTimeAgo iso={story.createdAt} className="text-xs text-white/60 flex-shrink-0" />
          </span>
        </Link>

        {isMine && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="ストーリーを削除"
            className="p-2 text-white/90 hover:text-rose-400 transition-colors disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        )}

        <button type="button" onClick={onClose} aria-label="閉じる" className="p-2 text-white/90 hover:text-white transition-colors">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 本体: 画像（9:16想定・object-contain）＋キャプション帯。左右タップで前後移動。 */}
      <div className="relative flex-1 min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={story.imageUrl} alt={story.caption ?? ''} className="absolute inset-0 w-full h-full object-contain" />

        {/* 左40%＝前・右40%＝次のタップ領域（中央はリンク等と干渉しないよう空ける） */}
        <button type="button" aria-label="前へ" onClick={goPrev} className="absolute left-0 top-0 h-full w-2/5" />
        <button type="button" aria-label="次へ" onClick={goNext} className="absolute right-0 top-0 h-full w-2/5" />

        {story.caption && (
          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-4 py-3">
            <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{story.caption}</p>
          </div>
        )}
      </div>
    </div>
  );
}
