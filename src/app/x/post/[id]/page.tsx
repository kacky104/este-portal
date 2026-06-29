import { notFound } from 'next/navigation';
import { fetchPostById } from '../../xPosts';
import { XPostDetail } from '../../XPostDetail';

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
