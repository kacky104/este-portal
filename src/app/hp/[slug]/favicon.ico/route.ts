import { NextResponse } from 'next/server';
import { createPublicClient } from '@/app/lib/supabase/public';
import { hpSiteKeyColumn, normalizeHpSiteKey } from '@/app/lib/hpSite';

// 店舗の独自ドメイン用 favicon.ico（2026-08-09 段階4）。
// proxy.ts が example-shop.com/favicon.ico → /hp/example-shop.com/favicon.ico へ rewrite する。
// 店舗が favicon_url を設定していればそこへ 302（Storage の公開URL）。
// 未設定ならフクエス本体のファビコンへフォールバック（従来の見え方と同じ）。
// ※ ページ側の <link rel="icon"> が主経路で、こちらは直接 /favicon.ico を叩く
//   ブラウザ既定動作・ブックマーク・一部クローラー向けの保険。

export const revalidate = 3600;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = normalizeHpSiteKey(slug);

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('salon_sites')
    .select('favicon_url')
    .eq(hpSiteKeyColumn(key), key)
    .maybeSingle();

  const url = (data?.favicon_url as string | undefined) || 'https://fukues.com/favicon.ico';
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
