'use server';

import { createClient } from '@/app/lib/supabase/server';
import { fetchShopMiniByIds } from './xAffiliation';
import type { XKind } from './xProfile';
import type { XPost } from './xPosts';

// ★★ 第986便（2026-09-29・カッキーさん）: 投稿詳細のリプライ一覧の読み込みを【サーバー側】で行う。
// ★ 中身は XPostDetail.tsx にあった処理そのまま（アプリ内ブラウザで読み込みが止まる事故の対策）。

const REPLY_COLS =
  'id, author_profile_id, body, images, like_count, reply_count, replies_disabled, link_url, edited_at, created_at';

type ReplyRow = {
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

// クライアントでリプライ行＋著者プロフィールを組み立てる（xPosts.ts はサーバー専用のため流用不可）。
// 1階層フラット：parent_post_id = 親ID の直下リプライのみを created_at 昇順で取得。
// BAN(status='rejected') の著者のリプライは除外（サーバー側 attachAuthors と同方針）。
export async function fetchXReplyThread(parentId: string): Promise<XPost[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('x_posts')
    .select(REPLY_COLS)
    .eq('parent_post_id', parentId)
    .order('created_at', { ascending: true });
  const list = (rows ?? []) as ReplyRow[];
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
      kind: (p.kind as XKind) ?? 'user',
      avatar_url: (p.avatar_url as string | null) ?? null,
      status: (p.status as string) ?? 'approved',
      is_verified: Boolean(p.is_verified),
      affiliated_shop_id: (p.affiliated_shop_id as string | null) ?? null,
      address: (p.address as string | null) ?? null,
    })
  );

  const shopDict = await fetchShopMiniByIds(
    supabase,
    [...dict.values()].map((a) => a.affiliated_shop_id)
  );

  const out: XPost[] = [];
  for (const r of list) {
    const a = dict.get(r.author_profile_id);
    if (!a || a.status === 'rejected') continue;
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

