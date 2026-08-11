import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA, hpSiteOrigin } from '@/app/hp/_lib/meta';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { Crumb, SecHead } from '@/app/hp/_templates/parts';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// お知らせページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /news、暫定URLなら /hp/{slug}/news
// - 出る条件: blocks.multipage が true ＋ 公開中のお知らせが1件以上。
//   ★ ブロックの ON/OFF は見ない（ON/OFF はトップに抜粋を出すかの意味。他ページと同じ）。
// - 中身は announcements（フクエスのマイページで書いたお知らせ）そのもの＝二重入力なし。
//   data.ts が最新20件まで取り、トップは先頭3件・ここは全件を出す。
// - サーバーが本文を描くページなので、/therapist・/system と同じく index 可
//   （実際に載るのは独自ドメイン運用の店だけ。判定は buildHpMetadata）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  if (!data.site.blocks.multipage) return false;
  return data.news.length > 0; // ON/OFF ではなく中身の有無
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon, news } = data;
  return buildHpMetadata(data, slug, {
    title: `お知らせ｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）からのお知らせ一覧です。` +
      (news[0] ? `最新: ${news[0].title.slice(0, 40)}` : ''),
    path: '/news',
  });
}

export default async function HpNewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, news, basePath } = data;
  const homeHref = basePath || '/';
  // 構造化データは独自ドメインで公開しているときだけ（暫定URLは noindex なので不要）。
  const origin = hpSiteOrigin(data);

  return (
    <HpShell data={data} page="news">
      <section id="news" className="hp-sec hp-sec-news" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="お知らせ" />
        <SecHead no="08" en="News" jp="お知らせ" />
        {news.map((n) => (
          <div key={n.id} className="hp-card">
            <div className="hp-card-title">{n.title}</div>
            <div className="hp-card-body">{n.content}</div>
            {n.createdAt && <div className="hp-card-meta">{n.createdAt.slice(0, 10).replaceAll('-', '/')}</div>}
          </div>
        ))}
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString(
              buildBreadcrumbJsonLd(
                [{ name: salon.name, path: '/' }, { name: 'お知らせ', path: '/news' }],
                { origin },
              ),
            ),
          }}
        />
      )}
    </HpShell>
  );
}
