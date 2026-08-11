import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA, hpSiteOrigin } from '@/app/hp/_lib/meta';
import { groupCourses } from '@/app/hp/_lib/sections';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { CourseGroups, Crumb, SecHead } from '@/app/hp/_templates/parts';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// コース料金ページ（2026-08-11 マルチページ化）。
//
// - URL: 独自ドメインなら /system、暫定URLなら /hp/{slug}/system
//   （ヘッダーのナビ表記 SYSTEM に合わせた。/menu は飲食店と紛らわしく、
//    /price は検索語そのものだがURL内の単語が順位に効く度合いは今は小さい）
// - 出る条件: blocks.multipage が true ＋ コース登録1件以上。
//   ★ ブロックの ON/OFF は見ない。マルチページ時の ON/OFF は「トップに抜粋を出すか」だけの
//     意味で、OFF＝トップに載せない店でもこのページとメニューの導線は残る（2026-08-11）。
// - 料金の元データは salons.courses。公式HPのために二重入力させない。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  if (!data.site.blocks.multipage) return false;
  return groupCourses(data.courses).length > 0; // ON/OFF ではなく中身の有無（冒頭コメント参照）
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon, courses } = data;
  // 先頭のコースを1つだけ添える（金額の解釈はしない＝登録された文字列をそのまま使う）
  const head = courses[0];
  return buildHpMetadata(data, slug, {
    title: `コース料金｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）のコース料金一覧です。` +
      (head ? `${head.duration} ${head.price} など` : '') +
      `全${courses.length}コース、表示料金はすべて税込みです。`,
    path: '/system',
  });
}

export default async function HpSystemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, courses, basePath } = data;
  const grouped = groupCourses(courses);
  const homeHref = basePath || '/';
  // 構造化データは独自ドメインで公開しているときだけ（暫定URLは noindex なので不要）。
  // ★ origin を必ず渡すこと。省略すると fukues.com の絶対URLになり、canonical と食い違う。
  const origin = hpSiteOrigin(data);

  return (
    <HpShell data={data} page="system">
      <section id="menu" className="hp-sec hp-sec-courses" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="コース料金" />
        <SecHead no="02" en="Menu" jp="コース料金" />
        <CourseGroups grouped={grouped} />
        <p className="hp-note">※ 表示料金はすべて税込みです。</p>
        {(salon.hours || salon.phone) && (
          <dl className="hp-info">
            {salon.hours && (
              <div className="hp-info-row">
                <dt>受付時間</dt>
                <dd>{salon.hours}{salon.closedDays ? `（${salon.closedDays}）` : ''}</dd>
              </div>
            )}
            {salon.phone && (
              <div className="hp-info-row">
                <dt>ご予約</dt>
                <dd><a href={`tel:${salon.phone}`}>{salon.phone}</a></dd>
              </div>
            )}
          </dl>
        )}
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString(
              buildBreadcrumbJsonLd(
                [{ name: salon.name, path: '/' }, { name: 'コース料金', path: '/system' }],
                { origin },
              ),
            ),
          }}
        />
      )}
    </HpShell>
  );
}
