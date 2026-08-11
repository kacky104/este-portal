import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { Crumb, SecHead } from '@/app/hp/_templates/parts';

// 口コミページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /voice、暫定URLなら /hp/{slug}/voice
// - 中身は /embed/salon/{id}/reviews の iframe（トップと同じ埋め込み）。
//   「もっと見る」からフクエス本体の口コミ一覧へ遷移する（実流入の導線）。
// - 出る条件: blocks.multipage が true ＋ 口コミブロックが ON。
//   ★ diary と同じく、ここは ON/OFF を存在条件に使う（件数は iframe の向こう側で見えない）。
// - ★ 常に noindex。iframe の中身（/embed/…）は noindex なので、検索エンジンから見ると
//   このページは本文ゼロの空箱。人が開く一覧ページとしてだけ機能させ、sitemap にも載せない。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  if (!data.site.blocks.multipage) return false;
  return data.site.blocks.reviews.on;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;
  return {
    title: `口コミ｜${data.salon.name}`,
    robots: { index: false, follow: true }, // 冒頭コメント参照（本文が iframe のため常に noindex）
  };
}

export default async function HpVoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, basePath } = data;
  const homeHref = basePath || '/';

  return (
    <HpShell data={data} page="voice">
      <section id="voice" className="hp-sec hp-sec-reviews" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="口コミ" />
        <SecHead no="06" en="Voice" jp="口コミ" />
        {/* トップ（420px）より高く取って一覧として読めるように */}
        <iframe className="hp-embed" src={`/embed/salon/${salon.id}/reviews`} title="口コミ" style={{ height: 900 }} />
        {/* 続きはフクエス本体の口コミ一覧へ（rel は noopener だけ＝計測を殺さない）。
            2本のリンクは div で1本ずつ包んで全ひな形で縦に並べる */}
        <div>
          <a className="hp-more" href={`${EMBED_SITE_URL}/salon/${salon.id}/reviews`} target="_blank" rel="noopener">
            口コミをもっと見る →
          </a>
        </div>
        <div>
          <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
        </div>
      </section>
    </HpShell>
  );
}
