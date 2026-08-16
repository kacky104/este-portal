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

// ひな形ごとの見た目（2026-08-16・いただいたデザイン見本の再現）。
//
// ★ ここは「デザイン一覧ページの見せ方」だけを持つ。配色の値そのもの（--hp-accent など）は
//   lib/hpSite.ts の HP_COLOR_VARIANTS が唯一の正なので、色を変えるときはまずそちらを見る。
// ★ Tailwind は文字列を組み立てたクラス名を拾えない（未使用として消える）。
//   ここの値は必ずベタ書きのまま置くこと。テンプレートリテラルで作らないこと。
// ★ 見本にあった外枠の「DESIGN COLLECTION／4つのひな形 × 4カラー」の大見出しは入れていない。
//   すぐ上のヒーローと DESIGN GUIDE 画像が同じ文言を持っており、3回目の重複になるため。
type TypeTheme = {
  /** 見本の2行タグライン */
  tagline: [string, string];
  /** 外周の金の細枠（1pxのグラデーション面。内側の panel を載せる） */
  frame: string;
  /** パネルの地色 */
  panel: string;
  /** 「TYPE S」を載せるプレート */
  plate: string;
  /** 「TYPE S」の文字 */
  typeCls: string;
  /** タグラインの文字 */
  leadCls: string;
  /** サムネ写真の枠線 */
  thumbFrame: string;
  /** プレート上のダイヤ飾り */
  diamond: string;
};

const TYPE_THEME: Record<HpTemplateKey, TypeTheme> = {
  // 白・淡いピンク・シャンパンゴールド
  s: {
    tagline: ['華やかで上品な、', '王道エレガント'],
    frame: 'bg-gradient-to-br from-[#e9d3b4] via-[#f7e8d1] to-[#e4c69f]',
    panel: 'bg-gradient-to-br from-[#fffcfa] via-[#fdf4f3] to-[#fbeef0]',
    plate: 'bg-gradient-to-b from-white/90 to-[#fdeef0]/70 border border-[#eedbc4]',
    typeCls: 'text-[#a9793f]',
    leadCls: 'text-[#7b6558]',
    thumbFrame: 'border-[#e3c9a5]',
    diamond: 'bg-[#d5a86b]',
  },
  // 黒・ワインレッド・ゴールド
  a: {
    tagline: ['深みと重厚感のある、', 'ラグジュアリー'],
    frame: 'bg-gradient-to-br from-[#c9a262] via-[#8d6a35] to-[#c9a262]',
    panel: 'bg-gradient-to-br from-[#3b2226] via-[#2a1b1f] to-[#1f1517]',
    plate: 'bg-gradient-to-b from-[#5c2b34]/75 to-[#2c1a1e]/60 border border-[#8d6a35]',
    typeCls: 'text-[#eed6a4]',
    leadCls: 'text-[#e3d0c7]',
    thumbFrame: 'border-[#9b7a44]',
    diamond: 'bg-[#e0c07c]',
  },
  // アイボリー・リーフグリーン・ゴールド
  b: {
    tagline: ['やさしい光に包まれた、', 'ナチュラル'],
    frame: 'bg-gradient-to-br from-[#dcd0ac] via-[#f1e9ce] to-[#ccd7b7]',
    panel: 'bg-gradient-to-br from-[#fbfaf2] via-[#f5f3e6] to-[#eaf0e2]',
    plate: 'bg-gradient-to-b from-white/90 to-[#eef2e5]/70 border border-[#d8dcc2]',
    typeCls: 'text-[#4e7a4a]',
    leadCls: 'text-[#5f6b56]',
    thumbFrame: 'border-[#cfd3ae]',
    diamond: 'bg-[#c2a35f]',
  },
  // 淡いパープル・モード系・ゴールド
  c: {
    tagline: ['余白を活かした、', 'モード＆スタイリッシュ'],
    frame: 'bg-gradient-to-br from-[#ddc9ea] via-[#f1e8f7] to-[#cdb6e0]',
    panel: 'bg-gradient-to-br from-[#faf6fd] via-[#f3ecf8] to-[#eae0f3]',
    plate: 'bg-gradient-to-b from-white/90 to-[#eee4f5]/70 border border-[#ddcbea]',
    typeCls: 'text-[#6b4a86]',
    leadCls: 'text-[#5f5470]',
    thumbFrame: 'border-[#d5c3e4]',
    diamond: 'bg-[#b98d4f]',
  },
};

// 色名ラベル（金の縁取り・明るいアイボリー）と「デモを見る」ボタン（シャンパンゴールド）は
// ひな形をまたいで共通。★ 4タイプで同じ見た目にするのは見本どおり。ここをタイプ別にしないこと。
const COLOR_LABEL_CLS =
  'relative z-10 -mt-3 mx-auto block w-fit max-w-full rounded-full border border-[#c9a05c] ' +
  'bg-[linear-gradient(180deg,#fffdf6_0%,#f8edd6_100%)] px-2 min-[360px]:px-2.5 sm:px-3 xl:px-4 py-[3px] xl:py-[5px] ' +
  'text-[11px] min-[360px]:text-[12px] xl:text-[13px] font-bold leading-snug text-[#5a4326] shadow-sm whitespace-nowrap';
// ★ 一番長い色名は「シャンパンゴールド」（9文字）。画面幅320pxのカード幅118pxに
//   11px＋px-2 でちょうど収まる。文字を大きくするか余白を足すとはみ出すので、
//   色名を増やすときは320px幅で実測すること（2026-08-16 実測）。

// 光沢と立体感のあるシャンパンゴールド。上半分を明るく、中央で一段落として金属の折れを作る。
// ★ ホバーの浮き上がりと光の流れは sm 以上だけ（タッチ端末では :hover が張り付くため）。
const DEMO_BTN_CLS =
  'relative mt-1.5 sm:mt-2 xl:mt-3 flex h-8 sm:h-10 xl:h-12 items-center justify-center overflow-hidden rounded-full ' +
  'border border-[#b6883f] bg-[linear-gradient(180deg,#fbeecd_0%,#eed6a2_46%,#d9b471_54%,#eddcb4_100%)] ' +
  'shadow-[0_1px_2px_rgba(74,54,24,.25),inset_0_1px_0_rgba(255,255,255,.75)] ' +
  'transition-all duration-300 sm:group-hover/card:-translate-y-0.5 ' +
  'sm:group-hover/card:shadow-[0_6px_14px_rgba(74,54,24,.28),inset_0_1px_0_rgba(255,255,255,.85)]';

// ※ 金の罫とダイヤの飾り（GoldRule）は 2026-08-16 に削除した。
//    見出しブロックと CTA を画像化して、このページから使う場所が無くなったため。
//    /hp/templates（LP）側には同じ飾りが別に置いてあるので、そちらは触っていない。

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

      {/* ── ヒーローと DESIGN GUIDE の継ぎ目つなぎ（2026-08-16）──
          ★ 画像側を背景色になじませる加工（flow-sp でやった手）は使えない。
            ヒーローは下端に金の飾りとダイヤが入っており、なじませると飾りが消えるため。
          そこで画像は無加工のまま、あいだに「ヒーロー下端色 → 次の画像の上端色」の
          グラデーションを敷いて繋ぐ。
          ★ もとは to- がページ背景 #fdf5f5 だった。下に DESIGN GUIDE 画像を置いたことで、
            背景色まで一度明るくしてから画像色へ戻る形になり、細い帯が見えていた。
            to- は「すぐ下に来るものの色」に合わせること。下の画像を差し替えたらここも測り直す。
          ★ 2026-08-16 の実測（16行平均）:
              ヒーロー下端  PC #f1e0d6 / SP #f0dbcc
              GUIDE 上端    PC #f8e9de / SP #f9ebe1
            継ぎ目の色差はチャンネル最大で PC 9 / SP 21。 */}
      <div aria-hidden="true" className="h-6 bg-gradient-to-b from-[#f0dbcc] to-[#f9ebe1] sm:hidden" />
      <div aria-hidden="true" className="hidden h-8 bg-gradient-to-b from-[#f1e0d6] to-[#f8e9de] sm:block" />

      {/* ── DESIGN GUIDE（見出し＋選び方の案内・文字焼き込み済み）── 2026-08-16
          もとは「可視の h1 ＋ 金罫線 ＋ 説明文」と「選び方の案内（白いカード3枚）」の2セクション
          だったが、いただいた画像に同じ内容（選べるデザイン 全16パターン／01 ひな形を選ぶ・
          02 カラーを選ぶ・03 あとは運営が制作／下のサムネイルは…）が焼き込まれているため、
          2セクションまとめて画像1枚に置き換えた。

          ★ h1 を sr-only にしているのはオーナー判断（2026-08-16）。
            同じ見出しがヒーロー画像・h1・この画像で3回出るのを避けるため。
            ただし /hp/templates（LP）側は 2026-08-15 に sr-only から可視へ戻した経緯があるので、
            あちらの h1 を sr-only に戻さないこと。ここだけの例外。
          ★ h1 の文言は tools-verify-hp.mjs の designs 側の期待値と1文字も違えないこと（危険地帯41）。
            改行を挟んでも JSX が行頭行末の空白を落とすので textContent は「選べるデザイン全16パターン」。
          ★ ファーストビューではないので lazy。eager にするのはヒーローだけ。
          ★ 画像は必ず /hp-lp/ 配下に置くこと。
            tools-verify-hp.mjs はサムネを「src が /hp-lp/ で始まらない画像」で数えており、
            別フォルダに置くと「サムネが16枚」の判定に混ざって落ちる。

          画像: public/hp-lp/designs-guide-pc.webp（1717×916・約1.87:1）
                public/hp-lp/designs-guide-sp.webp（864×1821・約1:2.11）
          ※ 端の色はページ背景 #fdf5f5 に近いので、ヒーローのような継ぎ目グラデーションは要らない。
            2026-08-16 の実測（16行平均）: PC 上 #f8e9de / 下 #f9ede5、SP 上 #f9ebe1 / 下 #f9e9df。
            背景とのチャンネル最大差は PC 上23・下16、SP 上22・下22。 */}
      <section>
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/designs-guide-sp.webp" width={864} height={1821} />
          <img
            src="/hp-lp/designs-guide-pc.webp"
            width={1717}
            height={916}
            alt=""
            className="block w-full h-auto"
            loading="lazy"
          />
        </picture>
        <h1 className="sr-only">選べるデザイン全{HP_PATTERN_COUNT}パターン</h1>
        <div className="sr-only">
          <p>
            下のサムネイルはすべて実際のキービジュアルです。
            気になるデザインは「デモを見る」から、サンプル店舗のデータが入った実物のページをご覧いただけます。
          </p>
          <ul>
            <li>ひな形を選ぶ：タイプS・A・B・Cの4つから全体の雰囲気を選びます。</li>
            <li>カラーを選ぶ：同じひな形でも配色で印象が大きく変わります。</li>
            <li>あとは運営が制作：ドメイン取得・写真や文章の設定・公開まで運営が行います。</li>
          </ul>
        </div>
      </section>

      {/* ── LPへ戻るリンク ── 2026-08-16
          もとは h1 ブロックの中にあった。見出しを画像化したのでここへ移した。
          ★ 画像より上に置かないこと。ヒーローと DESIGN GUIDE の間に細い帯が挟まって見える。 */}
      <section className="pt-6 sm:pt-8">
        <div className="mx-auto max-w-5xl px-5 text-center">
          <Link
            href="/hp/templates"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#a08e84] transition-colors hover:text-[#c9808f]"
          >
            ← ホームページ制作のご案内へ戻る
          </Link>
        </div>
      </section>

      {/* ── ひな形ごとの4ブロック ── 2026-08-16 いただいたデザイン見本で作り直し
          見た目のねらい:
            ・タイプごとに地色・枠・見出しの雰囲気を変える（配色は TYPE_THEME）
            ・PC は「見出し（左）＋サムネ4枚（右）」の横並び、SP は「見出し（上）＋2列×2段」
            ・色名は金の縁取りのアイボリーのラベル。写真の下端に少し重ねる
            ・「デモを見る」は光沢のあるシャンパンゴールド。PCのホバーで浮き上がり＋光が流れる

          ★ カード全体が1本の <a>。「デモを見る」を別の <a> にしないこと。
            見た目はボタンだが中身は <span> で、写真もラベルもボタンも同じリンクの中にある。
            ＝写真とボタンのどちらを押しても同じデモが開き、リンク数は16本のまま
            （tools-verify-hp.mjs が「デモへのリンクが16本」で見張っている。
              2本に割ると32本になって落ちる）。
          ★ リンク先 /hp/{demo}/preview/{ひな形}/{色} と data-testid は作り直し前と同じ。
            ここを変えると管理画面のプレビューや回帰チェックの参照が切れる。
          ★ 写真は既存の /hp-{ひな形}/thumb-{色}.webp（640×360）をそのまま出す。
            作り直したり縮めたりしないこと。切り取り基準は hpDesignThumbObjectCls が正。 */}
      {/* ★ このブロックだけページ幅いっぱいに広げてある（2026-08-16 オーナー要望）。
          ほかのセクション（この下のCTAなど）は max-w-5xl のまま。
          上のヒーローと DESIGN GUIDE が全幅の画像なので、並べても違和感は出ない。
          ★ 上限 2400px は「写真を引き伸ばさない」ための保険。サムネの実寸は 640×360 なので、
            カード1枚が 640px を超えると拡大表示になってぼける。
            カード幅 ≒ (画面幅 - 464) ÷ 4 なので、2400px でも約484pxで実寸内に収まる。
            1920pxのとき1枚あたり約363px・写真の高さ約204px（実測）。 */}
      <div className="mx-auto w-full max-w-[2400px] px-2 sm:px-6 lg:px-8 xl:px-10 py-12 sm:py-14 space-y-8 sm:space-y-10">
        {HP_TEMPLATES.map((t) => {
          const th = TYPE_THEME[t.key];
          const variants = HP_COLOR_VARIANTS[t.key];
          return (
            <section key={t.key} id={`type-${t.key}`} aria-labelledby={`type-${t.key}-heading`}>
              {/* 金の細枠。1pxの面を敷いて、その上に地色のパネルを載せる */}
              <div className={`rounded-[20px] p-[1.5px] shadow-sm ${th.frame}`}>
                {/* ★ スマホのパネル内側の余白は 6px まで詰めてある（2026-08-16 オーナー要望）。
                    その分サムネが大きくなる。ここを広げると写真が小さくなるので戻さないこと。 */}
                <div className={`rounded-[19px] p-1.5 sm:p-5 lg:p-6 xl:p-8 ${th.panel}`}>
                  <div className="lg:flex lg:items-start lg:gap-6 xl:gap-8">
                    {/* 見出しプレート。PCは左の固定幅・SPは上の全幅 */}
                    <header
                      className={`rounded-2xl px-4 py-3 text-center lg:w-[188px] xl:w-[240px] lg:flex-none lg:self-stretch lg:flex lg:flex-col lg:justify-center ${th.plate}`}
                    >
                      <span aria-hidden="true" className="flex items-center justify-center gap-1.5">
                        <span className={`block h-px w-5 bg-current opacity-40 ${th.typeCls}`} />
                        <span className={`block w-1.5 h-1.5 rotate-45 ${th.diamond}`} />
                        <span className={`block h-px w-5 bg-current opacity-40 ${th.typeCls}`} />
                      </span>
                      <h2
                        id={`type-${t.key}-heading`}
                        className={`mt-1.5 font-serif text-[22px] sm:text-[26px] xl:text-[30px] font-bold tracking-[.12em] leading-none ${th.typeCls}`}
                      >
                        TYPE {t.key.toUpperCase()}
                      </h2>
                      <p className={`mt-2 text-[12px] sm:text-[13px] xl:text-[14px] leading-relaxed ${th.leadCls}`}>
                        {/* ★ スマホは1行（2026-08-16 オーナー要望）。lg 以上だけ2行に折る。
                            一番長いのは「余白を活かした、モード＆スタイリッシュ」の19文字。 */}
                        {th.tagline[0]}
                        <span className="lg:block">{th.tagline[1]}</span>
                      </p>
                    </header>

                    <div
                      className={`mt-2 grid gap-[5px] sm:mt-4 sm:gap-3 xl:gap-4 lg:mt-0 lg:min-w-0 lg:flex-1 ${VARIANT_GRID_CLS[Math.min(variants.length, 6)] ?? VARIANT_GRID_CLS[6]}`}
                    >
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
                            className="group/card block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b98d4f] focus-visible:ring-offset-2"
                          >
                            <span
                              className={`block overflow-hidden rounded-none sm:rounded-lg border ${th.thumbFrame} shadow-sm transition-shadow duration-300 sm:group-hover/card:shadow-md`}
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
                            </span>

                            {/* 色名（金の縁取り・明るいアイボリー）。写真の下端に少し重ねる */}
                            <span className={COLOR_LABEL_CLS}>{v.label}</span>

                            {/* 「デモを見る」。ボタンに見えるが <span>（親の <a> が受ける） */}
                            <span className={DEMO_BTN_CLS}>
                              <span className="relative z-10 text-[11px] sm:text-[13px] xl:text-[15px] font-bold tracking-wide text-[#4a3618]">
                                デモを見る
                              </span>
                              {/* ホバーで左から右へ抜ける光。PCだけ動かす */}
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent)] transition-[left] duration-700 ease-out sm:group-hover/card:left-full"
                              />
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* ── まとめ・お問い合わせ（NEXT STEP・文字焼き込み済み）── 2026-08-16
          もとは白いカードに見出し・説明文・ボタン2つを組んでいたが、いただいた見本の画像に
          同じ内容（NEXT STEP／気になるデザインが決まりましたら、担当者までお知らせください。／
          写真・文章・表示内容は…／相談無料・制作おまかせ・公開まで対応／ボタン2つ）が
          焼き込まれているため、画像1枚＋透明リンクに置き換えた。

          ★ 画像にはリンクを張れないので、ボタンの絵の上に透明な <a> を絶対配置で重ねている。
            位置は「画像の何%か」で指定しているので、画像が拡大縮小しても常に重なる。
            ★ %の値は画像そのものをピクセル解析して出したもの（2026-08-16 実測）。
              PC 1983×793: ピンク x758-1278 / y572-691、アイボリー x1295-1783 / y572-691
              SP  941×1672: ピンク x65-877 / y1155-1346、アイボリー x63-877 / y1386-1572
            ★ 画像を差し替えたら、この%も測り直すこと。ズレると「押しても反応しない帯」ができる。
          ★ 切り替えは 768px。<source> の (max-width: 767px) と Tailwind の md: を必ず揃えること。
            片方だけ直すと、SP画像にPCの座標が重なって全く押せなくなる。
          ★ リンク先: 問い合わせ = /hp/templates/contact（申し込みフォーム）、
            料金・制作の流れ = /hp/templates。ここを推測で変えないこと。
            2026-08-16: 問い合わせ側は mailto:info@fukues.com から申し込みフォームへ変更した。
            mailto はメールアプリが無い環境で押しても何も起きず、届く内容もバラバラだったため。
            ★ 内部リンクが1本増えるので tools-verify-hp.mjs の designs の internal も
              21→22 に直してある。片方だけ直すと回帰チェックが落ちる。

          画像: public/hp-lp/designs-cta-pc.webp（1983×793・約2.5:1）
                public/hp-lp/designs-cta-sp.webp（941×1672・約1:1.78） */}
      <section className="border-t border-[#f0dde0] bg-white">
        <div className="relative">
          <picture>
            <source media="(max-width: 767px)" srcSet="/hp-lp/designs-cta-sp.webp" width={941} height={1672} />
            <img
              src="/hp-lp/designs-cta-pc.webp"
              width={1983}
              height={793}
              alt="気になるデザインが決まりましたら担当者までお知らせください。制作のお問い合わせと料金・制作の流れをご案内します。"
              loading="lazy"
              draggable={false}
              className="block w-full h-auto select-none [-webkit-user-drag:none]"
            />
          </picture>

          {/* 画像の「制作について問い合わせる」ボタンに重ねる透明リンク */}
          <Link
            href="/hp/templates/contact"
            aria-label="制作について問い合わせる（お申し込みフォームへ）"
            className="absolute cursor-pointer rounded-full left-[6.8%] top-[69.0%] w-[86.6%] h-[11.6%] md:left-[38.2%] md:top-[72.1%] md:w-[26.3%] md:h-[15.2%] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9808f] focus-visible:ring-offset-2"
          />

          {/* 画像の「料金・制作の流れを見る」ボタンに重ねる透明リンク */}
          <Link
            href="/hp/templates"
            aria-label="料金・制作の流れを見る"
            className="absolute cursor-pointer rounded-full left-[6.7%] top-[82.9%] w-[86.5%] h-[11.2%] md:left-[65.3%] md:top-[72.1%] md:w-[24.7%] md:h-[15.2%] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b98d4f] focus-visible:ring-offset-2"
          />

          {/* 画像に焼き込んだ文言のうち、alt に入り切らない説明を文字でも残す。
              ★ alt と重複させないこと（読み上げが二重になる）。 */}
          <div className="sr-only">
            <p>
              写真・文章・表示する内容は、お店ごとに運営がカスタマイズしてお納めします。
              ドメイン取得から公開まで、すべて運営が対応しますのでお手間はかかりません。
            </p>
            <p>ご相談は無料です。制作はすべて運営におまかせいただけます。公開まで対応します。</p>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-5 pt-8 pb-12 sm:pb-14">
          <p className="text-[11px] leading-relaxed text-[#a08e84] text-center">
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
