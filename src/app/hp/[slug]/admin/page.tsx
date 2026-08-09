import { headers } from 'next/headers';
import { normalizeHpSiteKey } from '@/app/lib/hpSite';
import { HpAdminApp } from './HpAdminApp';

// 掲載店舗の公式ホームページ管理画面（2026-08-09 段階3）。
//
// 入り口は【店舗の独自ドメイン/admin】。src/proxy.ts が
//   https://example-shop.com/admin → /hp/example-shop.com/admin
// へ rewrite するため、[slug] にはドメインが入る。
// ドメイン接続前は fukues.com/hp/{slug}/admin でも同じ画面が開く（制作中の確認用）。
//
// 認証・認可はすべて Server Action（actions/hpAdmin.ts の resolveAccess）側で行う。
// このページは URLキーを渡すだけで、権限判定の結果に応じて
// ログインフォーム / ギャラリー / 編集パネル を出し分けるのは HpAdminApp（クライアント）。

export const dynamic = 'force-dynamic';

export default async function HpAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 「ページを見る」のリンク先。店舗ドメインで開いていれば '/'（proxy が rewrite するため
  // 店舗ドメイン側の /hp/... は 404 になる）、fukues.com 経由なら /hp/{key}。
  const h = await headers();
  const host = normalizeHpSiteKey((h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0]);
  const viaOwnDomain = host !== '' && host === normalizeHpSiteKey(slug);

  return <HpAdminApp siteKey={slug} previewHref={viaOwnDomain ? '/' : `/hp/${slug}`} />;
}
