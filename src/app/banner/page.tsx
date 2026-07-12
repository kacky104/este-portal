/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { BannerTagCode } from '@/app/components/BannerTagCode';

// フクエス本体のリンクバナー案内ページ（fukuX版 /x/banner の本体テーマ版）。
// 静的コンテンツのみ・データ取得なし。画像は public/ 直下：
//   fukues-banner-200x40.png（カラー版）・fukues-banner-200x40-white.png（白基調版）
// 設置報告は fukuX と共通の受付窓口 /x/banner/report（banner_reports.sites='fukues'）。
export const metadata: Metadata = {
  title: 'リンクバナーについて｜フクエス',
  description: '福岡メンズエステ情報・口コミポータル「フクエス」のリンクバナーと貼り付け用HTMLタグのご案内です。リンクはご自由にどうぞ。',
  alternates: { canonical: '/banner' },
};

const SITE_URL = 'https://fukues.com';

// バナー1種（200×40）。public/ 直下に配置した画像を参照する。
const BANNERS = [
  { file: 'fukues-banner-200x40.png', label: 'リンクバナー' },
] as const;

// 外部サイト貼り付け用タグ。画像は直リンク参照可（ダウンロードして設置してもOK）。
function bannerTag(file: string): string {
  return `<a href="${SITE_URL}/" target="_blank" rel="noopener"><img src="${SITE_URL}/${file}" width="200" height="40" alt="フクエス｜福岡メンズエステ情報・口コミポータル" loading="lazy" style="border:0;"></a>`;
}

const H2 = 'text-base font-bold text-slate-800 mt-6 mb-2';
const P = 'text-sm text-slate-600 leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed';

export default function BannerPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ─── Header（本体共通構成の簡易版） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4">
        <div className="my-6 p-6 rounded-2xl bg-white border border-pink-100 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-4">リンクバナーについて</h1>

          <p className={P}>
            フクエスはリンクフリーです。事前のご連絡は不要です。サロン様の公式サイトやブログ等からのリンクの際は、下記のバナーをご利用ください。リンク先は
            <span className="font-bold text-slate-800"> {SITE_URL}/ </span>
            でお願いします。
          </p>

          {BANNERS.map(({ file, label }) => (
            <section key={file}>
              <h2 className={H2}>{label}（200×40）</h2>
              {/* プレビュー：白版も輪郭が出るよう枠線つきの面に載せる。 */}
              <div className="inline-block p-4 rounded-xl bg-slate-50 border border-slate-200">
                <img
                  src={`/${file}`}
                  alt="フクエス｜福岡メンズエステ情報・口コミポータル"
                  width={200}
                  height={40}
                  className="block border border-slate-200"
                />
              </div>
              <BannerTagCode tag={bannerTag(file)} accent="pink" />
            </section>
          ))}

          <h2 className={H2}>設置後のご報告（特典）</h2>
          <p className={P}>
            バナーを設置いただいたサロン様には特典をご用意しています（内容は順次ご案内します）。設置後、下記フォームからご報告ください。
          </p>
          <Link
            href="/x/banner/report"
            className="inline-block mt-3 px-5 py-2.5 rounded-full text-sm font-bold text-white active:scale-[0.98] transition hover:opacity-90"
            style={{ background: 'linear-gradient(to right,#ec4899,#f97316)' }}
          >
            設置を報告する →
          </Link>

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
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
