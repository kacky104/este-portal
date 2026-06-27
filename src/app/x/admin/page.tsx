import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { XAdmin, type PendingShop, type ModPost, type ModProfile } from './XAdmin';

export const dynamic = 'force-dynamic';

export default async function XAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 運営のみ。非運営には管理URLの存在を隠すため 404。
  if (!user || user.id !== ADMIN_UUID) notFound();

  // 承認待ち店舗・最近の投稿・最近のプロフィールをまとめて取得。
  const [pendingRes, postRes, profRes] = await Promise.all([
    supabase
      .from('x_profiles')
      .select('id, handle, display_name, bio, avatar_url, created_at')
      .eq('kind', 'shop')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('x_posts')
      .select('id, author_profile_id, body, images, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('x_profiles')
      .select('id, handle, display_name, kind, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const pending = (pendingRes.data ?? []) as PendingShop[];
  const profiles = (profRes.data ?? []) as ModProfile[];

  // 投稿に投稿主名を辞書引きで合流（N+1回避）。モデレーションなので全 status 対象。
  type PostRow = {
    id: string;
    author_profile_id: string;
    body: string | null;
    images: string[] | null;
    created_at: string;
  };
  const postRows = (postRes.data ?? []) as PostRow[];
  const authorIds = [...new Set(postRows.map((r) => r.author_profile_id).filter(Boolean))];
  const authorDict = new Map<string, { handle: string; display_name: string }>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from('x_profiles')
      .select('id, handle, display_name')
      .in('id', authorIds);
    (authors ?? []).forEach((a) =>
      authorDict.set(a.id as string, {
        handle: (a.handle as string) ?? '',
        display_name: (a.display_name as string) ?? '',
      })
    );
  }
  const posts: ModPost[] = postRows.map((r) => ({
    id: String(r.id),
    body: r.body ?? null,
    images: r.images ?? [],
    createdAt: r.created_at,
    authorHandle: authorDict.get(r.author_profile_id)?.handle ?? '',
    authorName: authorDict.get(r.author_profile_id)?.display_name ?? '(不明)',
  }));

  return <XAdmin pending={pending} posts={posts} profiles={profiles} />;
}
