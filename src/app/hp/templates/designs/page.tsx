import type { Metadata } from 'next';
import Link from 'next/link';
import {
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  HP_DEMO_SLUG,
  type HpTemplateKey,
} from '@/app/lib/hpSite';
import {
  DesignThumb,
  hpDesignThumbObjectCls,
  hpDesignThumbSrc,
  hpVariantColors,
} from '@/app/hp/_templates/DesignThumb';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// 公式ホームページ制作の【デザイン一覧・専用ページ】（2026-08-15 新設）。
//
// もともと /hp/templates（LP）の中に「選べるデザイン 全◯パターン」セクションとして
// 入っていたものを、丸ごとこのページへ移した（LP側は「デザインを見る」ボタンだけを残す）。
// LP が縦に長くなりすぎて、料金・お問い合わせまで遠かったのが理由。
//
// URL を /hp/designs ではなく /hp/templates/designs にしてあるのは、/hp/[slug] と
// ぶつからないようにするため。slug='templates' は HP_RESERVED_SLUGS で発行禁止なので、
// その配下は静的セグメントとして安全に使える（/hp/designs だと将来 slug='designs' の
// 店舗が現れたとき、その店のサイトを覆い隠してしまう）。
//
// 見た目は LP と同じ白×ピンク×金だが、こちらは「デザインを見せるページ」なので
// 濃いめ・華やかめに振ってある（グラデーションの帯・金の罫・大きめのサムネ）。
//
// サムネはすべて実物のキービジュアル写真（public/hp-{ひな形}/thumb-{色}.webp・16:9）。
// 写真が無い組み合わせだけ簡易サムネ（DesignThumb）に落ちる。
// 各カードのリンク先は /hp/demo/preview/{ひな形}/{色}（デモ店舗の実物プレビュー）。
//
// ★ DesignThumb.tsx は店舗管理画面（/hp/[slug]/admin）と共用なので、ここからは import だけして触らない。

// title / description / OGP で同じ文言を使うので定数にまとめてある（2026-08-15）。
// ここを直せば検索結果・SNSカードの両方が一度に揃う（片方だけ古くなる事故を防ぐ）。
const PAGE_TITLE = 'デザイン一覧｜メンズエステ専門の公式ホームページ制作｜フクエス';
const PAGE_DESCRIPTION =
  'フクエスの公式ホームページ制作で選べるデザイン一覧。高級感のある4つのひな形×カラーをご用意。実際のデモページで仕上がりをご確認いただけます。';

// OGP画像（1200×630＝OGP標準の1.91:1）。design-pc.webp（約1.87:1）を縮めて、
// 左右のわずかな余りをページ背景 #fdf5f5 で埋めたもの。
// ★ webp ではなく jpg にしてあるのは、LINE など webp のOGPを表示しない環境があるため。
// ★ design-pc.webp を差し替えたら、この画像も作り直すこと（サムネ16枚が焼き込まれている）。
const PAGE_OGP_IMAGE = '/hp-lp/ogp-hp-designs.jpg';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  // ★ canonical は必ずページごとに入れること。省くと layout.tsx の { canonical: '/' } を継承し、
  //   「このページはトップの複製」と伝わって検索結果から外れる（2026-08-15 修正）。
  alternates: { canonical: '/hp/templates/designs' },
  // ★ OGP もページごとに入れること（2026-08-15 追加）。省くと layout.tsx の
  //   「福岡メンズエステ情報・口コミポータルサイト【フクエス】」＋ /ogp.png を継承してしまう。
  //   理由と経緯は /hp/templates 側のコメントに詳しく書いてある。
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: '/hp/templates/designs',
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

// 掲載する総パターン数は定義から数える（カラーを足し引きしても文言がずれないように）。
const HP_PATTERN_COUNT = HP_TEMPLATES.reduce((n, t) => n + HP_COLOR_VARIANTS[t.key].length, 0);

// カラー数ごとのサムネ列数。
// ★ Tailwind は文字列を組み立てたクラス名を拾えない（未使用として消える）ので、
//    列数は必ずベタ書きの候補から選ぶこと。
const VARIANT_GRID_CLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

// 説明文は HP_TEMPLATE_NOTES（管理画面と共用）と同じ中身だが、
// 配色名はサムネの下に色見本つきで出るのでここでは省き、雰囲気だけを1行で書いている。
const TEMPLATE_TITLES: Record<HpTemplateKey, { en: string; name: string; lead: string }> = {
  s: { en: 'GRACE', name: 'フラッグシップ', lead: '白地に全幅の写真と固定ナビ。王道の高級デザインで、いちばん上位のひな形です。' },
  a: { en: 'LUXE',  name: '高級・しっとり', lead: '黒基調・明朝体の高級路線。落ち着いた大人向けの店舗に。' },
  b: { en: 'CLEAN', name: '清潔感・癒やし', lead: '生成り地のやわらかい印象。清潔感・癒やし系の店舗に。' },
  c: { en: 'MODE',  name: '都会的・シャープ', lead: '白地に太字とアクセント。都会的でシャープな印象に。' },
};

// 金の細い罫とダイヤの飾り（見出しの下に置く）。
function GoldRule() {
  return (
    <span className="flex items-center justify-center gap-2 text-[#d5a86b]" aria-hidden="true">
      <span className="block h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-[#d5a86b]" />
      <span className="block w-1.5 h-1.5 rotate-45 bg-[#d5a86b]" />
      <span className="block h-px w-10 sm:w-16 bg-gradient-to-l from-transparent to-[#d5a86b]" />
    </span>
  );
}

export default function HpDesignsPage() {
  return (
    <div className="min-h-screen bg-[#fdf5f5] text-[#4a3f3a]">
      {/* パンくず構造化データ（2026-08-15）。
          ※デザイン16件の ItemList は入れていない。リンク先のデモ（/hp/[slug]/preview/…）が
            noindex, nofollow なので、そこへ向けた ItemList を出しても意味がないため。 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: toJsonLdString(
            buildBreadcrumbJsonLd([
              { name: 'トップ', path: '/' },
              { name: 'ホームページ制作', path: '/hp/templates' },
              { name: 'デザイン一覧', path: '/hp/templates/designs' },
            ]),
          ),
        }}
      />
      {/* ── ヒーロー（KV・文字焼き込み済み）── 2026-08-16
          もともとここは CSSグラデーションで組んだ「見出し帯」だったが、いただいたキービジュアルに
          同じ文言（DESIGN COLLECTION／全16パターン／4つのひな形×カラー）が焼き込まれており、
          並べると同じことを2回言う形になるため、帯を画像に置き換えた。

          LP（/hp/templates）と同じ作法で置いている:
            ・全幅・原寸比率のまま（文字が焼き込まれているので cover で切り抜かない）
            ・画像は装飾扱い（alt=""）。文章は下の可視テキストと sr-only で持つ
            ・<source> にも width/height を入れる（入れないとスマホでレイアウトが跳ねる）
          ★ ヒーローは最初の画面に入るので lazy にしないこと（loading 未指定＝eager）。
          ★「16」は画像に焼き込まれている。カラーを増減したら designs-hero-pc/sp も作り直すこと
            （LP側の strengths / design / flow と合わせて計5枚になる）。

          画像: public/hp-lp/designs-hero-pc.webp（1983×793・約2.5:1）
                public/hp-lp/designs-hero-sp.webp（864×1821・約1:2.11）
          ★ PC画像は 2026-08-16 に 1672×941（16:9）から 1983×793（2.5:1）へ差し替えた。
            16:9 だと全幅表示で高さが 856px になり（ブラウザ幅1536pxで実測）、
            表示領域639pxを 217px はみ出して「全16パターン」まで見えなかった。
            2.5:1 なら同条件で 608px に収まる。★ 作り直すときも横長を保つこと。
          ※ 下端の色（PC #f1e0d6・SP #f0dbcc）はページ背景 #fdf5f5 と差があるため、
            画像の直後に白い面を置かないこと。下の h1 ブロックはページ背景のままにしてある。 */}
      <section>
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/designs-hero-sp.webp" width={864} height={1821} />
          <img
            src="/hp-lp/designs-hero-pc.webp"
            width={1983}
            height={793}
            alt=""
            className="block w-full h-auto"
            fetchPriority="high"
          />
        </picture>
        <div className="sr-only">
          <p>
            お店に似合う、デザインを。メンズエステ専門ホームページ。
            高級感のある4つのひな形に、それぞれ4色のカラーをご用意しました。
          </p>
        </div>
      </section>

      {/* ── ヒーロー下端の継ぎ目つなぎ（2026-08-16）──
          画像の下端はページ背景 #fdf5f5 と色差がある（PC 31 / SP 41・チャンネル最大）。
          ★ 画像側を背景色になじませる加工（flow-sp でやった手）は使えない。
            この画像は下端に金の飾りとダイヤが入っており、なじませると飾りが消えるため。
          そこで画像は無加工のまま、直下に「画像の下端色 → ページ背景」のグラデーションを敷いて繋ぐ。
          ★ 画像を作り直したら from- の色も測り直すこと（下端の平均色）。
            2026-08-16 の実測: PC #f1e0d6（2.5:1 に差し替えた新画像の下端16行平均）/ SP #f0dbcc。
            旧 1672×941 の PC 画像は #efded4 だった。 */}
      <div aria-hidden="true" className="h-6 bg-gradient-to-b from-[#f0dbcc] to-[#fdf5f5] sm:hidden" />
      <div aria-hidden="true" className="hidden h-8 bg-gradient-to-b from-[#f1e0d6] to-[#fdf5f5] sm:block" />

      {/* ── ページ見出し（可視の h1）── 2026-08-16
          ★ 帯を画像化したあとも、可視の h1 はここに文字で残すこと。
            画像に焼き込まれた見出しだけにすると、このページの主題が画面上の文字から消える
            （LP側で 2026-08-15 に同じ理由で sr-only の h1 を可視へ戻したのと同じ判断）。
          ★ 文言を変えたら tools-verify-hp.mjs の designs 側の h1 期待値も直すこと（危険地帯41）。
          戻るリンクは画像の下へ移した（画像より上に置くと、ヒーローの前に細い帯が挟まって見えるため）。 */}
      <section className="pt-8 sm:pt-10">
        <div className="mx-auto max-w-5xl px-5 text-center">
          <Link
            href="/hp/templates"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#a08e84] transition-colors hover:text-[#c9808f]"
          >
            ← ホームページ制作のご案内へ戻る
          </Link>

          <h1 className="mt-5 text-[22px] font-bold leading-tight tracking-wider text-[#3f342e] sm:text-[28px]">
            選べるデザイン
            <span className="block text-[#c9808f] sm:ml-3 sm:inline">全{HP_PATTERN_COUNT}パターン</span>
          </h1>
          <div className="mt-4 mb-5">
            <GoldRule />
          </div>
          <p className="mx-auto max-w-2xl text-[13px] leading-loose text-[#6d5d53] sm:text-[14px]">
            下のサムネイルはすべて<span className="font-bold text-[#3f342e]">実際のキービジュアル</span>です。
            気になるデザインは「デモを見る」から、サンプル店舗のデータが入った実物のページをご覧いただけます。
          </p>
        </div>
      </section>

      {/* ── 選び方の案内（3点）── */}
      <section className="mx-auto max-w-5xl px-5 pt-10 sm:pt-12">
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            ['ひな形を選ぶ', 'まずは全体の雰囲気から。タイプS・A・B・Cの4つは、写真の見せ方も文字の組み方も別ものです。'],
            ['カラーを選ぶ', '同じひな形でも配色で印象が大きく変わります。実物のキービジュアルで見比べてください。'],
            ['あとは運営が制作', 'ドメイン取得・写真や文章の設定・公開まで運営が行います。写真や原稿をイチからご用意いただく必要はありません。'],
          ].map(([t, d], i) => (
            <div
              key={t}
              className="relative rounded-2xl border border-[#f0dde0] bg-white shadow-sm px-5 pt-7 pb-5"
            >
              <span className="absolute -top-3 left-5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-[#d5a86b] to-[#b98d4f] text-white text-[12px] font-black shadow">
                {i + 1}
              </span>
              <p className="text-[13px] font-bold text-[#3f342e] mb-2">{t}</p>
              <p className="text-[12px] leading-relaxed text-[#8a7a70]">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ひな形ごとの4ブロック ── */}
      <div className="mx-auto max-w-5xl px-5 py-12 sm:py-14 space-y-10 sm:space-y-14">
        {HP_TEMPLATES.map((t, idx) => {
          const title = TEMPLATE_TITLES[t.key];
          const variants = HP_COLOR_VARIANTS[t.key];
          return (
            <section key={t.key} id={`type-${t.key}`}>
              {/* 見出し：番号入りの金バッジ＋英名＋和名 */}
              <header className="mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[#e6cba0] bg-gradient-to-br from-[#fdf6ec] to-[#f4e3c8] text-[12px] font-black text-[#b98d4f] shadow-sm flex-none">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[#e6cba0] to-transparent" />
                </div>
                <p className="text-[10px] tracking-[.3em] text-[#b98d4f]">{title.en}</p>
                <h2 className="mt-1 text-[20px] sm:text-[22px] font-bold tracking-wide text-[#3f342e]">
                  {t.label}
                  <span className="ml-3 text-[13px] font-normal text-[#c9808f]">{title.name}</span>
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[#6d5d53]">{title.lead}</p>
              </header>

              <div className={`grid gap-3 sm:gap-4 ${VARIANT_GRID_CLS[Math.min(variants.length, 6)] ?? VARIANT_GRID_CLS[6]}`}>
                {variants.map((v) => {
                  const c = hpVariantColors(t.key, v.key);
                  const src = hpDesignThumbSrc(t.key, v.key);
                  return (
                    <a
                      key={v.key}
                      href={`/hp/${HP_DEMO_SLUG}/preview/${t.key}/${v.key}`}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`design-card-${t.key}-${v.key}`}
                      className="group block overflow-hidden rounded-xl border border-[#ecdcdc] bg-white shadow-sm hover:border-[#d5a86b] hover:shadow-lg hover:-translate-y-0.5 transition-all"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={`${t.label}（${v.label}）のキービジュアル`}
                          loading="lazy"
                          width={640}
                          height={360}
                          className={`block w-full aspect-video object-cover ${hpDesignThumbObjectCls(t.key, 'list')}`}
                        />
                      ) : (
                        <DesignThumb template={t.key} accent={c.accent} deep={c.deep} colorKey={v.key} />
                      )}
                      {/* 色名の帯。左に配色の丸、右に「デモを見る」 */}
                      <span className="flex items-center justify-between gap-1.5 px-3 py-2.5 bg-gradient-to-r from-[#fdf6f2] to-[#faf0ea] border-t border-[#f3e2df]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="inline-block w-3.5 h-3.5 rounded-full border border-black/10 shadow-inner flex-none"
                            style={{ backgroundColor: c.accent }}
                          />
                          <span className="truncate text-[11px] font-bold text-[#6d5d53]">{v.label}</span>
                        </span>
                        <span className="text-[10px] font-bold text-[#b98d4f] group-hover:text-[#c9808f] transition-colors flex-none">
                          デモを見る →
                        </span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── まとめ・お問い合わせ ── */}
      <section className="border-t border-[#f0dde0] bg-white">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:py-14">
          <div className="rounded-2xl bg-gradient-to-r from-[#f7dee3] via-[#fbeee7] to-[#f3e3d3] p-[1px] shadow-sm">
            <div className="rounded-2xl bg-white/95 px-6 py-8 sm:px-10 text-center">
              <div className="mb-4">
                <GoldRule />
              </div>
              <p className="text-lg sm:text-xl font-bold leading-relaxed text-[#3f342e]">
                気になるデザインが決まりましたら、
                <span className="block sm:inline text-[#c9808f]">担当者までお知らせください。</span>
              </p>
              <p className="mt-4 text-[13px] leading-relaxed text-[#6d5d53] max-w-2xl mx-auto">
                写真・文章・表示する内容は、お店ごとに運営がカスタマイズしてお納めします。
                ドメイン取得から公開まで、すべて運営が対応しますのでお手間はかかりません。
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="mailto:info@fukues.com"
                  className="inline-flex items-center justify-center rounded-full px-7 py-3 text-[13px] font-bold text-white shadow-md bg-gradient-to-r from-[#d18f9d] to-[#c9808f] hover:from-[#c9808f] hover:to-[#b96f7e] transition-colors"
                >
                  制作について問い合わせる
                </a>
                <Link
                  href="/hp/templates"
                  className="inline-flex items-center justify-center rounded-full border border-[#e6cba0] px-7 py-3 text-[13px] font-bold text-[#b98d4f] bg-white hover:bg-[#fdf8f2] transition-colors"
                >
                  料金・制作の流れを見る
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-[#a08e84] text-center">
            掲載・制作のご相談：フクエス運営事務局（
            <a href="mailto:info@fukues.com" className="underline text-[#b98d4f] hover:text-[#9a743c]">info@fukues.com</a>
            ）
          </p>
          {/* サイト内への戻り導線（2026-08-15 追加）。/hp 配下は本体のヘッダー・フッターを出さないため。 */}
          <nav aria-label="サイト内リンク" className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap mt-3 text-[12px]">
            <Link href="/" className="text-[#b98d4f] hover:text-[#9a743c] underline">フクエス トップ</Link>
            <Link href="/listing" className="text-[#b98d4f] hover:text-[#9a743c] underline">掲載について</Link>
            <Link href="/hp/templates" className="text-[#b98d4f] hover:text-[#9a743c] underline">ホームページ制作のご案内</Link>
          </nav>
        </div>
      </section>
    </div>
  );
}
