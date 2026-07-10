// ストーリー既読管理（クライアント専用・localStorage）。
// server client に依存する xStories.ts とは別モジュールに置き、client コンポーネントから値として import できるようにする。
// 足あと（サーバー記録）は持たず、既読リングの見た目だけをローカルで管理する。

import type { StoryGroup } from './xStories';

const SEEN_KEY = 'x_story_seen';

// { [authorProfileId]: 最後に見た storyId } の JSON。
type SeenMap = Record<string, string>;

export function getSeenMap(): SeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

// storyId は bigint 文字列。数値として大きい方（＝新しい方）だけ保存する。
export function markStorySeen(authorProfileId: string, storyId: string): void {
  if (typeof window === 'undefined') return;
  const map = getSeenMap();
  const prev = map[authorProfileId];
  if (prev === undefined || Number(storyId) > Number(prev)) {
    map[authorProfileId] = storyId;
    try {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(map));
    } catch {
      /* 保存失敗（容量超過等）は既読表示の欠落に留まるので無視 */
    }
  }
}

// グループ内の全ストーリーを見終わっているか（最後のstoryId以上を既読として持つか）。
export function isGroupSeen(group: StoryGroup, seen: SeenMap): boolean {
  const last = group.stories[group.stories.length - 1];
  if (!last) return true;
  const seenId = seen[group.author.id];
  return seenId !== undefined && Number(seenId) >= Number(last.id);
}
