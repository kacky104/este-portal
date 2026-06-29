import { notFound } from 'next/navigation';
import { fetchPostById } from '../../xPosts';
import { XPostDetail } from '../../XPostDetail';

// ISR：10分ごとに再生成（親投稿はキャッシュ可）。Next 16 では revalidate を効かせるため
// generateStaticParams（空配列）が必須。dynamicParams は既定 true（初回アクセス時にその場生成）。
// リプライ一覧・いいね/フォロー状態など本人依存・動的な部分は XPostDetail がクライアントで取得する
// （cookies を読まない＝この server page は動的化されず ISR が効く）。
export const revalidate = 600;

export async function generateStaticParams() {
  return [];
}

export default async function XPostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parent = await fetchPostById(id);
  if (!parent) notFound();
  return <XPostDetail parent={parent} />;
}
