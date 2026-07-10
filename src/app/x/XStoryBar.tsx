'use client';

import { useEffect, useState } from 'react';
import { VerifiedBadge } from './VerifiedBadge';
import { XStoryViewer } from './XStoryViewer';
import { XStoryComposer } from './XStoryComposer';
import { getSeenMap, isGroupSeen } from './xStoriesShared';
import type { StoryGroup } from './xStories';
import type { XProfile } from './xProfile';

const POSTABLE_KINDS = ['therapist', 'shop', 'official'];

// タイムライン最上部の横スクロール・ストーリーバー。ログインユーザーのみ描画（page 側でも分岐）。
export function XStoryBar({ groups, me }: { groups: StoryGroup[]; me: XProfile | null }) {
  // 既読状態は localStorage 依存＝マウント後に読む（SSRとの不一致回避）。
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null); // 開いているグループのindex
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    setSeen(getSeenMap());
  }, []);
  // ビューアを閉じたら既読を読み直してリング色を更新。
  const refreshSeen = () => setSeen(getSeenMap());

  if (!me) return null; // 未ログインは出さない（防御）

  // 投稿可能：therapist/shop/official ∧ status=approved（凍結中は「＋」を出さない）。
  const canPost = POSTABLE_KINDS.includes(me.kind) && me.status === 'approved';

  // バーに出すものが何も無い（自分が投稿不可 ∧ ストーリー0件）なら描画しない。
  if (!canPost && groups.length === 0) return null;

  return (
    <>
      <div className="mt-3 -mx-1">
        <div className="flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 先頭：自分の「＋追加」サークル（投稿可能kindのみ） */}
          {canPost && (
            <button type="button" onClick={() => setComposerOpen(true)} className="flex flex-col items-center gap-1 flex-shrink-0 w-[84px]">
              <span className="relative w-[84px] h-[84px] rounded-full p-[5px] bg-[color:var(--x-border-strong)]">
                <span className="block w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center">
                  {me.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold text-lg">{me.display_name.charAt(0) || '?'}</span>
                  )}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center border-2 border-[color:var(--x-surface)] text-xs font-bold leading-none">
                  ＋
                </span>
              </span>
              <span className="text-[11px] text-[color:var(--x-text-secondary)] truncate max-w-full">ストーリー</span>
            </button>
          )}

          {/* 投稿者ごとのサークル。全既読ならリングをグレーに。 */}
          {groups.map((g, i) => {
            const allSeen = isGroupSeen(g, seen);
            return (
              <button key={g.author.id} type="button" onClick={() => setViewerIndex(i)} className="flex flex-col items-center gap-1 flex-shrink-0 w-[84px]">
                {/* リング層（絶対配置）だけが回転し、アバター層は上に重ねるので回らない */}
                <span className="relative w-[84px] h-[84px]">
                  <span
                    className={`absolute inset-0 rounded-full ${allSeen ? '' : 'x-story-ring'}`}
                    style={allSeen ? { background: 'var(--x-border-strong)' } : undefined}
                  />
                  {/* リング幅5px・フチなし（プロフィールのリングと同じ密着型） */}
                  <span className="absolute inset-[5px] rounded-full overflow-hidden bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center">
                    {g.author.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-lg">{g.author.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-0.5 max-w-full">
                  <span className="text-[11px] text-[color:var(--x-text-secondary)] truncate">{g.author.displayName}</span>
                  {g.author.isVerified && <VerifiedBadge kind={g.author.kind} size={11} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {viewerIndex !== null && (
        <XStoryViewer
          groups={groups}
          startGroupIndex={viewerIndex}
          myProfileId={me.id}
          onClose={() => {
            setViewerIndex(null);
            refreshSeen();
          }}
        />
      )}

      {composerOpen && <XStoryComposer me={me} onClose={() => setComposerOpen(false)} />}
    </>
  );
}
