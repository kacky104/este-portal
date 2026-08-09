import { createPublicClient } from '@/app/lib/supabase/public';
import { hpSiteKeyColumn, normalizeHpSiteKey } from '@/app/lib/hpSite';

// 店舗の独自ドメイン用 sitemap.xml（2026-08-09 段階3）。
// 公式HPは1ページ構成なのでトップ1件のみ。マルチページ化（THERAPIST/SYSTEM/SCHEDULE の分割）を
// したらここに足す。公開前・暫定URLでは空のサイトマップを返す（存在はするが中身なし）。

export const revalidate = 600;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = normalizeHpSiteKey(slug);

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_sites')
    .select('status, domain, updated_at')
    .eq(hpSiteKeyColumn(key), key)
    .maybeSingle();

  const domain = data?.domain ? normalizeHpSiteKey(String(data.domain)) : null;
  const publish = !!domain && data?.status === 'live' && key === domain;

  const lastmod = String(data?.updated_at ?? '').slice(0, 10);
  const entries = publish
    ? `  <url>\n    <loc>https://${domain}/</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>\n`
    : '';

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries +
    '</urlset>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
