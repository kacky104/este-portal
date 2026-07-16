/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import { BannerTagCode } from '@/app/components/BannerTagCode';

// フクエスワークのリンクバナー案内ページ（fukuX版 /x/banner のワーク（緑）テーマ版）。
// ヘッダー・フッターは /jobs レイアウトを継承。静的コンテンツのみ・データ取得なし。
// 画像は public/ 直下：
//   fukuwork-banner-200x40.png（カラー版）・fukuwork-banner-200x40-white.png（白基調版）
// 設置報告は fukuX と共通の受付窓口 /x/banner/report（banner_reports.sites='work'）。
const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'リンクバナーについて';
const PAGE_DESC = '福岡メンズエステのセラピスト求人サイト「フクエスワーク」のリンクバナーと貼り付け用HTMLタグのご案内です。リンクはご自由にどうぞ。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/jobs/banner' },
  // openGraph/twitter を未定義のままだと layout のもの（og:title=ブランド名・og:url=/jobs）を丸ごと継承し、
  // シェア時にトップ扱いになるため、このページの title/url を明示する。
  // Next の metadata は浅いマージ＝layout の同キーを丸ごと上書きするため、画像・card 等もここで明示する。
  openGraph: {
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    url: `${SITE_URL}/jobs/banner`,
    siteName: 'フクエスワーク',
    type: 'website',
    images: [{ url: `${SITE_URL}/ogp-fukuwork.png` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    images: [`${SITE_URL}/ogp-fukuwork.png`],
  },
};

// バナー（200×40）。public/ 直下に配置した画像を参照する。
// 1番目＝フクエスワーク（求人）・2番目＝フクエス本体。両サイトの配布ページで相互掲載（順序は各サイト優先）。
const BANNERS = [
  {
    file: 'fukuwork-banner-200x40.png',
    label: 'フクエスワーク（求人）',
    href: `${SITE_URL}/jobs`,
    alt: 'フクエスワーク｜福岡メンズエステのセラピスト求人サイト',
  },
  {
    file: 'fukues-banner-200x40.png',
    label: 'フクエス（本体）',
    href: `${SITE_URL}/`,
    alt: 'フクエス｜福岡メンズエステ情報・口コミポータル',
  },
] as const;

// 外部サイト貼り付け用タグ。画像は直リンク参照可（ダウンロードして設置してもOK）。
function bannerTag(b: (typeof BANNERS)[number]): string {
  return `<a href="${b.href}" target="_blank" rel="noopener"><img src="${SITE_URL}/${b.file}" width="200" height="40" alt="${b.alt}" loading="lazy" style="border:0;"></a>`;
}

const H2 = 'text-base font-bold text-slate-800 mt-6 mb-2';
const P = 'text-sm text-slate-600 leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed';

export default function JobsBannerPage() {
  return (
    <main className="max-w-3xl mx-auto px-4">
      <div className="my-6 p-6 rounded-2xl bg-white border shadow-sm" style={{ borderColor: '#D6EFE0' }}>
        <h1 className="text-xl font-bold text-slate-900 mb-4">リンクバナーについて</h1>

        <p className={P}>
          フクエスワークはリンクフリーです。事前のご連絡は不要です。サロン様の公式サイトや求人ページ、ブログ等からのリンクの際は、下記のバナーをご利用ください。ポータル本体「フクエス」のバナーも併せてご利用いただけます。リンク先はそれぞれのタグに記載のURLでお願いします。
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
            <BannerTagCode tag={bannerTag(b)} accent="emerald" />
          </section>
        ))}

        {/* 「設置後のご報告（特典）」ブロックは特典内容が確定してから再掲する（2026-07-12 削除。
            報告フォーム /x/banner/report 自体は3サイト共通で稼働中）。 */}

        <h2 className={H2}>ご利用にあたって</h2>
        <ul className={UL}>
          <li>バナー画像は上記タグでの直接参照のほか、ダウンロードして貴サイトに設置していただいても構いません。</li>
          <li>バナー画像の改変（文字の変更、切り抜き、色調変更等）はご遠慮ください。</li>
          <li>18歳未満を対象とするサイト、法令または公序良俗に反するサイトからのリンクはお断りします。</li>
          <li>予告なくバナー画像を差し替える場合があります。</li>
        </ul>

        <p className={`${P} mt-6`}>
          お問い合わせ：フクエス運営事務局（
          <a href="mailto:info@fukues.com" className="hover:underline" style={{ color: '#059669' }}>
            info@fukues.com
          </a>
          ）
        </p>
      </div>
    </main>
  );
}
