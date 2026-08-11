import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA, hpSiteOrigin } from '@/app/hp/_lib/meta';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { Crumb, SecHead, TherapistCards } from '@/app/hp/_templates/parts';
import { buildBreadcrumbJsonLd, buildItemListJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';

// セラピスト一覧ページ（2026-08-11 マルチページ化）。
//
// - URL: 独自ドメインなら /therapist、暫定URLなら /hp/{slug}/therapist
// - 出る条件: blocks.multipage が true ＋ 在籍1名以上。
//   ★ ブロックの ON/OFF は見ない。マルチページ時の ON/OFF は「トップに抜粋を出すか」だけの
//     意味で、OFF＝トップに載せない店でもこのページとメニューの導線は残る（2026-08-11）。
//   中身が無ければ 404（空ページを検索に出さないため）。
// - セラピストの個別ページは公式HP側には作らない。カードのリンク先はフクエス本体の
//   /therapist/{id}（本体と内容が重複せず、HPからフクエスへの実流入にもなる）。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  if (!data.site.blocks.multipage) return false;
  return data.therapists.length > 0; // ON/OFF ではなく中身の有無（冒頭コメント参照）
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon, therapists } = data;
  return buildHpMetadata(data, slug, {
    title: `セラピスト一覧｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）に在籍するセラピスト${therapists.length}名の一覧です。` +
      '写真・年齢・ひとことプロフィールからお選びいただけます。',
    path: '/therapist',
  });
}

export default async function HpTherapistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, therapists, basePath } = data;
  const homeHref = basePath || '/';
  // 構造化データは独自ドメインで公開しているときだけ（暫定URLは noindex なので不要）。
  // ★ origin を必ず渡すこと。省略すると fukues.com の絶対URLになり、canonical と食い違う。
  const origin = hpSiteOrigin(data);

  return (
    <HpShell data={data} page="therapist">
      <section id="therapist" className="hp-sec hp-sec-therapists" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="セラピスト" />
        <SecHead no="03" en="Therapist" jp="セラピスト" />
        <TherapistCards therapists={therapists} />
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString(
              buildBreadcrumbJsonLd(
                [{ name: salon.name, path: '/' }, { name: 'セラピスト', path: '/therapist' }],
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
            __html: toJsonLdString(
              // 順序・件数は画面に出しているカードと同じにすること（非表示コンテンツはNG）。
              // ★ セラピストの個別ページは公式HP側に無くフクエス本体にあるので、
              //   この ItemList だけは origin が本体（fukues.com）になる。
              buildItemListJsonLd(
                therapists.map((t) => ({ name: t.name, path: `/therapist/${t.id}` })),
                { name: `${salon.name} セラピスト一覧`, origin: EMBED_SITE_URL },
              ),
            ),
          }}
        />
      )}
    </HpShell>
  );
}
