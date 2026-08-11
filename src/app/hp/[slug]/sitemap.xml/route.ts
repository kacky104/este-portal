import { createPublicClient } from '@/app/lib/supabase/public';
import { hpSiteKeyColumn, normalizeHpSiteKey, sanitizeHpBlocks } from '@/app/lib/hpSite';

// 店舗の独自ドメイン用 sitemap.xml（2026-08-09 段階3 → 2026-08-11 マルチページ対応）。
//
// 出すのは「独自ドメイン接続済み × status=live × そのドメインでのアクセス」のときだけ。
// それ以外（制作中・暫定URL）は空のサイトマップを返す（ファイルは存在するが中身なし）。
//
// ★ ここは hpSitePaths() を使わない。
//   hpSitePaths() は「ISRキャッシュを消す対象」なので条件で絞ってはいけないのに対し、
//   サイトマップは逆に「実際に 200 で見えるページだけ」を載せる必要がある（別物）。
// ★ 利用規約（/terms）は全店同じ文面で常に noindex なので載せない。

export const revalidate = 600;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = normalizeHpSiteKey(slug);

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_sites')
    .select('salon_id, status, domain, blocks, updated_at')
    .eq(hpSiteKeyColumn(key), key)
    .maybeSingle();

  const domain = data?.domain ? normalizeHpSiteKey(String(data.domain)) : null;
  const publish = !!domain && data?.status === 'live' && key === domain;

  const paths: string[] = [];
  if (publish) {
    paths.push('/');
    const blocks = sanitizeHpBlocks(data?.blocks);
    if (blocks.multipage) {
      // 下層ページは「中身があるか」だけで 200/404 が決まる（各 page.tsx の条件と同じ）。
      // ブロックの ON/OFF は見ない（ON/OFF はトップに抜粋を出すかの意味。OFFでも下層は生きる）。
      // ★ /diary と /voice はここに載せない（常に noindex の一覧ページ。中身が iframe のため）。
      const salonId = Number(data?.salon_id);
      const [therapistRes, salonRes, newsRes] = await Promise.all([
        supabase.from('therapists').select('id', { count: 'exact', head: true }).eq('salon_id', salonId),
        supabase.from('salons').select('courses').eq('id', salonId).maybeSingle(),
        supabase
          .from('announcements')
          .select('id', { count: 'exact', head: true })
          .eq('salon_id', salonId)
          .eq('is_published', true),
      ]);
      if ((therapistRes.count ?? 0) > 0) paths.push('/therapist');
      if ((newsRes.count ?? 0) > 0) paths.push('/news');
      const courses = (salonRes as { data: { courses?: unknown } | null }).data?.courses;
      const hasCourse =
        Array.isArray(courses) &&
        courses.some((c) => {
          const o = c as Record<string, unknown>;
          return String(o?.duration ?? '') !== '' && String(o?.price ?? '') !== '';
        });
      if (hasCourse) paths.push('/system');
    }
  }

  const lastmod = String(data?.updated_at ?? '').slice(0, 10);
  const entries = paths
    .map(
      (p) =>
        `  <url>\n    <loc>https://${domain}${p}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>\n`,
    )
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries +
    '</urlset>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
