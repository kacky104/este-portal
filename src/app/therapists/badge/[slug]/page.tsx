import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/app/components/Logo';
import { TherapistSearch } from '@/app/components/TherapistSearch';
import { slugToBadge, badgeToSlug, BADGE_SLUG_LIST } from '@/lib/therapistBadgeSlugs';
import {
  getBadgeCategory,
  getBadgeColors,
  BADGES_BY_CATEGORY,
  BADGE_CATEGORY_LABELS,
} from '@/lib/therapistBadges';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { fetchTherapistPool } from '@/app/lib/therapistPool';
import { thirtyMinSeed } from '@/lib/shuffle';
import { SiteFooter } from '@/app/components/SiteFooter';

// ISR：10分ごとに再生成（/therapists と同じ方針）。
export const revalidate = 600;

// 全バッジ分のページをビルド時に事前生成。未知スラッグは page 側で notFound()。
export async function generateStaticParams() {
  return BADGE_SLUG_LIST.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const label = slugToBadge(slug);
  if (!label) return {};
  const title = `「${label}」のセラピスト｜福岡メンズエステ【フクエス】`;
  const description = `福岡のメンズエステで「${label}」が特徴のセラピスト一覧。エリアや他の特徴と掛け合わせて、好みのセラピストを探せます。`;
  return {
    title,
    description,
    // クエリ絞り込み（?b=,?area=）ではなく、この専用ページを正規URLとして個別インデックスさせる。
    alternates: { canonical: `/therapists/badge/${slug}` },
    // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
    // （og:image も消える）。そのため images まで全て明示する。
    openGraph: {
      title,
      description,
      url: `/therapists/badge/${slug}`,
      siteName: 'フクエス',
      type: 'website',
      images: [{ url: '/ogp.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/ogp.png'] },
  };
}

export default async function BadgeLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const label = slugToBadge(slug);
  if (!label) notFound();

  // 同カテゴリの他バッジ（相互リンク＝バッジ・クラスタのSEO強化）。
  const category = getBadgeCategory(label);
  const siblings = category ? BADGES_BY_CATEGORY[category].filter((b) => b !== label) : [];

  // 全アクティブセラピストをサーバーで取得し、初期HTMLにカード（リンク）を焼き込む（2026-08-05）。
  // バッジ絞り込みは lockedBadges として TherapistSearch 側で行う（従来と同じ）。
  const pool = await fetchTherapistPool({ activeOnly: true });
  const listSeed = thirtyMinSeed();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* シンプルヘッダー */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* パンくず的な戻り導線 */}
        <div className="mb-2 text-sm">
          <Link href="/therapists" className="text-slate-500 hover:text-pink-600">特徴からセラピストを探す</Link>
          <span className="text-slate-300 mx-1.5">/</span>
          <span className="text-slate-700">{label}</span>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
          <h1 className="text-xl font-bold text-slate-900">「{label}」のセラピスト</h1>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          福岡のメンズエステで「{label}」が特徴のセラピストを表示中。エリアや他の特徴を足してさらに絞り込めます。
        </p>

        {/* 関連する特徴（同カテゴリの他バッジ）への内部リンク。バッジ同士を相互リンクでクラスタ化しSEOを強化。 */}
        {category && siblings.length > 0 && (
          <nav aria-label="関連する特徴" className="mb-6">
            <p className="text-xs font-bold text-slate-500 mb-2">同じ「{BADGE_CATEGORY_LABELS[category]}」の特徴</p>
            <div className="flex flex-wrap gap-1.5">
              {siblings.map((b) => {
                const s = badgeToSlug(b);
                if (!s) return null;
                const c = getBadgeColors(b);
                return (
                  <Link
                    key={b}
                    href={`/therapists/badge/${s}`}
                    className="px-3 py-1 rounded-full text-xs font-bold border hover:opacity-80 transition-opacity"
                    style={c ? { background: c.fill, color: c.text, borderColor: c.border } : undefined}
                  >
                    {b}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {/* サーバー取得の initialList を渡してSSR描画。lockedBadges でこのバッジを固定。
            key={slug} でバッジ間遷移時に必ず作り直す（クライアント側 state の持ち越し防止）。
            useSearchParams をやめたので Suspense 境界は不要になった（2026-08-05）。 */}
        <TherapistSearch
          key={slug}
          lockedBadges={[label]}
          initialList={pool.list}
          initialSalonAreaMap={pool.salonAreaMap}
          initialSeed={listSeed}
        />
      </main>

      <SiteFooter inner="max-w-5xl" />
    </div>
  );
}
