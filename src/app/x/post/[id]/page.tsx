import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPostById } from '../../xPosts';
import { XPostDetail } from '../../XPostDetail';

// 本文の整形：改行→空白、連続空白圧縮、maxLen でトリム（title/description 用）。
function excerpt(body: string | null, maxLen: number): string {
  const s = (body ?? '').replace(/\s+/g, ' ').trim();
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

// 投稿ごとの個別 metadata / OGP。fetchPostById は cache() 済みで page 本体とフェッチを共有する。
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchPostById(id);
  if (!post) return {}; // page 側で notFound

  const name = post.author?.displayName ?? 'fukuX';
  const handle = post.author?.handle ? `@${post.author.handle}` : '';
  const head = excerpt(post.body, 40) || '投稿';
  const title = `${name}(${handle})さん: ${head}｜fukuX`;
  const description =
    excerpt(post.body, 110) ||
    `${name}さんのfukuX投稿。メンズエステ専用SNS「fukuX」で写メ日記やタイムラインをチェック。`;
  // 投稿画像はSupabase Storageの絶対URL。無ければ共通OGP（相対＝metadataBaseで解決）。
  const image = post.images?.[0] ?? '/ogp-fukux.png';

  return {
    title,
    description,
    alternates: { canonical: `/x/post/${id}` },
    openGraph: {
      title,
      description,
      url: `/x/post/${id}`,
      siteName: 'fukuX',
      images: [{ url: image }],
      locale: 'ja_JP',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

// 他の fukuX 動的ページ（/x/u/[handle] 等）と同じく動的レンダリングに揃える。
// 以前は revalidate + generateStaticParams で ISR 化していたが、本番のビルド時静的生成/ISR
// レンダリングパスで Server Components render error となり投稿詳細が全件 500 になっていた
// （dev は常にオンデマンドのため露呈しなかった）。force-dynamic でオンデマンド実行に固定する。
// リプライ一覧・いいね/フォロー状態など本人依存・動的な部分は XPostDetail がクライアントで取得する。
export const dynamic = 'force-dynamic';

export default async function XPostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parent = await fetchPostById(id);
  if (!parent) notFound();
  return <XPostDetail parent={parent} />;
}
