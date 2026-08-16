import type { Metadata } from 'next';
import Link from 'next/link';
import { HpInquiryForm } from './HpInquiryForm';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// 公式ホームページ制作の【お申し込み・お問い合わせ】専用ページ（2026-08-16 新設）。
//
// もともと制作の申し込み導線は mailto:info@fukues.com だけだった。
// メールアプリが無い環境では押しても何も起きず、届いた内容もフォーマットがバラバラで、
// 「フクエスに掲載しているお店か」がその都度やり取りしないと分からなかったので、
// 項目を決めたフォームにした（/listing の掲載お問い合わせとまったく同じ作法）。
//
// ★ URL を /hp/contact ではなく /hp/templates/contact にしてあるのは、/hp/[slug] と
//   ぶつからないようにするため。slug='templates' は HP_RESERVED_SLUGS で発行禁止なので、
//   その配下は静的セグメントとして安全に使える。
//   /hp/contact に置くと、将来 slug='contact' の店舗が現れたときその店のサイトを覆い隠す
//   （デザイン一覧を /hp/templates/designs にしたのと同じ理由）。
//   ★ どうしても /hp/contact にしたい場合は、先に HP_RESERVED_SLUGS へ 'contact' を足すこと。
//
// ★ /hp 配下はフクエス本体のヘッダー・フッターを出さない。
//   このページからサイト内へ戻る導線は下部の nav が唯一の出口なので消さないこと。

const PAGE_TITLE = 'ホームページ制作のお申し込み｜メンズエステ専門の公式ホームページ制作｜フクエス';
const PAGE_DESCRIPTION =
  'フクエスの公式ホームページ制作のお申し込み・ご相談フォームです。店舗名とご連絡先、フクエスの掲載状況、ご希望のデザインをお知らせください。ご相談は無料です。';

// OGP画像はデザイン一覧と同じものを使う（このページ専用の絵は作っていない）。
// ★ webp ではなく jpg なのは、LINE など webp のOGPを表示しない環境があるため。
const PAGE_OGP_IMAGE = '/hp-lp/ogp-hp-templates.jpg';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  // ★ canonical は必ずページごとに入れること。省くと layout.tsx の { canonical: '/' } を継承し、
  //   「このページはトップの複製」と伝わって検索結果から外れる（危険地帯・/hp 配下は必須）。
  alternates: { canonical: '/hp/templates/contact' },
  // ★ OGP もページごと。省くと本体トップのタイトルと /ogp.png を継承してしまう。
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: '/hp/templates/contact',
    siteName: 'フクエス',
    images: [{ url: PAGE_OGP_IMAGE, width: 1200, height: 630 }],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [PAGE_OGP_IMAGE],
  },
};

export default function HpContactPage() {
  return (
    <div className="min-h-screen bg-[#fdf5f5] text-[#4a3f3a]">
      {/* パンくず構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: toJsonLdString(
            buildBreadcrumbJsonLd([
              { name: 'トップ', path: '/' },
              { name: 'ホームページ制作', path: '/hp/templates' },
              { name: 'お申し込み', path: '/hp/templates/contact' },
            ]),
          ),
        }}
      />

      <section className="mx-auto max-w-3xl px-5 pt-10 sm:pt-14">
        <Link
          href="/hp/templates"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#a08e84] transition-colors hover:text-[#c9808f]"
        >
          ← ホームページ制作のご案内へ戻る
        </Link>

        <p className="mt-6 text-[10px] tracking-[.3em] text-[#b98d4f]">CONTACT</p>
        <h1 className="mt-1 text-[22px] sm:text-[28px] font-bold leading-tight tracking-wider text-[#3f342e]">
          ホームページ制作の
          <span className="block sm:inline sm:ml-2 text-[#c9808f]">お申し込み・ご相談</span>
        </h1>

        <span className="mt-4 mb-5 flex items-center gap-2 text-[#d5a86b]" aria-hidden="true">
          <span className="block h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-[#d5a86b]" />
          <span className="block w-1.5 h-1.5 rotate-45 bg-[#d5a86b]" />
          <span className="block h-px flex-1 bg-gradient-to-l from-transparent to-[#d5a86b]" />
        </span>

        <p className="text-[13px] sm:text-[14px] leading-loose text-[#6d5d53]">
          下のフォームからお申し込み・ご相談いただけます。
          <span className="font-bold text-[#3f342e]">ご相談だけでも構いません</span>
          し、この時点で費用は発生しません。
          デザインがまだお決まりでない場合は、ひな形・カラーは未選択のままで大丈夫です。
        </p>
        <p className="mt-3 text-[13px] leading-loose text-[#6d5d53]">
          デザインを見てから決めたい方は
          <Link href="/hp/templates/designs" className="mx-1 underline text-[#c9808f] hover:text-[#b96f7e]">
            デザイン一覧（全16パターン）
          </Link>
          をご覧ください。実際のデモページで仕上がりを確認できます。
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
        <HpInquiryForm />
      </section>

      <section className="border-t border-[#f0dde0] bg-white">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <p className="text-[11px] leading-relaxed text-[#a08e84] text-center">
            掲載・制作のご相談：フクエス運営事務局（
            <a href="mailto:info@fukues.com" className="underline text-[#b98d4f] hover:text-[#9a743c]">info@fukues.com</a>
            ）
          </p>
          {/* サイト内への戻り導線。/hp 配下は本体のヘッダー・フッターを出さないため、ここが唯一の出口。 */}
          <nav aria-label="サイト内リンク" className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap mt-3 text-[12px]">
            <Link href="/" className="text-[#b98d4f] hover:text-[#9a743c] underline">フクエス トップ</Link>
            <Link href="/listing" className="text-[#b98d4f] hover:text-[#9a743c] underline">掲載について</Link>
            <Link href="/hp/templates" className="text-[#b98d4f] hover:text-[#9a743c] underline">ホームページ制作のご案内</Link>
            <Link href="/hp/templates/designs" className="text-[#b98d4f] hover:text-[#9a743c] underline">デザイン一覧</Link>
          </nav>
        </div>
      </section>
    </div>
  );
}
