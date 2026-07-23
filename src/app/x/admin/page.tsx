import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getXAccountEmails } from '@/app/actions/xAdmin';
import { XAdmin, type ShopRow, type ModPost, type ModProfile, type BannerReportRow } from './XAdmin';

export const dynamic = 'force-dynamic';

// 管理ページのため検索インデックス対象外（noindex,nofollow）。
export const metadata = { robots: { index: false, follow: false } };

export default async function XAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 運営のみ。非運営には管理URLの存在を隠すため 404。
  if (!user || user.id !== ADMIN_UUID) notFound();

  // 認証バッジ管理用の店舗一覧・最近の投稿・最近のプロフィール（BAN/削除用）・バナー設定をまとめて取得。
  const [shopRes, postRes, profRes, bannerRes, reportRes] = await Promise.all([
    supabase
      .from('x_profiles')
      .select('id, handle, display_name, avatar_url, is_verified, banner_installed, status, created_at')
      .eq('kind', 'shop')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('x_posts')
      .select('id, author_profile_id, body, images, created_at, pinned_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('x_profiles')
      .select('id, auth_user_id, handle, display_name, kind, status, is_verified, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('x_banners').select('slot, image_url, link_url').order('slot', { ascending: true }),
    // リンクバナー設置報告（RLSでADMIN_UUIDのみ閲覧可）。未対応を上に・新着順。
    supabase
      .from('banner_reports')
      .select('id, salon_name, email, sites, page_url, x_handle, comment, status, created_at')
      .order('status', { ascending: false }) // 'open' > 'done'（文字列降順で open が先）
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const shops = (shopRes.data ?? []) as ShopRow[];
  // 一覧表示用（auth_user_id はメール解決にのみ使い、クライアントへは渡さない）。
  const profileRows = (profRes.data ?? []) as Array<ModProfile & { auth_user_id: string }>;
  const profiles: ModProfile[] = profileRows.map((p) => ({
    id: p.id,
    handle: p.handle,
    display_name: p.display_name,
    kind: p.kind,
    status: p.status,
    is_verified: p.is_verified,
    created_at: p.created_at,
  }));

  // 「アカウント」タブのログインメールを service_role で取得（運営のみ・DB保存なし）。
  // auth_user_id → email の辞書を引いてから profile.id → email に詰め替えてクライアントに渡す
  // （クライアントには auth_user_id を渡さず、必要な email のみを最小限で渡す）。
  const authIds = [...new Set(profileRows.map((p) => p.auth_user_id).filter(Boolean))];
  const emailByAuthId = await getXAccountEmails(authIds);
  const emails: Record<string, string> = {};
  for (const p of profileRows) {
    const e = emailByAuthId[p.auth_user_id];
    if (e) emails[p.id] = e;
  }

  // 投稿に投稿主名を辞書引きで合流（N+1回避）。モデレーションなので全 status 対象。
  type PostRow = {
    id: string;
    author_profile_id: string;
    body: string | null;
    images: string[] | null;
    created_at: string;
    pinned_at: string | null;
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
    pinnedAt: r.pinned_at ?? null,
    authorHandle: authorDict.get(r.author_profile_id)?.handle ?? '',
    authorName: authorDict.get(r.author_profile_id)?.display_name ?? '(不明)',
  }));

  // タイムラインバナー（5枠）。運営のアップロード先パスに使う auth uid も渡す。
  const banners = ((bannerRes.data ?? []) as Array<{ slot: number; image_url: string; link_url: string | null }>).map(
    (b) => ({ slot: Number(b.slot), image_url: b.image_url, link_url: b.link_url ?? null })
  );

  const reports = (reportRes.data ?? []) as BannerReportRow[];

  return (
    <XAdmin shops={shops} posts={posts} profiles={profiles} emails={emails} banners={banners} reports={reports} myAuthId={user.id} />
  );
}
