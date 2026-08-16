import type { Metadata } from 'next';
import Link from 'next/link';
import { HP_TEMPLATES, HP_COLOR_VARIANTS } from '@/app/lib/hpSite';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// 公式ホームページ制作の【LP 兼 デザイン一覧】（2026-08-09）。
//
// vootec の /lp/mens-esthe を参考にした営業用ページ。契約店舗（・検討中の店舗）には
// このページを見せてデザインを会話で決め、設定・カスタマイズ・納品はすべて運営が行う。
//
// 構成（2026-08-09 ヒーロー〜制作の流れまで実装済み）:
//   1. ヒーロー … 用意されたキービジュアル（文字入り）。PC=16:9・スマホ=縦長を出し分け。
//      文字が画像に焼き込まれているため cover で切り抜かず、原寸比率のまま画面幅いっぱいに表示
//      （フルHDでほぼ画面ぴったり。切り抜くと端の文字が欠ける）。
//   2. お悩み → 解決 … vootec の #solutio 相当。「掲載データから自動で中身が埋まる」が勝ち筋
//      （vootec は素材・原稿が店舗持ち。うちは二重入力ゼロ。第6便メモの差別化ポイント）。
//   3. 強み4つ … 自動連動・独自ドメイン・デザイン・公開後サポート（2026-08-15 に画像化）
//   4. デザインへの導線 … サムネ一覧そのものは /hp/templates/designs（専用ページ）へ移した
//      （2026-08-15。LPが縦に長く、料金・お問い合わせまで遠かったため）。
//      ここには「デザインを見る」ボタンだけを置く。総数は HP_PATTERN_COUNT で自動計算。
//   5. 料金 … 事業設計の確定値（第6便）。制作料165,000円/月々11,000円/更新料 年11,000円（全て税込）、
//      フクエス契約→制作料0円・＋ワーク両方契約→月々も0円。この数字を変えるときは営業資料・規約と必ず同時に。
//      2026-08-15 に他ブロックと同じく1枚画像へ差し替え（数字は焼き込み／sr-only と JSON-LD にも同じ数字がある）。
//      ※注意書き（作業依頼 3,300円・ドメインメール対象外）だけは画像に入っていないので可視テキストで残してある。
//   6. 制作の流れ … 5ステップを1枚画像に（2026-08-15）→ 直下に3つめの「デザインを見る」ボタン
//      → フッター（お問い合わせ）
//
// 画像: public/hp-lp/hero-pc.webp（1983×793・2.5:1）/ hero-sp.webp（864×1821・約1:2.1）。
// 差し替え時は同名で上書きすればよい（文字が焼き込まれているので比率を守ること）。
// ※ PC は当初 16:9（2400×1350）だったが「画面全部が画像で埋まって圧迫感がある」ため、
//   vootec のサンプルサイトと同じ 2.5:1 に変更（2026-08-09）。フルHDで下に次のセクションが覗く。
// ※ スマホは 4:5（1080×1350）から縦長の約1:2.1 へ差し替え（2026-08-15）。
//   ノートPC・タブレットの端末写真まで入れたぶん縦に伸びており、iPhone（幅390px）で高さ約822px＝ほぼ1画面。
//
// PROBLEM / SOLUTION / 強み4つ / DESIGN LINEUP / 料金 / 制作の流れ のブロックも画像化（すべて全幅・2026-08-15）:
//   problem-pc.webp（1672×941・16:9）/ problem-sp.webp（1024×1536・2:3）
//   solution-pc.webp（1672×941・16:9）/ solution-sp.webp（864×1821・約1:2.1）
//   strengths-pc.webp（1672×941・16:9）/ strengths-sp.webp（863×1822・約1:2.1）
//   design-pc.webp（1717×916・約1.87:1）/ design-sp.webp（862×1935・約1:2.24）
//   price-pc.webp（1717×916・約1.87:1）/ price-sp.webp（864×1821・約1:2.11）
//     … 料金の数字が焼き込み。作り直すときは sr-only と SERVICE_JSON_LD の数字も必ず揃えること。
//   flow-pc.webp（1717×916・約1.87:1）/ flow-sp.webp（864×1821・約1:2.11）
//     ★ flow-sp は 2026-08-16 に作り直し（下端の継ぎ目が 37 と全ブロック中で最大だったため）。
//       いただいた原本のままだと下端24。ページ背景となじませるため、下端20pxだけを
//       #fdf5f5 へグラデーションで寄せる後処理を入れてある（design-sp の外周と同じ考え方）。結果は下端1。
//       次に作り直してもらうときは【下端20〜30pxを #fdf5f5 に寄せた状態】で書き出してもらうと、この後処理が不要になる。
//       高さが1820→1821に1px変わっているので、<source> の height と tools-verify-hp.mjs の spWH も直すこと。
//     … ステップ02の「16パターンから選択」が焼き込み（sr-only は HP_PATTERN_COUNT で自動計算）。
//   ＋直下のボタン btn-design-pc.webp（1564×413）/ btn-design-sp.webp（900×276）… どちらも背景が透明の webp。
//     ★元データは黒背景の JPEG で届いたため、黒を抜いて透明化し、暗い背景用に描かれていた
//       外周の光彩（黄〜赤）はページのピンク地で汚れて見えるので削ってある（2026-08-15）。
//       作り直すときは【透過PNG・外周の光彩なし】で書き出してもらうと、この加工が不要になる。
//   ※ design-sp は全幅で置くので、中身が画像の中で左右中央に来ているか必ず確認すること。
//     初版は右側に空白が寄っていて、実機で中身が左にずれて見えた（2026-08-15 に作り直し）。
//   ※ design-sp は外周に純白(#ffffff)の縁が左右35px入っており、スマホで白い帯として見えていたため、
//     枠から繋がっている白だけをページ背景(#fdf5f5)へ塗り替えてある（内側の白いパネルは触っていない）。
//     作り直すときは【外周をページ背景と同じ #fdf5f5 にする】と、この加工が不要になる。
// 見出しと本文が焼き込み済み。文章は sr-only で HTML にも残してある
// （差し替えるときは sr-only の文言も画像と揃えること）。
//
// デザイン一覧（サムネ16枚と各デザインの「デモを見る」）は /hp/templates/designs にある。
// デモのリンク先は /hp/demo/preview/{template}/{color}。demo は HP_DEMO_SLUG の予約 slug で、
// この slug に限りプレビューがログイン不要（★デモ用サロンの用意は保留中・2026-08-09。行が無い間は 404 になる）。
//
// 静的セグメントなので /hp/[slug] より優先される（slug='templates' は発行禁止。HP_RESERVED_SLUGS）。

// 掲載する総パターン数は定義から数える（カラーを足し引きしても文言がずれないように・2026-08-11）。
// ※ metadata の description からも参照するので、metadata より前に置いておくこと（2026-08-15）。
const HP_PATTERN_COUNT = HP_TEMPLATES.reduce((n, t) => n + HP_COLOR_VARIANTS[t.key].length, 0);

// title / description / OGP で同じ文言を使うので定数にまとめてある（2026-08-15）。
// ここを直せば検索結果・SNSカードの両方が一度に揃う（片方だけ古くなる事故を防ぐ）。
const PAGE_TITLE = 'メンズエステ専門の公式ホームページ制作｜フクエス';
// パターン数は HP_PATTERN_COUNT から作る。以前は「20パターン」とベタ書きで、
// 実際の16と食い違っていた（2026-08-15 修正）。
const PAGE_DESCRIPTION = `フクエス掲載店舗さま向け・メンズエステ専門の公式ホームページ制作。集客・信頼・ブランディングを加速させる、高級感のあるデザイン${HP_PATTERN_COUNT}パターン。ドメイン取得から制作・運用まで運営がすべて対応します。`;

// OGP画像（1200×630＝OGP標準の1.91:1）。hero-pc.webp を横幅に合わせて縮め、
// 上下の余りをページ背景 #fdf5f5 で埋めたもの（文字が焼き込まれているので切り抜かない）。
// ★ webp ではなく jpg にしてあるのは、LINE など webp のOGPを表示しない環境があるため。
// ★ ヒーロー画像を差し替えたら、この画像も作り直すこと。
const PAGE_OGP_IMAGE = '/hp-lp/ogp-hp-templates.jpg';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  // ★ canonical は必ずページごとに入れること。省くと layout.tsx の { canonical: '/' } を継承し、
  //   「このページはトップの複製」と伝わって検索結果から外れる（2026-08-15 修正。サイトの他50ページと同じ作法）。
  alternates: { canonical: '/hp/templates' },
  // ★ OGP もページごとに入れること（2026-08-15 追加）。省くと layout.tsx の
  //   「福岡メンズエステ情報・口コミポータルサイト【フクエス】」＋ /ogp.png をそのまま継承し、
  //   営業でこのURLを掲載店さまへLINE・メールで送ったときのカードが
  //   「ポータルサイトの宣伝」になってしまう（title/description は上書き済みなのにOGPだけ漏れていた）。
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: '/hp/templates',
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

/**
 * デザイン一覧への画像ボタン（2026-08-15）。ヒーロー直下・DESIGN LINEUP 直下・FLOW 直下の3か所で使う。
 * 見た目を1か所にまとめてあるので、片方だけズレることがない。
 *
 * btn-design-pc/sp.webp は背景が透明なので、ページのピンク地にそのまま乗る。
 * ボタンの文字は画像に焼き込まれているため、alt に「デザインを見る」を入れてリンク名にする
 * （alt="" にすると読み上げでリンク名が消える）。
 * ホバーはわずかな拡大のみ。透明画像なので box-shadow は使わないこと（四角い影が出る）。
 * ★ testId は3か所すべてで違う値にすること（同じだと検証スクリプトが1つ目しか掴めない）。
 * eager: ヒーロー直下のボタンは最初の画面に入るので true（遅延させると表示が遅れる）。
 *        ページ下部のボタンは false＝loading="lazy"。
 */
function DesignCtaButton({
  testId,
  padCls,
  eager = false,
  children,
}: {
  testId: string;
  padCls: string;
  eager?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`mx-auto max-w-5xl px-5 text-center ${padCls}`}>
      <Link
        href="/hp/templates/designs"
        data-testid={testId}
        aria-label="デザインを見る"
        className="group inline-block w-full max-w-[340px] sm:max-w-[520px] align-middle"
      >
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/btn-design-sp.webp" width={900} height={276} />
          <img
            src="/hp-lp/btn-design-pc.webp"
            alt="デザインを見る"
            loading={eager ? undefined : 'lazy'}
            width={1564}
            height={413}
            className="block w-full h-auto transition-transform duration-300 ease-out group-hover:scale-[1.03] group-active:scale-100"
          />
        </picture>
      </Link>
      {children}
    </div>
  );
}

// 構造化データ（2026-08-15 追加）。
// ★ 画面に出ていない内容を書かないこと。料金の3つはこのページの「料金プラン」に実際に出ている数字で、
//   変えるときは表示・営業資料・規約と必ず同時に直す（ベタ書きの数字が食い違うと構造化データ違反になる）。
const SERVICE_JSON_LD = {
  '@context': 'https://schema.org/',
  '@type': 'Service',
  name: 'メンズエステ専門の公式ホームページ制作',
  serviceType: 'ホームページ制作',
  description:
    'フクエス掲載店舗さま向けの公式ホームページ制作。掲載中のセラピスト・出勤・料金・写メ日記・口コミが自動で連動し、ドメイン取得から制作・運用まで運営が対応します。',
  url: 'https://fukues.com/hp/templates',
  areaServed: { '@type': 'AdministrativeArea', name: '福岡県' },
  provider: { '@type': 'Organization', name: 'フクエス', url: 'https://fukues.com/' },
  offers: [
    { '@type': 'Offer', name: '制作料（初回のみ）', price: '165000', priceCurrency: 'JPY' },
    { '@type': 'Offer', name: '月額利用料', price: '11000', priceCurrency: 'JPY' },
    { '@type': 'Offer', name: 'ドメイン更新料（年額）', price: '11000', priceCurrency: 'JPY' },
  ],
};

/**
 * よくあるご質問（2026-08-16 追加）。
 *
 * ★ 画面に出す可視テキストと FAQ_JSON_LD の両方が、この1か所から作られる。
 *   文言を直すときはここだけを直せば両方そろう（片方だけ古くなる事故を防ぐ）。
 *
 * ★ 中身はすべて、このページの他ブロック（料金・強み・制作の流れ・※注意書き）に
 *   すでに書いてある事実だけで構成してある。ここに新しい取引条件を書き足さないこと。
 *   料金を変えるときは【画像の作り直し＋sr-only＋SERVICE_JSON_LD＋ここ＋営業資料＋規約】を必ず同時に。
 *
 * ※ このブロックを入れた理由: LP を全ブロック画像化した結果、可視テキストが302文字
 *   （h1・※注意書き・フッターのみ）まで減っていたため。FAQ は画像にせず文字のまま置く。
 * ※ アコーディオン（<details>）にしていないのは、閉じている状態だと可視テキストとして数えられず、
 *   このブロックを入れた意味が薄れるため。7件なら開きっぱなしでも長すぎない。
 */
const HP_FAQ: { q: string; a: string }[] = [
  {
    q: '写真や文章は自分で用意する必要がありますか？',
    a: '必要ありません。フクエスに掲載中のセラピスト・本日の出勤・料金・写メ日記・口コミが、そのまま公式ホームページに反映されます。ドメインの取得からキービジュアルの制作、写真や文章の設定まで運営がおこないます。',
  },
  {
    // 2026-08-16 追加（オーナー確認済み）。営業でよく聞かれる前提条件なので料金より前に置く。
    q: 'フクエスに掲載していなくても作れますか？',
    a: 'はい、フクエスに掲載していないお店でも制作できます。ただし、掲載中のお店は制作料が0円になるほか、セラピスト・本日の出勤・料金・写メ日記・口コミがそのまま公式ホームページに反映されるなど、ご掲載いただくことで受けられる恩恵が多くあります。公式ホームページをお作りになるなら、フクエスへのご掲載も同時にご検討いただくのがおすすめです。',
  },
  {
    q: '料金はいくらですか？',
    a: '制作料165,000円（初回のみ）、月額利用料11,000円、ドメイン更新料11,000円（年額）です。表示はすべて税込です。',
  },
  {
    q: 'フクエスに掲載していると割引がありますか？',
    a: 'フクエスに掲載中のお店は、制作料165,000円が0円になります。フクエスワークにもご掲載のお店は、月額利用料11,000円も0円です。両方ご掲載の場合、年間11,000円（ドメイン更新料のみ）で公式ホームページを持てます。',
  },
  {
    q: '公開したあとの更新は誰がおこないますか？',
    a: 'いつものフクエスの管理画面を更新すれば、公式ホームページにも自動で反映されます。写真や文章は専用の管理画面からいつでも変更いただけます。ご質問は無料です。ページ内容の変更などの作業をご依頼いただく場合は、1回3,300円（複雑な作業はお見積り）です。',
  },
  {
    q: 'デザインは選べますか？',
    a: `4つのひな形×カラーの全${HP_PATTERN_COUNT}パターンからお選びいただけます。デザイン一覧のページで、実際のキービジュアルとデモページをご覧いただけます。`,
  },
  {
    q: '独自ドメインの取得や更新はどうなりますか？',
    a: 'お店だけの独自ドメインを、運営が取得・管理・自動更新します。面倒な手続きは一切ありません。なお、独自ドメインのメールアドレスは対象外です。',
  },
  {
    q: 'お申し込みからどのように進みますか？',
    a: 'お申し込み → デザインを決める → 運営が制作 → ご確認・公開 → 公開後の更新、の5ステップです。担当者までご連絡いただければ、ご契約状況に応じた料金をご案内します。',
  },
  {
    // 2026-08-16 追加（オーナー確認済み）。「1週間前後」はここにしか書いていない数字なので、
    // 変えるときは営業資料と必ず同時に直すこと。
    q: '制作期間はどれくらいですか？',
    a: 'お申し込みから1週間前後での納品となります。デザインをお決めいただいたあと、ドメインの取得からキービジュアルの制作、写真や文章の設定まで運営がおこないます。',
  },
];

/**
 * FAQ の構造化データ（2026-08-16）。上の HP_FAQ から自動生成するので文言のズレは起きない。
 *
 * ※ Google は 2023-08 に FAQ リッチリザルトの表示対象を「政府・医療などの公式サイト」へ絞ったため、
 *   【この markup で検索結果の見た目が変わることは期待できない】。それでも入れているのは、
 *   ページの意味づけが正しくなることと、他の検索エンジン・AIクローラーが読む余地があるため。
 *   リッチリザルト目当ての施策ではない、と理解しておくこと。
 */
const FAQ_JSON_LD = {
  '@context': 'https://schema.org/',
  '@type': 'FAQPage',
  mainEntity: HP_FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

/**
 * 金の細い罫とダイヤの飾り（FAQ の見出しの下）。
 * ※ /hp/templates/designs にも同じ見た目のものがあるが、あちらはあちらで完結させてある。
 *   共通化していないのは、片方のデザインを触ったときに、もう片方が巻き添えで変わるのを避けるため。
 */
function GoldRule() {
  return (
    <span className="flex items-center justify-center gap-2 text-[#d5a86b]" aria-hidden="true">
      <span className="block h-px w-10 bg-gradient-to-r from-transparent to-[#d5a86b] sm:w-16" />
      <span className="block h-1.5 w-1.5 rotate-45 bg-[#d5a86b]" />
      <span className="block h-px w-10 bg-gradient-to-l from-transparent to-[#d5a86b] sm:w-16" />
    </span>
  );
}

export default function HpTemplatesPage() {
  return (
    <div className="min-h-screen bg-[#fdf5f5] text-[#4a3f3a]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: toJsonLdString(
            buildBreadcrumbJsonLd([
              { name: 'トップ', path: '/' },
              { name: 'ホームページ制作', path: '/hp/templates' },
            ]),
          ),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(SERVICE_JSON_LD) }} />
      {/* FAQ（2026-08-16）。画面下部の「よくあるご質問」と同じ HP_FAQ から作っているので、
          表示と構造化データが食い違うことはない。※リッチリザルトは期待できない（FAQ_JSON_LD のコメント参照）。 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(FAQ_JSON_LD) }} />
      {/* ── ヒーロー（KV・文字焼き込み済み）──
          PC は 2.5:1・スマホは縦長を <picture> で出し分け。文字が欠けるため cover 切り抜きはしない。
          他ブロックと同じで、画像は装飾扱い（alt=""）にして文章は sr-only の実テキストで持つ。
          ★ h1 は 2026-08-15 に【この下の可視セクション】へ移した。ここの sr-only には h1 を戻さないこと
            （h1 が2本になる）。リード文の <p> だけが sr-only に残っている。 */}
      <section>
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/hero-sp.webp" width={864} height={1821} />
          {/* ※ eslint-disable は不要（no-img-element は <picture> 内の <img> には出ない）・2026-08-15 */}
          <img
            src="/hp-lp/hero-pc.webp"
            width={1983}
            height={793}
            alt=""
            className="block w-full h-auto"
            fetchPriority="high"
          />
        </picture>
        <div className="sr-only">
          <p>
            集客につながる、公式ホームページを。フクエスの掲載情報と自動で連動します。
            デザイン性・スマホ対応・集客サポートまで、すべてのデバイスで美しく、使いやすく。
          </p>
        </div>
      </section>

      {/* ── ページ見出し（可視の h1）── 2026-08-15 追加
          それまで h1 はヒーローの sr-only の中だけにあり、LPの画面上には可視の見出しが1つも無かった
          （全ブロックを画像化したため、可視テキストが283文字＝※注意書きとフッターだけになっていた）。
          ヒーロー画像に焼き込まれた「メンズエステ専門」「集客につながる、公式ホームページを。」を、
          そのまま文字で受け直す位置に置いてある。
          ★ ここが LP で唯一の可視 h1。ボタンより上に置くこと（下に回すとページの主題がCTAの後ろになる）。
          ★ 文言を変えたら tools-verify-hp.mjs の VISIBLE_MUST と LP_HEADINGS も同時に直す（危険地帯41）。
          ※ スマホではヒーローだけで1画面（390px幅で約822px）が埋まるので、このぶんボタンが73px下がっても
            初回表示に見えるものは変わらない（2026-08-15 実測）。 */}
      <section className="pt-8 sm:pt-10">
        <div className="mx-auto max-w-5xl px-5 text-center">
          <h1 className="text-base font-semibold leading-relaxed tracking-[0.04em] text-[#8a6a55] sm:text-[19px]">
            メンズエステ専門の公式ホームページ制作
          </h1>
          {/* 金の細い罫（両端が透明に抜けるグラデーション）。下のボタンとの区切り。 */}
          <div className="mx-auto mt-3.5 h-px w-14 bg-gradient-to-r from-transparent via-[#d8b98a] to-transparent" />
        </div>
      </section>

      {/* ── ヒーロー直下のデザイン導線（2026-08-15 追加）──
          ページを下まで読まなくてもデザイン一覧へ行けるように、同じボタンをもう1つ置く。
          下の PROBLEM 側は pt-14 のままにしておくこと（ヒーロー下端とPROBLEM画像上端は色が違うため、
          間にページ背景を挟んで継ぎ目を目立たなくしている）。 */}
      <DesignCtaButton testId="lp-design-cta-hero" padCls="pt-8 sm:pt-10" eager />

      {/* ── お悩み（PROBLEM）── */}
      {/* 見出し＋お悩み3枚が焼き込まれた1枚画像（2026-08-15）。ヒーローと同じ全幅で置く。
          画像は装飾扱い（alt=""）にして、見出しと本文は sr-only の実テキストで持つ。
          こうすると読み上げで画像altと本文が二重に読まれず、検索エンジンには文章が残る。
          ※上の pt-14 は詰めないこと：ヒーロー下端（#f2e9e5〜）とこの画像の上端（#fdf1f0）は色が違うため、
            直付けすると横一直線の継ぎ目が出る。間にページ背景（#fdf5f5）を挟むと目立たない。 */}
      <section className="pt-14 sm:pt-16">
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/problem-sp.webp" width={1024} height={1536} />
          <img
            src="/hp-lp/problem-pc.webp"
            loading="lazy"
            width={1672}
            height={941}
            alt=""
            className="block w-full h-auto"
            decoding="async"
          />
        </picture>
        <div className="sr-only">
          <h2>こんなお悩みはありませんか？</h2>
          <ul>
            {[
              ['ポータル頼みになっている', '検索してくれたお客様に見せる「お店の公式の顔」がなく、信頼感・ブランドづくりで一歩届かない。'],
              ['制作会社は高くて面倒', '見積もりも打ち合わせも大ごと。写真や原稿も全部自分で用意してほしいと言われてしまう。'],
              ['作っても更新が続かない', 'セラピストの入れ替わりや出勤の変化にHPが追いつかず、気づけば古い情報のまま放置。'],
            ].map(([t, d]) => (
              <li key={t}>{t}：{d}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 解決（SOLUTION・勝ち筋）── */}
      {/* 見出し＋本文＋連動イメージ図が焼き込まれた1枚画像（2026-08-15）。PROBLEM と同じ全幅。
          画像は装飾扱い（alt=""）にして、見出しと本文は sr-only の実テキストで持つ。
          文言は画像の焼き込みと同じ。差し替えるときは両方そろえること。 */}
      <section className="pt-10 sm:pt-12">
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/solution-sp.webp" width={864} height={1821} />
          <img
            src="/hp-lp/solution-pc.webp"
            loading="lazy"
            width={1672}
            height={941}
            alt=""
            className="block w-full h-auto"
            decoding="async"
          />
        </picture>
        <div className="sr-only">
          <h2>フクエスの掲載データが、そのまま公式ホームページに。</h2>
          <p>
            セラピスト・本日の出勤・料金・写メ日記・口コミは、いつものフクエスの管理画面を更新するだけで
            公式ホームページにも自動で反映。HPのための二重入力はゼロです。
            写真や原稿をイチから用意する必要はありません。
          </p>
        </div>
      </section>

      {/* ── 強み4つ ── */}
      {/* 01〜04が焼き込まれた1枚画像（2026-08-15）。PROBLEM / SOLUTION と同じ全幅。
          画像は装飾扱い（alt=""）にして、見出しと本文は sr-only の実テキストで持つ。
          ★「選べるデザイン◯種」の数字だけは画像に焼き込まれている（sr-only 側は
            HP_PATTERN_COUNT で自動計算）。カラーを足し引きしたときは画像も作り直すこと。 */}
      <section className="pt-10 sm:pt-12">
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/strengths-sp.webp" width={863} height={1822} />
          <img
            src="/hp-lp/strengths-pc.webp"
            loading="lazy"
            width={1672}
            height={941}
            alt=""
            className="block w-full h-auto"
            decoding="async"
          />
        </picture>
        <div className="sr-only">
          <h2>フクエスの公式ホームページ制作の強み</h2>
          <ul>
            {[
              ['掲載データと自動連動', 'セラピスト・出勤・料金・写メ日記・口コミをそのまま表示。フクエスを更新すればHPも常に最新。'],
              ['独自ドメイン', 'お店だけのドメインを運営が取得・管理・自動更新。面倒な手続きは一切ありません。'],
              [`選べるデザイン${HP_PATTERN_COUNT}種`, '高級感のある4つのひな形×カラー。お店の雰囲気に合わせてお選びいただけます。'],
              ['公開後も安心サポート', '写真や文章は専用の管理画面からいつでも変更OK。ご質問は無料で承ります。'],
            ].map(([t, d]) => (
              <li key={t}>{t}：{d}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── デザイン一覧への導線（見出し・サムネは画像／一覧本体は /hp/templates/designs）── */}
      {/* 画像は装飾扱い（alt=""）。見出しと本文は sr-only の実テキストで持つ。
          ★「全◯パターン」の数字が画像に焼き込まれている（sr-only 側は HP_PATTERN_COUNT で自動計算）。
            カラーを足し引きしたときは画像も作り直すこと。 */}
      <section id="design" className="pt-10 sm:pt-12">
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/design-sp.webp" width={862} height={1935} />
          <img
            src="/hp-lp/design-pc.webp"
            loading="lazy"
            width={1717}
            height={916}
            alt=""
            className="block w-full h-auto"
            decoding="async"
          />
        </picture>
        <div className="sr-only">
          <h2>選べるデザイン 全{HP_PATTERN_COUNT}パターン</h2>
          <p>
            4つのひな形 × カラーをご用意しました。気になるデザインが決まりましたら、担当者までお知らせください。
            ドメイン取得・制作・写真や文章の設定まで、すべて運営がおこなって納品します。
          </p>
        </div>

        <DesignCtaButton testId="lp-design-cta" padCls="pt-8 sm:pt-10">
          <p className="mt-3 sm:mt-4 text-[11px] sm:text-[12px] text-[#a08e84]">
            タイプS・A・B・C の全{HP_PATTERN_COUNT}パターンを、実際のキービジュアルとデモページでご覧いただけます。
          </p>
        </DesignCtaButton>
      </section>


      {/* ── 料金（PRICE）── */}
      {/* 見出し＋料金3つ＋特別優待が焼き込まれた1枚画像（2026-08-15）。他ブロックと同じ全幅。
          画像は装飾扱い（alt=""）にして、見出しと本文は sr-only の実テキストで持つ。
          ★ 数字は事業設計の確定値（2026-08-08・第6便メモ）。画像・sr-only・SERVICE_JSON_LD の
            3か所に同じ数字があるので、料金を変えるときは【画像の作り直し＋sr-only＋JSON-LD＋営業資料＋規約】を必ず同時に。
          ★ ※注意書き（作業依頼 3,300円／ドメインメール対象外）は画像に入っていない。
            取引条件そのものなので sr-only ではなく可視テキストのまま残すこと。 */}
      <section className="pt-10 sm:pt-12">
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/price-sp.webp" width={864} height={1821} />
          <img
            src="/hp-lp/price-pc.webp"
            loading="lazy"
            width={1717}
            height={916}
            alt=""
            className="block w-full h-auto"
            decoding="async"
          />
        </picture>
        <div className="sr-only">
          <h2>料金プラン</h2>
          <p>表示はすべて税込です。</p>
          <ul>
            {[
              ['制作料', '165,000円（初回のみ）', 'デザイン設定・キービジュアル制作・写真や文章の設定まで込み'],
              ['月額利用料', '11,000円/月', 'サーバー・システム利用・掲載データとの自動連動'],
              ['ドメイン更新料', '11,000円/年', 'お店の独自ドメインの維持費。取得・管理・更新は運営が代行'],
            ].map(([t, n, d]) => (
              <li key={t}>{t}：{n}。{d}</li>
            ))}
          </ul>
          <h3>フクエス掲載店さま限定の特別優待</h3>
          <ul>
            <li>フクエスに掲載中なら、制作料 165,000円 → 0円。</li>
            <li>フクエスワークにもご掲載なら、月額 11,000円 → 0円。</li>
          </ul>
          <p>両方ご掲載のお店は、年間 11,000円（ドメイン更新料のみ）で公式ホームページを持てます。</p>
        </div>

        <div className="mx-auto max-w-5xl px-5">
          <p className="mt-6 sm:mt-7 text-[11px] leading-relaxed text-[#a08e84] text-center">
            ※ ご質問は無料。ページ内容の変更などの作業をご依頼いただく場合は1回 3,300円（複雑な作業はお見積り）。
            ※ 独自ドメインのメールアドレスは対象外です。詳細はお申し込み時の利用規約をご確認ください。
          </p>
        </div>
      </section>

      {/* ── 制作の流れ（FLOW）── */}
      {/* 見出し＋01〜05のステップが焼き込まれた1枚画像（2026-08-15）。他ブロックと同じ全幅。
          画像は装飾扱い（alt=""）にして、見出しと本文は sr-only の実テキストで持つ。
          手順なので sr-only 側は <ol> のまま（番号の意味を読み上げ・検索エンジンに残す）。
          ★ ステップ02の「16パターンから選択」は画像に焼き込まれている（sr-only 側は HP_PATTERN_COUNT で
            自動計算）。カラーを足し引きしたときは flow-pc/sp も作り直すこと。
          ※ 下の pb-12 は、もともと白いフッターとの段差よけだった（危険地帯38）。2026-08-16 に
            直下へFAQブロックが入ったので、いまは FAQ との間隔として効いている。
            フッターとの段差よけの役目はFAQブロック側の pb-12 sm:pb-14 に移した。 */}
      <section className="pt-10 sm:pt-12 pb-12 sm:pb-14">
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/flow-sp.webp" width={864} height={1821} />
          <img
            src="/hp-lp/flow-pc.webp"
            loading="lazy"
            width={1717}
            height={916}
            alt=""
            className="block w-full h-auto"
            decoding="async"
          />
        </picture>
        <div className="sr-only">
          <h2>制作の流れ</h2>
          <ol>
            {[
              ['お申し込み', '担当者までご連絡ください。ご契約状況に応じた料金をご案内します。'],
              ['デザインを決める', `デザイン一覧の${HP_PATTERN_COUNT}パターンから、担当者とご相談のうえお選びいただきます。`],
              ['運営が制作', 'ドメイン取得からキービジュアル・写真・文章の設定まで運営が行います。'],
              ['ご確認・公開', '仕上がりをご確認いただき、OKをいただいたら公開します。'],
              ['公開後の更新', 'フクエスを更新するだけでHPも最新に。写真や文章の変更も管理画面から。'],
            ].map(([t, d]) => (
              <li key={t}>{t}：{d}</li>
            ))}
          </ol>
        </div>

        {/* 3つめのデザイン導線（2026-08-15 追加）。ページを最後まで読んだ人の受け皿。
            ★ testId は他の2か所と必ず変えること（同じだと検証スクリプトが1つ目しか掴めない）。
            画像はヒーロー直下のボタンと同じ btn-design-*.webp なので、追加の転送は発生しない。 */}
        <DesignCtaButton testId="lp-design-cta-flow" padCls="pt-8 sm:pt-10" />
      </section>

      {/* ── よくあるご質問（FAQ）── 2026-08-16 追加
          LPで唯一の「まとまった可視テキスト」。他ブロックと違い画像化しないこと（画像にすると
          このブロックを入れた意味が消える。可視テキストが302文字まで減っていたのが発端）。
          中身は HP_FAQ（上）から作る。文言を直すときはあちらだけを直せば JSON-LD もそろう。
          ★ pb-12 sm:pb-14 は詰めないこと：直下が白いフッター（border-t bg-white）で、
            白いカードと直接ぶつかると境目が消えて1枚に見える。間にページ背景を挟んでいる
            （FLOWブロックが持っていた役目が、このブロックに移った・危険地帯38）。 */}
      <section id="faq" className="pb-12 sm:pb-14">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-center text-[11px] font-bold tracking-[0.3em] text-[#c9a06a]">FAQ</p>
          <h2 className="mt-2 text-center text-lg font-semibold tracking-[0.04em] text-[#4a3f3a] sm:text-2xl">
            よくあるご質問
          </h2>
          <div className="mt-3">
            <GoldRule />
          </div>

          {/* dl/dt/dd で組む（Q&A の意味がそのまま構造になる）。
              Q. / A. の記号は装飾なので aria-hidden にして読み上げから外す。 */}
          <dl className="mt-8 space-y-4 text-left sm:mt-10">
            {HP_FAQ.map(({ q, a }) => (
              <div key={q} className="rounded-2xl border border-[#f0dde0] bg-white/80 px-5 py-5 sm:px-7 sm:py-6">
                <dt className="flex gap-3 text-[15px] font-semibold leading-relaxed text-[#4a3f3a] sm:text-base">
                  <span aria-hidden="true" className="shrink-0 font-bold text-[#c9a06a]">Q.</span>
                  <span>{q}</span>
                </dt>
                <dd className="mt-3 flex gap-3 text-[13px] leading-[1.9] text-[#7a6a62] sm:text-sm">
                  <span aria-hidden="true" className="shrink-0 font-bold text-[#c9808f]">A.</span>
                  <span>{a}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── FAQ を読み終えた人の受け皿（2026-08-16 追加）──
            上から「デザインを見る」→「制作について問い合わせる」の順。
            ここまで読んだ人は検討が進んでいるので、見るだけで終わらせず申し込みまで置く。
            ★ testId は他の3か所と必ず変えること（同じだと検証スクリプトが1つ目しか掴めない）。
            ★ ボタン画像を1か所増やしたので tools-verify-hp.mjs の BTN_COUNT を 3→4 に、
              内部リンクが2本増えたので internal を 7→9 に直してある。
              片方だけ直すと回帰チェックが落ちる。
            ★ 問い合わせボタンは btn-contact-pc.webp（1564×425・背景透過）。
              デザインボタンと違い SP 用の別画像は無いので <picture> にしていない。
              いただいた元画像は背景が白のPNGだったので、外周から連結した白だけを
              透過に落として切り抜いてある（内側の白いハイライト・真珠・文字は残している）。
              作り直すときも背景透過のまま渡すこと。白背景のまま置くと、ページの
              ピンク地（#fdf5f5）の上に白い長方形が浮く。 */}
        <DesignCtaButton testId="lp-design-cta-faq" padCls="pt-10 sm:pt-12" />

        <div className="mx-auto max-w-5xl px-5 pt-3 sm:pt-4 text-center">
          <Link
            href="/hp/templates/contact"
            data-testid="lp-contact-cta-faq"
            aria-label="制作について問い合わせる"
            className="group inline-block w-full max-w-[340px] sm:max-w-[520px] align-middle"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hp-lp/btn-contact-pc.webp"
              alt="制作について問い合わせる"
              loading="lazy"
              width={1564}
              height={425}
              className="block w-full h-auto transition-transform duration-300 ease-out group-hover:scale-[1.03] group-active:scale-100"
            />
          </Link>
          <p className="mt-3 text-[12px] leading-relaxed text-[#a08e84]">
            ご相談だけでも構いません。この時点で費用は発生しません。
          </p>
        </div>
      </section>

      {/* ── フッター（お問い合わせ）── */}
      <footer className="border-t border-[#f0dde0] bg-white">
        <div className="mx-auto max-w-5xl px-5 py-10 text-center space-y-3">
          <p className="text-[13px] leading-relaxed text-[#6d5d53]">
            <Link href="/hp/templates/designs" className="underline text-[#c9808f] hover:text-[#b96f7e]">デザイン一覧</Link>
            の「デモを見る」から、サンプル店舗のデータが入った実際のページをご覧いただけます。
            <br className="hidden sm:block" />
            写真・文章・表示する内容は、お店ごとに運営がカスタマイズしてお納めします。
          </p>
          <p className="text-[12px] text-[#a08e84]">
            掲載・制作のご相談：フクエス運営事務局（
            <a href="mailto:info@fukues.com" className="underline text-[#b98d4f] hover:text-[#9a743c]">info@fukues.com</a>
            ）
          </p>
          {/* サイト内への戻り導線（2026-08-15 追加）。
              /hp 配下は本体のヘッダー・フッターを出さない作りなので、ここが唯一の出口になる。
              これが無いとこのページからサイト内の他ページへ1本もリンクが無い状態だった。 */}
          <nav aria-label="サイト内リンク" className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap pt-1 text-[12px]">
            <Link href="/" className="text-[#b98d4f] hover:text-[#9a743c] underline">フクエス トップ</Link>
            <Link href="/listing" className="text-[#b98d4f] hover:text-[#9a743c] underline">掲載について</Link>
            <Link href="/hp/templates/designs" className="text-[#b98d4f] hover:text-[#9a743c] underline">デザイン一覧</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
