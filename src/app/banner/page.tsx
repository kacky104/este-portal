/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { BannerTagCode } from '@/app/components/BannerTagCode';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';

// フクエス本体のリンクバナー案内ページ（fukuX版 /x/banner の本体テーマ版）。
// 静的コンテンツのみ・データ取得なし。画像は public/ 直下：
//   fukues-banner-200x40.png（カラー版）・fukues-banner-200x40-white.png（白基調版）
// 設置報告は本体テーマの /banner/report（2026-08-08 新設。保存先は fukuX と共通の banner_reports）。
export const metadata: Metadata = {
  title: 'リンクバナーについて｜フクエス',
  description: '福岡メンズエステ情報・口コミポータル「フクエス」のリンクバナーと貼り付け用HTMLタグのご案内です。リンクはご自由にどうぞ。',
  alternates: { canonical: '/banner' },
};

const SITE_URL = 'https://fukues.com';

// バナー（200×40）。public/ 直下に配置した画像を参照する。
// 1番目＝フクエス本体・2番目＝フクエスワーク（求人）・3番目＝fukuX（SNS・カラー版（紫）のみ。
// 白基調版の配布は fukuX 側 /x/banner に任せる）。各サイトの配布ページで相互掲載（順序は各サイト優先）。
const BANNERS = [
  {
    file: 'fukues-banner-200x40.png',
    label: 'フクエス（本体）',
    href: `${SITE_URL}/`,
    alt: 'フクエス｜福岡メンズエステ情報・口コミポータル',
  },
  {
    file: 'fukuwork-banner-200x40.png',
    label: 'フクエスワーク（求人）',
    href: `${SITE_URL}/jobs`,
    alt: 'フクエスワーク｜福岡メンズエステのセラピスト求人サイト',
  },
  {
    file: 'fukux-banner-200x40.png',
    label: 'fukuX（SNS）',
    href: `${SITE_URL}/x`,
    alt: 'fukuX(フクエックス)｜福岡メンズエステ専用SNS',
  },
] as const;

// 外部サイト貼り付け用タグ。画像は直リンク参照可（ダウンロードして設置してもOK）。
function bannerTag(b: (typeof BANNERS)[number]): string {
  return `<a href="${b.href}" target="_blank" rel="noopener"><img src="${SITE_URL}/${b.file}" width="200" height="40" alt="${b.alt}" loading="lazy" style="border:0;"></a>`;
}

const H2 = 'text-base font-bold text-slate-800 mt-6 mb-2';
const P = 'text-sm text-slate-600 leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed';

export default function BannerPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ─── Header（本体共通構成の簡易版） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center">
          <Logo />
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4">
        <div className="my-6 p-6 rounded-2xl bg-white border border-pink-100 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-4">リンクバナーについて</h1>

          <p className={P}>
            フクエスはリンクフリーです。事前のご連絡は不要です。店舗様の公式サイトやブログ等からのリンクの際は、下記のバナーをご利用ください。求人サイト「フクエスワーク」・専用SNS「fukuX」のバナーも併せてご利用いただけます。リンク先はそれぞれのタグに記載のURLでお願いします。
          </p>

          {BANNERS.map((b) => (
            <section key={b.file}>
              <h2 className={H2}>{b.label}（200×40）</h2>
              {/* プレビュー：輪郭が出るよう枠線つきの面に載せる。 */}
              <div className="inline-block p-4 rounded-xl bg-slate-50 border border-slate-200">
                <img
                  src={`/${b.file}`}
                  alt={b.alt}
                  width={200}
                  height={40}
                  className="block border border-slate-200"
                />
              </div>
              <BannerTagCode tag={bannerTag(b)} accent="pink" />
            </section>
          ))}

          {/* ── 設置後のご報告（2026-08-08 復活）──
              3サイト設置＝無料掲載（/salons テキスト掲載）の条件なので、報告導線をここにも置く。
              リンク先は本体テーマの /banner/report（fukuX版 /x/banner/report とはUIのみ別・保存先は共通）。 */}
          <h2 className={H2}>設置後のご報告</h2>
          <p className={P}>
            バナーを設置いただいたら、下記フォームからご報告ください。フクエス・フクエスワーク・fukuX の3つすべてを設置いただいた店舗様は、
            <a href="/listing" className="text-pink-600 hover:underline">無料で店舗一覧に掲載</a>
            できます（fukuXのお店アカウントには、お店カード画像+4枚の特典もございます）。
          </p>
          <a
            href="/banner/report"
            className="inline-block mt-3 px-5 py-2.5 rounded-full bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors shadow-sm shadow-pink-500/20"
          >
            設置を報告する →
          </a>

          <h2 className={H2}>ご利用にあたって</h2>
          <ul className={UL}>
            <li>バナー画像は上記タグでの直接参照のほか、ダウンロードして貴サイトに設置していただいても構いません。</li>
            <li>バナー画像の改変（文字の変更、切り抜き、色調変更等）はご遠慮ください。</li>
            <li>18歳未満を対象とするサイト、法令または公序良俗に反するサイトからのリンクはお断りします。</li>
            <li>予告なくバナー画像を差し替える場合があります。</li>
          </ul>

          <p className={`${P} mt-6`}>
            お問い合わせ：フクエス運営事務局（
            <a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">
              info@fukues.com
            </a>
            ）
          </p>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <SiteFooter inner="max-w-5xl" />
    </div>
  );
}
