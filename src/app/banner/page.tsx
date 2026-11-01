/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { BannerTagCode } from '@/app/components/BannerTagCode';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { bannerStackSnippet } from '@/app/lib/bannerTags';

// フクエス本体のリンクバナー案内ページ（fukuX版 /x/banner の本体テーマ版）。
// 静的コンテンツのみ・データ取得なし。画像は public/ 直下：
//   fukues-banner-300x60.png（カラー版）・fukues-banner-300x60-white.png（白基調版）
//
// サイズ改訂（2026-08-08）: 200×40 → 300×60。
//   ・旧 *-banner-200x40.png は public/ に残置＝すでに旧タグを貼っている店舗のバナーが404にならないようにする。
//   ・タグを変えても設置済み店舗には反映されないため、大きくしたい店舗には貼り替えを依頼すること。
//   ・画像の実体は 600×120（2倍解像度）を 300×60 で表示する。差し替えは同じファイル名で上書きするだけ。
// 設置報告は本体テーマの /banner/report（2026-08-08 新設。保存先は fukuX と共通の banner_reports）。
export const metadata: Metadata = {
  title: 'リンクバナーについて｜フクエス',
  description: '福岡メンズエステ情報・口コミポータル「フクエス」のリンクバナーと貼り付け用タグのご案内。3つのバナー設置で店舗一覧・店舗詳細ページに無料掲載できます。',
  alternates: { canonical: '/banner' },
};

const SITE_URL = 'https://fukues.com';

// バナー（300×60）。public/ 直下に配置した画像を参照する。
// 1番目＝フクエス本体・2番目＝フクエスワーク（求人）・3番目＝fukuX（SNS・カラー版（紫）のみ。
// 白基調版の配布は fukuX 側 /x/banner に任せる）。各サイトの配布ページで相互掲載（順序は各サイト優先）。
const BANNERS = [
  {
    file: 'fukues-banner-300x60.png',
    label: 'フクエス（本体）',
    href: `${SITE_URL}/`,
    alt: 'フクエス｜福岡メンズエステ情報・口コミポータル',
  },
  {
    file: 'fukuwork-banner-300x60.png',
    label: 'フクエスワーク（求人）',
    href: `${SITE_URL}/jobs`,
    alt: 'フクエスワーク｜福岡メンズエステのセラピスト求人サイト',
  },
  {
    file: 'fukux-banner-300x60.png',
    label: 'fukuX（SNS）',
    href: `${SITE_URL}/x`,
    alt: 'fukuX(フクエックス)｜福岡メンズエステ専用SNS',
  },
] as const;

// 外部サイト貼り付け用タグ。画像は直リンク参照可（ダウンロードして設置してもOK）。
function bannerTag(b: (typeof BANNERS)[number]): string {
  return `<a href="${b.href}" target="_blank" rel="noopener"><img src="${SITE_URL}/${b.file}" width="300" height="60" alt="${b.alt}" loading="lazy" style="border:0;"></a>`;
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
            フクエスはリンクフリーです。事前のご連絡なしでリンクしていただけます。
            店舗様の公式ホームページやブログからは、下のバナーをお使いください。
          </p>

          {/* ── 無料掲載の案内（2026-11-01 第1706便）──
              3つ設置＝無料掲載。掲載内容は 店舗一覧の店舗カード（無料枠）＋店舗詳細ページ（無料）。
              以前の「テキストのみ」から広がったので、ここで先に見せる。 */}
          <div className="mt-4 rounded-2xl border border-pink-100 bg-pink-50/50 px-4 py-3">
            <p className="text-sm font-bold text-slate-800 mb-1.5">バナーを3つ設置すると、無料で掲載できます</p>
            <p className={P}>
              フクエス・フクエスワーク・fukuX の3つのバナーを公式ホームページに設置し、
              <a href="/banner/report" className="text-pink-600 hover:underline">設置報告</a>
              をいただいた店舗様は、次の内容を無料で掲載します。
            </p>
            <ul className={`${UL} mt-1.5`}>
              <li>
                <a href="/salons" className="text-pink-600 hover:underline">店舗一覧</a>
                の店舗カード（無料枠）
              </li>
              <li>店舗詳細ページ（無料）</li>
              <li>fukuX のお店アカウントには、お店カード画像＋4枚の特典</li>
            </ul>
          </div>

          {BANNERS.map((b) => (
            <section key={b.file}>
              <h2 className={H2}>{b.label}（300×60）</h2>
              {/* プレビュー：輪郭が出るよう枠線つきの面に載せる。 */}
              <div className="inline-block p-4 rounded-xl bg-slate-50 border border-slate-200">
                <img
                  src={`/${b.file}`}
                  alt={b.alt}
                  width={300}
                  height={60}
                  className="block border border-slate-200"
                />
              </div>
              <BannerTagCode tag={bannerTag(b)} accent="pink" />
            </section>
          ))}

          {/* ── 3つまとめて貼るスニペット（2026-08-08 追加）──
              無料掲載の条件が「3サイトすべて設置」なので、1回のコピーで済むほうが離脱が少ない。
              包み方（縦積み・8px）は lib/bannerTags.ts に集約。 */}
          <h2 className={H2}>3つまとめて貼る場合</h2>
          <p className={P}>
            下のコードを1か所に貼ると、3つのバナーが縦に並びます。
            <strong className="text-slate-800">無料掲載をご希望の店舗様はこちらが便利です。</strong>
          </p>
          <BannerTagCode tag={bannerStackSnippet(BANNERS.map(bannerTag))} accent="pink" label="3つまとめてコピー" />

          {/* ── 設置後のご報告（2026-08-08 復活）──
              3サイト設置＝無料掲載（店舗カード（無料枠）＋店舗詳細ページ）の条件なので、報告導線をここにも置く。
              リンク先は本体テーマの /banner/report（fukuX版 /x/banner/report とはUIのみ別・保存先は共通）。 */}
          <h2 className={H2}>設置後のご報告</h2>
          <p className={P}>
            バナーを設置したら、下のフォームから設置したページのURLをお知らせください。
            当事務局で確認でき次第、
            <a href="/salons" className="text-pink-600 hover:underline">店舗一覧</a>
            と店舗詳細ページに無料で掲載します。
          </p>
          <a
            href="/banner/report"
            className="inline-block mt-3 px-5 py-2.5 rounded-full bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors shadow-sm shadow-pink-500/20"
          >
            設置を報告する →
          </a>

          <h2 className={H2}>ご利用にあたって</h2>
          <ul className={UL}>
            <li>画像はタグでの直接参照のほか、ダウンロードして設置していただいても構いません。</li>
            <li>画像の改変（文字の変更・切り抜き・色調変更など）はご遠慮ください。</li>
            <li>18歳未満向けのサイト、法令や公序良俗に反するサイトからのリンクはお断りします。</li>
            <li>バナー画像は予告なく差し替えることがあります。</li>
            <li>掲載期間中はバナーの設置継続をお願いします。確認できなくなった場合、掲載を終了することがあります。</li>
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
