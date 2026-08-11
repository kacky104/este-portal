import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA, hpSiteOrigin } from '@/app/hp/_lib/meta';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { Crumb, SecHead } from '@/app/hp/_templates/parts';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { paymentMethodLabel } from '@/app/lib/paymentMethods';

// 店舗情報ページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /info、暫定URLなら /hp/{slug}/info
// - 中身はフクエス本体の店舗情報（salons）そのもの＝二重入力なし。
//   トップの店舗情報セクション（住所・営業時間・アクセス・電話）に加えて、
//   エリア・定休日・支払い方法まで載せる「詳しい版」。
// - 出る条件: blocks.multipage が true のみ。店舗情報は常に中身がある（店名・エリアは
//   必須データ）ので、他ページのような「中身の有無」の判定は要らない。
// - サーバーが本文を描くページなので index 可・sitemap にも載せる。
//   独自ドメインでは LocalBusiness 系の構造化データも出す（店の公式サイトとしての基本情報）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  return data.site.blocks.multipage;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon } = data;
  return buildHpMetadata(data, slug, {
    title: `店舗情報・アクセス｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）の店舗情報です。` +
      [salon.address, salon.access, salon.hours ? `営業時間 ${salon.hours}` : '']
        .filter((v) => v !== '')
        .join('｜')
        .slice(0, 90),
    path: '/info',
  });
}

export default async function HpInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, basePath } = data;
  const homeHref = basePath || '/';
  // 構造化データは独自ドメインで公開しているときだけ（暫定URLは noindex なので不要）。
  const origin = hpSiteOrigin(data);
  const payments = salon.paymentMethods.map(paymentMethodLabel).join('・');

  return (
    <HpShell data={data} page="info">
      <section id="info" className="hp-sec hp-sec-info" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="店舗情報" />
        <SecHead no="12" en="Information" jp="店舗情報" />
        <dl className="hp-info">
          <div className="hp-info-row"><dt>店名</dt><dd>{salon.name}</dd></div>
          {salon.area && (<div className="hp-info-row"><dt>エリア</dt><dd>{salon.area}</dd></div>)}
          {salon.address && (<div className="hp-info-row"><dt>住所</dt><dd>{salon.address}</dd></div>)}
          {salon.access && (<div className="hp-info-row"><dt>アクセス</dt><dd>{salon.access}</dd></div>)}
          {salon.hours && (<div className="hp-info-row"><dt>営業時間</dt><dd>{salon.hours}</dd></div>)}
          {salon.closedDays && (<div className="hp-info-row"><dt>定休日</dt><dd>{salon.closedDays}</dd></div>)}
          {salon.phone && (
            <div className="hp-info-row"><dt>電話</dt><dd><a href={`tel:${salon.phone}`}>{salon.phone}</a></dd></div>
          )}
          {payments !== '' && (<div className="hp-info-row"><dt>支払い方法</dt><dd>{payments}</dd></div>)}
        </dl>
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString(
              buildBreadcrumbJsonLd(
                [{ name: salon.name, path: '/' }, { name: '店舗情報', path: '/info' }],
                { origin },
              ),
            ),
          }}
        />
      )}
      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString({
              // 店の公式サイトとしての基本情報。@id を自ドメインに固定することで、
              // フクエス本体の HealthAndBeautyBusiness とは別エンティティとして扱われる。
              '@context': 'https://schema.org/',
              '@type': 'HealthAndBeautyBusiness',
              '@id': `${origin}/#business`,
              name: salon.name,
              url: `${origin}/`,
              ...(salon.phone ? { telephone: salon.phone } : {}),
              ...(salon.address
                ? { address: { '@type': 'PostalAddress', streetAddress: salon.address, addressCountry: 'JP' } }
                : {}),
            }),
          }}
        />
      )}
    </HpShell>
  );
}
