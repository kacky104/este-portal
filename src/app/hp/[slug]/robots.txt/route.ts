import { createPublicClient } from '@/app/lib/supabase/public';
import { hpSiteKeyColumn, normalizeHpSiteKey } from '@/app/lib/hpSite';

// 店舗の独自ドメイン用 robots.txt（2026-08-09 段階3）。
// proxy.ts が example-shop.com/robots.txt → /hp/example-shop.com/robots.txt へ rewrite する。
// 本体（fukues.com）の src/app/robots.ts とは別物：店舗ドメインでフクエスの
// sitemap や Disallow 一覧を出さないためにこちらを用意している。
//
// 公開（live）かつ独自ドメイン接続済みのときだけクロール許可。
// それ以外（制作中・暫定URL）は全面 Disallow にして検索に出さない。

export const revalidate = 600;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = normalizeHpSiteKey(slug);

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_sites')
    .select('status, domain')
    .eq(hpSiteKeyColumn(key), key)
    .maybeSingle();

  const domain = data?.domain ? normalizeHpSiteKey(String(data.domain)) : null;
  const allow = !!domain && data?.status === 'live' && key === domain;

  const body = allow
    ? [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        '',
        `Sitemap: https://${domain}/sitemap.xml`,
        '',
      ].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
