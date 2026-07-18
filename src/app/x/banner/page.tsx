/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Metadata } from 'next';
import { XBannerTagCode } from './XBannerTagCode';

// fukuX リンクバナー案内ページ。静的コンテンツのみ・データ取得なし。
// レイアウト（XHeader・x-bg・テーマ）は /x レイアウトを継承。
export const metadata: Metadata = {
  title: 'リンクバナーについて｜fukuX(フクエックス)',
  description: '福岡メンズエステ専用SNS「fukuX(フクエックス)」のリンクバナーと貼り付け用HTMLタグのご案内です。リンクはご自由にどうぞ。',
  alternates: { canonical: '/x/banner' },
};

const SITE_URL = 'https://fukues.com';

// バナー2種（200×40）。public/ 直下に配置した画像を参照する。
const BANNERS = [
  { file: 'fukux-banner-200x40.png', label: 'fukuXカラー版（紫）' },
  { file: 'fukux-banner-200x40-white.png', label: '白基調版' },
] as const;

// 外部サイト貼り付け用タグ。画像は直リンク参照可（ダウンロードして設置してもOK）。
function bannerTag(file: string): string {
  return `<a href="${SITE_URL}/x" target="_blank" rel="noopener"><img src="${SITE_URL}/${file}" width="200" height="40" alt="fukuX(フクエックス)｜福岡メンズエステ専用SNS" loading="lazy" style="border:0;"></a>`;
}

const H2 = 'text-base font-bold text-[color:var(--x-text-primary)] mt-6 mb-2';
const P = 'text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';

export default function XBannerPage() {
  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-bold text-[color:var(--x-text-primary)] mb-4">リンクバナーについて</h1>

      <p className={P}>
        fukuX（フクエックス）はリンクフリーです。事前のご連絡は不要です。店舗様の公式サイトやブログ等からのリンクの際は、下記のバナーをご利用ください。リンク先は
        <span className="font-bold text-[color:var(--x-text-primary)]"> {SITE_URL}/x </span>
        でお願いします。
      </p>

      {BANNERS.map(({ file, label }) => (
        <section key={file}>
          <h2 className={H2}>{label}（200×40）</h2>
          {/* プレビュー：テーマに依らず見えるよう中立の面に載せる。白版は枠線で輪郭を出す。 */}
          <div className="inline-block p-4 rounded-xl bg-[color:var(--x-inset)] border border-[color:var(--x-border)]">
            <img
              src={`/${file}`}
              alt="fukuX(フクエックス)｜福岡メンズエステ専用SNS"
              width={200}
              height={40}
              className="block border border-[color:var(--x-border)]"
            />
          </div>
          <XBannerTagCode tag={bannerTag(file)} />
        </section>
      ))}

      <h2 className={H2}>設置後のご報告（特典）</h2>
      <p className={P}>
        バナーを設置いただいた店舗様には特典をご用意しています（fukuXはタイムライン「お店」タブのカード画像を4枚追加）。設置後、下記フォームからご報告ください。運営が確認のうえ開放します。
      </p>
      <Link
        href="/x/banner/report"
        className="inline-block mt-3 px-5 py-2.5 rounded-full text-sm font-bold text-white active:scale-[0.98] transition"
        style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
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
        <a href="mailto:info@fukues.com" className="text-[color:var(--x-accent)] hover:underline">
          info@fukues.com
        </a>
        ）
      </p>
    </div>
  );
}
