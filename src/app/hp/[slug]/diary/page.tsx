import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { Crumb, SecHead } from '@/app/hp/_templates/parts';

// 写メ日記ページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /diary、暫定URLなら /hp/{slug}/diary
// - 中身は /embed/salon/{id}/diary の iframe（トップと同じ埋め込み・最大12件のグリッド）。
//   各サムネイルはフクエス本体の日記詳細を新しいタブで開く（埋め込み側の仕様）。
// - 出る条件: blocks.multipage が true ＋ 写メ日記ブロックが ON。
//   ★ therapist/system と違い、ここだけは ON/OFF を存在条件に使う。
//     日記の件数は iframe の向こう側にありサーバーから見えないため、
//     「中身があるか」で判定できない（OFF＝日記をHPに載せない意思表示、とみなす）。
// - ★ 常に noindex。iframe の中身（/embed/…）は noindex なので、検索エンジンから見ると
//   このページは本文ゼロの空箱。indexさせても薄いページとして評価を下げるだけ。
//   人がドロワーやフッターから開く一覧ページとしてだけ機能させる。sitemap にも載せない。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  if (!data.site.blocks.multipage) return false;
  return data.site.blocks.diary.on;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;
  return {
    title: `写メ日記｜${data.salon.name}`,
    robots: { index: false, follow: true }, // 冒頭コメント参照（本文が iframe のため常に noindex）
  };
}

export default async function HpDiaryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, basePath } = data;
  const homeHref = basePath || '/';

  return (
    <HpShell data={data} page="diary">
      <section id="diary" className="hp-sec hp-sec-diary" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="写メ日記" />
        <SecHead no="05" en="Diary" jp="写メ日記" />
        {/* トップ（480px）より高く取り、埋め込みのグリッド12件がスクロールなしで見えるように */}
        <iframe className="hp-embed" src={`/embed/salon/${salon.id}/diary`} title="写メ日記" style={{ height: 1100 }} />
        {/* 13件目以降はフクエス本体へ（実流入の導線。rel は noopener だけ＝計測を殺さない）。
            2本のリンクは div で1本ずつ包んで全ひな形で縦に並べる（A/Cの hp-more は inline-block のため） */}
        <div>
          <a className="hp-more" href={`${EMBED_SITE_URL}/salon/${salon.id}/diary`} target="_blank" rel="noopener">
            写メ日記をもっと見る →
          </a>
        </div>
        <div>
          <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
        </div>
      </section>
    </HpShell>
  );
}
