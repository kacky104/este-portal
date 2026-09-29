'use server';

import { createClient } from '@/app/lib/supabase/server';
import { fetchShopMiniByIds } from './xAffiliation';
import type { XKind } from './xProfile';
import type { XPost } from './xPosts';

// ★★ 第986便（2026-09-29・カッキーさん）: fukuX 検索（ユーザー・投稿）の読み込みを【サーバー側】で行う。
// ★ 中身は XSearch.tsx にあった処理そのまま（アプリ内ブラウザで読み込みが止まる事故の対策）。公開データ＋RLS はそのまま。
const LIMIT = 50;


const POST_COLS =
  'id, author_profile_id, body, images, like_count, reply_count, replies_disabled, link_url, edited_at, created_at';

// ilike のワイルドカード（% _ \）をエスケープし、入力を「部分一致の literal」として扱う。
// .or() は使わず handle / display_name を別々の .ilike() で引いてマージするため、
// カンマ・カッコ等で .or() フィルタ文字列が壊れる事故が起きない（パターンは値として渡る）。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

type ProfRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  kind: 'user' | 'therapist' | 'shop' | 'official';
  is_verified: boolean;
  status: string;
  affiliated_shop_id: string | null;
};

export type Hit = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  kind: 'user' | 'therapist' | 'shop' | 'official';
  isVerified: boolean;
  affiliatedShop: { handle: string; displayName: string } | null;
};

const SELECT = 'id, handle, display_name, avatar_url, kind, is_verified, status, affiliated_shop_id';

// handle / display_name を部分一致（ilike）で検索。BAN(status='rejected')は除外。
// 2クエリ（handle / 表示名）を投げて id でマージ・重複除去し、handle 昇順で返す。所属バッジも解決。
export async function searchXProfiles(raw: string): Promise<Hit[]> {
  const supabase = await createClient();
  const kw = raw.trim();
  if (!kw) return [];
  const pattern = `%${escapeLike(kw)}%`;

  const [byHandle, byName] = await Promise.all([
    supabase.from('x_profiles').select(SELECT).ilike('handle', pattern).neq('status', 'rejected').limit(LIMIT),
    supabase.from('x_profiles').select(SELECT).ilike('display_name', pattern).neq('status', 'rejected').limit(LIMIT),
  ]);

  const map = new Map<string, ProfRow>();
  [...((byHandle.data ?? []) as ProfRow[]), ...((byName.data ?? []) as ProfRow[])].forEach((r) => {
    if (!map.has(r.id)) map.set(r.id, r);
  });
  const rows = [...map.values()].sort((a, b) => a.handle.localeCompare(b.handle)).slice(0, LIMIT);

  // セラピストの所属先バッジを1クエリで解決（N+1回避）。
  const shopDict = await fetchShopMiniByIds(supabase, rows.map((r) => r.affiliated_shop_id));

  return rows.map((r) => {
    const shop = r.affiliated_shop_id ? shopDict.get(r.affiliated_shop_id) : undefined;
    return {
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      kind: r.kind,
      isVerified: Boolean(r.is_verified),
      affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
    };
  });
}

type PostRow = {
  id: string | number;
  author_profile_id: string;
  body: string | null;
  images: string[] | null;
  like_count: number | null;
  reply_count: number | null;
  replies_disabled: boolean | null;
  link_url: string | null;
  edited_at: string | null;
  created_at: string;
};

// 投稿本文検索：x_posts.body を部分一致（ilike）。通常投稿のみ（parent_post_id IS NULL）・新しい順・上限。
// 著者を1クエリ合流し rejected(BAN) 著者の投稿は除外（既存 attachAuthors と同方針）。所属バッジも解決。
export async function searchXPosts(raw: string): Promise<XPost[]> {
  const supabase = await createClient();
  const kw = raw.trim();
  if (!kw) return [];
  const pattern = `%${escapeLike(kw)}%`;

  const { data: rows } = await supabase
    .from('x_posts')
    .select(POST_COLS)
    .ilike('body', pattern)
    .is('parent_post_id', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  const list = (rows ?? []) as PostRow[];
  if (list.length === 0) return [];

  const authorIds = [...new Set(list.map((r) => r.author_profile_id).filter(Boolean))];
  const { data: profs } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, kind, avatar_url, status, is_verified, affiliated_shop_id, address')
    .in('id', authorIds);

  const dict = new Map<
    string,
    {
      handle: string;
      display_name: string;
      kind: XKind;
      avatar_url: string | null;
      status: string;
      is_verified: boolean;
      affiliated_shop_id: string | null;
      address: string | null;
    }
  >();
  (profs ?? []).forEach((p) =>
    dict.set(p.id as string, {
      handle: (p.handle as string) ?? '',
      display_name: (p.display_name as string) ?? '',
      kind: ((p.kind as string) ?? 'user') as XKind,
      avatar_url: (p.avatar_url as string | null) ?? null,
      status: (p.status as string) ?? 'approved',
      is_verified: Boolean(p.is_verified),
      affiliated_shop_id: (p.affiliated_shop_id as string | null) ?? null,
      address: (p.address as string | null) ?? null,
    })
  );

  const shopDict = await fetchShopMiniByIds(supabase, [...dict.values()].map((a) => a.affiliated_shop_id));

  const out: XPost[] = [];
  for (const r of list) {
    const a = dict.get(r.author_profile_id);
    if (!a || a.status === 'rejected') continue; // BAN 著者の投稿は除外
    const shop = a.affiliated_shop_id ? shopDict.get(a.affiliated_shop_id) : undefined;
    out.push({
      id: String(r.id),
      body: r.body ?? null,
      images: r.images ?? [],
      likeCount: r.like_count ?? 0,
      replyCount: r.reply_count ?? 0,
      repliesDisabled: Boolean(r.replies_disabled),
      linkUrl: r.link_url ?? null,
      editedAt: r.edited_at ?? null,
      createdAt: r.created_at,
      author: {
        id: r.author_profile_id,
        handle: a.handle,
        displayName: a.display_name,
        kind: a.kind,
        avatarUrl: a.avatar_url,
        isVerified: a.is_verified,
        address: a.address,
        affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
      },
    });
  }
  return out;
}

// ユーザー / 投稿 の検索（公開・要ログインなし）。入力はデバウンス（300ms）。空文字では検索しない。
// キーワードはタブ間で共有。投稿タブはいいね/フォロー操作のため engagement を持つ（未ログインは認証モーダル）。
