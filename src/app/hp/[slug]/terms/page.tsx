import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { HpTermsView, isHpTermsOpen } from '@/app/hp/_templates/subpages';

// 公式ホームページの利用規約ページ（2026-08-10 → 2026-08-11 外枠を HpShell に統一）。
//
// - URL: 独自ドメインなら /terms（proxy.ts が /hp/{host}/terms へ rewrite）
//        暫定URLなら /hp/{slug}/terms
// - 文面は全店共通（_lib/terms.ts）。店名だけ差し込む。
// - ★ 常に noindex。全店で同じ文面になるため、検索に載せると重複コンテンツになる。
//   ドロワーからのリンクで人が読めれば目的は果たせる（follow は許可してリンクは辿らせる）。
// - 見た目はひな形のCSSをそのまま使う。トップバーとフッターだけの簡素な作りで、
//   ドロワーは置かない（代わりに「ホームへ戻る」を上下に置く）＝ HpShell の chrome="doc"。
// - ★ ページの中身は _templates/subpages.tsx（デザインプレビューと共用）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
//   これが無いと revalidate が無視される（2026-08-11 追加。他のページには元から入っていた）。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpTermsOpen(data)) {
    return { title: '準備中', robots: { index: false, follow: false } };
  }
  return {
    title: `利用規約｜${data.salon.name}`,
    description: `${data.salon.name}のご利用にあたってのお願いと禁止事項です。当店は風俗店ではありません。`,
    robots: { index: false, follow: true },
  };
}

export default async function HpTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpTermsOpen(data)) notFound();
  return <HpTermsView data={data} />;
}
