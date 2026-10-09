import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpTemplate } from '@/app/hp/_templates/HpTemplate';
import { hpTopTitle, hpTopDescription } from '@/lib/hpSeo';

// 掲載店舗の公式ホームページ（2026-08-08 段階2 → 2026-08-09 段階3で独自ドメイン対応）。
//
// - URLキー [slug] は2種類:
//     'test-shop'        … 暫定URL fukues.com/hp/test-shop（salon_sites.slug）
//     'example-shop.com' … 独自ドメイン。src/proxy.ts がホスト名を入れて rewrite する
// - ISR 600秒。店舗の編集（写メ日記・出勤など）は既存の各テーブルを読むだけなので、
//   本体側の更新がそのまま反映される（最大10分遅れ）。
// - index/noindex: 独自ドメイン経由（キーがドメイン）かつ salon_sites.domain と一致する時だけ
//   index 許可。暫定URL（fukues.com/hp/*）は今後も noindex のまま＝重複回避。
//   canonical は常に独自ドメイン側へ向ける（両方から引けるため）。
// - status ゲート: live のみ表示。draft/suspended は「準備中」ページ。
//   テスト時は SQL で status を切り替える: update salon_sites set status='live' where salon_id=◯;

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || data.site.status !== 'live') return HP_NOT_PUBLIC_METADATA;

  // ★ 第1143便（カッキーさん）: トップの title は「店名｜（地域）のメンズエステ【公式】」。地域はフクエスに登録してある地域から自動で作る。
  //   説明文にも地域・業種・店名・アクセスを入れる（それまではお店の一言だけ＝短すぎた）。作り方は src/lib/hpSeo.ts。
  const description = hpTopDescription({
    salonName: data.salon.name,
    area: data.salon.area,
    address: data.salon.address, // ★ 第1373便: 「博多・天神・中洲」の店は住所から地域の言葉を決める
    access: data.salon.access,
    heroCatch: data.site.hero_catch,
    concept: data.site.concept_text,
  });

  // index/noindex・canonical・ファビコンの判定は _lib/meta.ts に集約（下層ページと共通）。
  return buildHpMetadata(data, slug, {
    title: hpTopTitle(data.salon.name, data.salon.area, data.salon.address),
    description,
    path: '',
  });
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
