import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { HpTemplate } from '@/app/hp/_templates/HpTemplate';

// 掲載店舗の公式ホームページ（2026-08-08 段階2）。
//
// - 暫定URL: fukues.com/hp/[slug]。段階3で独自ドメイン → このルートへ rewrite する
//   （src/proxy.ts にホスト名分岐を追加予定。ページ実装はそのまま使う）。
// - ISR 600秒。店舗の編集（写メ日記・出勤など）は既存の各テーブルを読むだけなので、
//   本体側の更新がそのまま反映される（最大10分遅れ）。
// - noindex: 暫定URL（fukues.com 配下）は検索に出さない。独自ドメイン接続（段階3）で
//   ドメイン側だけ index 許可に切り替える（fukues.com/hp/* は今後も noindex のまま＝重複回避）。
// - status ゲート: live のみ表示。draft/suspended は「準備中」ページ。
//   テスト時は SQL で status を切り替える: update salon_sites set status='live' where salon_id=◯;

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || data.site.status !== 'live') {
    return { title: '準備中', robots: { index: false, follow: false } };
  }
  const description =
    data.site.hero_catch ||
    (data.site.concept_text ? data.site.concept_text.slice(0, 80) : `${data.salon.name}の公式サイト`);
  return {
    title: `${data.salon.name}｜公式サイト`,
    description,
    robots: { index: false, follow: false }, // 暫定URLのため noindex（段階3で独自ドメインのみ解除）
  };
}

export default async function HpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data) notFound();

  if (data.site.status !== 'live') {
    // 準備中（draft）・停止中（suspended）は同じ見た目（外部に契約状況を漏らさない）。
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#17161a', color: '#948f85', fontSize: 13, letterSpacing: '.2em' }}>
        ただいま準備中です
      </div>
    );
  }

  return <HpTemplate data={data} />;
}
