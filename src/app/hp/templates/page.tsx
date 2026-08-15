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
//   6. 制作の流れ 5ステップ → フッター（お問い合わせ）
//
// 画像: public/hp-lp/hero-pc.webp（1983×793・2.5:1）/ hero-sp.webp（864×1821・約1:2.1）。
// 差し替え時は同名で上書きすればよい（文字が焼き込まれているので比率を守ること）。
// ※ PC は当初 16:9（2400×1350）だったが「画面全部が画像で埋まって圧迫感がある」ため、
//   vootec のサンプルサイトと同じ 2.5:1 に変更（2026-08-09）。フルHDで下に次のセクションが覗く。
// ※ スマホは 4:5（1080×1350）から縦長の約1:2.1 へ差し替え（2026-08-15）。
//   ノートPC・タブレットの端末写真まで入れたぶん縦に伸びており、iPhone（幅390px）で高さ約822px＝ほぼ1画面。
//
// PROBLEM / SOLUTION / 強み4つ / DESIGN LINEUP のブロックも画像化（すべて全幅・2026-08-15）:
//   problem-pc.webp（1672×941・16:9）/ problem-sp.webp（1024×1536・2:3）
//   solution-pc.webp（1672×941・16:9）/ solution-sp.webp（864×1821・約1:2.1）
//   strengths-pc.webp（1672×941・16:9）/ strengths-sp.webp（863×1822・約1:2.1）
//   design-pc.webp（1717×916・約1.87:1）/ design-sp.webp（862×1935・約1:2.24）
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

export const metadata: Metadata = {
  title: 'メンズエステ専門の公式ホームページ制作｜フクエス',
  // パターン数は HP_PATTERN_COUNT から作る。以前は「20パターン」とベタ書きで、
  // 実際の16と食い違っていた（2026-08-15 修正）。
  description:
    `フクエス掲載店舗さま向け・メンズエステ専門の公式ホームページ制作。集客・信頼・ブランディングを加速させる、高級感のあるデザイン${HP_PATTERN_COUNT}パターン。ドメイン取得から制作・運用まで運営がすべて対応します。`,
  // ★ canonical は必ずページごとに入れること。省くと layout.tsx の { canonical: '/' } を継承し、
  //   「このページはトップの複製」と伝わって検索結果から外れる（2026-08-15 修正。サイトの他50ページと同じ作法）。
  alternates: { canonical: '/hp/templates' },
};

/**
 * デザイン一覧への画像ボタン（2026-08-15）。ヒーロー直下と DESIGN LINEUP の直下の2か所で使う。
 * 見た目を1か所にまとめてあるので、片方だけズレることがない。
 *
 * btn-design-pc/sp.webp は背景が透明なので、ページのピンク地にそのまま乗る。
 * ボタンの文字は画像に焼き込まれているため、alt に「デザインを見る」を入れてリンク名にする
 * （alt="" にすると読み上げでリンク名が消える）。
 * ホバーはわずかな拡大のみ。透明画像なので box-shadow は使わないこと（四角い影が出る）。
 * ★ testId は2か所で必ず変えること（同じだと検証スクリプトが1つ目しか掴めない）。
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
      {/* ── ヒーロー（KV・文字焼き込み済み）──
          PC は 2.5:1・スマホは縦長を <picture> で出し分け。文字が欠けるため cover 切り抜きはしない。
          ★ h1 はここだけ。以前はページ内に h1 が1つも無く、見出しが h2 から始まっていた（2026-08-15 追加）。
            他ブロックと同じで、画像は装飾扱い（alt=""）にして文章は sr-only の実テキストで持つ。 */}
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
          <h1>メンズエステ専門の公式ホームページ制作</h1>
          <p>
            集客につながる、公式ホームページを。フクエスの掲載情報と自動で連動します。
            デザイン性・スマホ対応・集客サポートまで、すべてのデバイスで美しく、使いやすく。
          </p>
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


      {/* ── 料金 ──
          数字は事業設計の確定値（2026-08-08・第6便メモ）。変更時は営業資料・規約と必ず同時に直すこと */}
      <section className="bg-white border-y border-[#f0dde0]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
          <header className="text-center mb-10">
            <p className="text-[11px] tracking-[.3em] text-[#c99ba6] mb-2">PRICE</p>
            <h2 className="text-xl sm:text-2xl font-bold tracking-wider text-[#3f342e]">料金プラン</h2>
            <p className="mt-3 text-[13px] text-[#8a7a70]">表示はすべて税込です。</p>
          </header>

          <div className="grid sm:grid-cols-3 gap-3 mb-8">
            {[
              ['制作料', '165,000', '円', '初回のみ。デザイン設定・キービジュアル制作・写真や文章の設定まで込み'],
              ['月額利用料', '11,000', '円/月', 'サーバー・システム利用・掲載データとの自動連動'],
              ['ドメイン更新料', '11,000', '円/年', 'お店の独自ドメインの維持費。取得・管理・更新は運営が代行'],
            ].map(([t, n, u, d]) => (
              <div key={t} className="rounded-2xl border border-[#f0dde0] bg-[#fdf8f6] p-6 text-center">
                <p className="text-[12px] font-bold text-[#8a7a70] mb-2">{t}</p>
                <p className="text-[#3f342e]">
                  <span className="text-[30px] font-black tracking-tight">{n}</span>
                  <span className="ml-1 text-[12px] font-bold text-[#8a7a70]">{u}</span>
                </p>
                <p className="mt-3 text-[11px] leading-relaxed text-[#a08e84] text-left">{d}</p>
              </div>
            ))}
          </div>

          {/* 無料条件（いちばん言いたいところ） */}
          <div className="rounded-2xl bg-gradient-to-r from-[#f7dee3] via-[#fbeee7] to-[#f3e3d3] p-[1px]">
            <div className="rounded-2xl bg-white/95 px-6 py-7 sm:px-10">
              <p className="text-center text-[12px] tracking-[.2em] font-bold text-[#b98d4f] mb-4">
                フクエス掲載店さまの特別優待
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#ecd9c8] bg-[#fdf8f2] p-5 text-center">
                  <p className="text-[12px] font-bold text-[#6d5d53] mb-1.5">フクエスに掲載中なら</p>
                  <p className="text-[15px] font-black text-[#3f342e]">
                    制作料 165,000円 → <span className="text-[24px] text-[#c9808f]">0円</span>
                  </p>
                </div>
                <div className="rounded-xl border border-[#ecd9c8] bg-[#fdf8f2] p-5 text-center">
                  <p className="text-[12px] font-bold text-[#6d5d53] mb-1.5">フクエスワークにもご掲載なら</p>
                  <p className="text-[15px] font-black text-[#3f342e]">
                    月額 11,000円 → <span className="text-[24px] text-[#c9808f]">0円</span>
                  </p>
                </div>
              </div>
              <p className="mt-4 text-center text-[13px] font-bold text-[#3f342e]">
                両方ご掲載のお店は、<span className="text-[#c9808f]">年間 11,000円（ドメイン更新料のみ）</span>で公式ホームページを持てます。
              </p>
            </div>
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-[#a08e84] text-center">
            ※ ご質問は無料。ページ内容の変更などの作業をご依頼いただく場合は1回 3,300円（複雑な作業はお見積り）。
            ※ 独自ドメインのメールアドレスは対象外です。詳細はお申し込み時の利用規約をご確認ください。
          </p>
        </div>
      </section>

      {/* ── 制作の流れ ── */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
        <header className="text-center mb-10">
          <p className="text-[11px] tracking-[.3em] text-[#c99ba6] mb-2">FLOW</p>
          <h2 className="text-xl sm:text-2xl font-bold tracking-wider text-[#3f342e]">制作の流れ</h2>
        </header>
        <ol className="grid sm:grid-cols-5 gap-3">
          {[
            ['お申し込み', '担当者までご連絡ください。ご契約状況に応じた料金をご案内します。'],
            ['デザインを決める', `デザイン一覧の${HP_PATTERN_COUNT}パターンから、担当者とご相談のうえお選びいただきます。`],
            ['運営が制作', 'ドメイン取得からキービジュアル・写真・文章の設定まで運営が行います。'],
            ['ご確認・公開', '仕上がりをご確認いただき、OKをいただいたら公開します。'],
            ['公開後の更新', 'フクエスを更新するだけでHPも最新に。写真や文章の変更も管理画面から。'],
          ].map(([t, d], i) => (
            <li key={t} className="relative rounded-2xl border border-[#f0dde0] bg-white shadow-sm p-5 pt-6">
              <span className="absolute -top-3 left-5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#c9808f] text-white text-[12px] font-black shadow">
                {i + 1}
              </span>
              <p className="text-[13px] font-bold text-[#3f342e] mb-2">{t}</p>
              <p className="text-[11px] leading-relaxed text-[#8a7a70]">{d}</p>
            </li>
          ))}
        </ol>
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
