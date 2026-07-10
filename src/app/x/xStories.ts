import { createClient } from '@/app/lib/supabase/server';
import type { XKind } from './xProfile';

export type XStory = {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
};

export type StoryGroup = {
  author: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    kind: XKind;
    isVerified: boolean;
  };
  stories: XStory[]; // 古い順（再生順）
  latestAt: string;
};

// ストーリーバー用: 未失効の全ストーリーを取得し、投稿者ごとにまとめて返す（最新投稿者順）。
// 閲覧はログインユーザーのみ＝ログインクライアントで取得（RLSが未失効＋自分の投稿のみに絞る）。未ログイン時は page 側で呼ばない。
export async function fetchStoryGroups(): Promise<StoryGroup[]> {
  const supabase = await createClient();

  // 未失効ストーリーを古い順（再生順）に取得。RLS の expires_at > now と二重防御。
  const { data: storyRows } = await supabase
    .from('x_stories')
    .select('id, author_profile_id, image_url, caption, created_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  const rows = storyRows ?? [];
  if (rows.length === 0) return [];

  // 投稿者プロフィールを1クエリで合流（N+1回避）。status=rejected の投稿者は除外。
  const authorIds = [...new Set(rows.map((r) => r.author_profile_id as string).filter(Boolean))];
  const { data: profs } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, kind, is_verified, status')
    .in('id', authorIds);

  const authorDict = new Map<string, StoryGroup['author']>();
  (profs ?? []).forEach((p) => {
    if ((p.status as string) === 'rejected') return;
    authorDict.set(p.id as string, {
      id: p.id as string,
      handle: (p.handle as string) ?? '',
      displayName: (p.display_name as string) ?? '',
      avatarUrl: (p.avatar_url as string | null) ?? null,
      kind: p.kind as XKind,
      isVerified: Boolean(p.is_verified),
    });
  });

  // 投稿者ごとにグルーピング（rows は created_at 昇順なので stories も古い順で積まれる）。
  const groupMap = new Map<string, StoryGroup>();
  for (const r of rows) {
    const author = authorDict.get(r.author_profile_id as string);
    if (!author) continue; // rejected 等で除外された投稿者
    const story: XStory = {
      id: String(r.id),
      imageUrl: r.image_url as string,
      caption: (r.caption as string | null) ?? null,
      createdAt: r.created_at as string,
    };
    const existing = groupMap.get(author.id);
    if (existing) {
      existing.stories.push(story);
      existing.latestAt = story.createdAt; // 昇順ゆえ最後に積んだものが最新
    } else {
      groupMap.set(author.id, { author, stories: [story], latestAt: story.createdAt });
    }
  }

  // 最新ストーリーが新しい投稿者順に並べる。
  return [...groupMap.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}
