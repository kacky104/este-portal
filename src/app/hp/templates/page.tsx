import type { Metadata } from 'next';
import {
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  HP_DEMO_SLUG,
  type HpTemplateKey,
} from '@/app/lib/hpSite';
import {
  DesignThumb,
  HP_TEMPLATE_NOTES,
  hpDesignThumbObjectCls,
  hpDesignThumbSrc,
  hpVariantColors,
} from '@/app/hp/_templates/DesignThumb';

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
//   3. 強み4つ … 自動連動・独自ドメイン・デザイン・公開後サポート
//   4. デザイン一覧 … 4ひな形×カラー（タイプSは2色・A/B/Cは各6色）。
//      ヒーローに合わせた白×ピンク×金の明るいトーン。総数は HP_PATTERN_COUNT で自動計算。
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
// 各デザインの「デモを見る」は /hp/demo/preview/{template}/{color} へ。
// demo は HP_DEMO_SLUG の予約 slug で、この slug に限りプレビューがログイン不要
// （★デモ用サロンの用意は保留中・2026-08-09。行が無い間は 404 になる）。
//
// 静的セグメントなので /hp/[slug] より優先される（slug='templates' は発行禁止。HP_RESERVED_SLUGS）。

export const metadata: Metadata = {
  title: 'メンズエステ専門の公式ホームページ制作｜フクエス',
  description:
    'フクエス掲載店舗さま向け・メンズエステ専門の公式ホームページ制作。集客・信頼・ブランディングを加速させる、高級感のあるデザイン20パターン。ドメイン取得から制作・運用まで運営がすべて対応します。',
};

// 掲載する総パターン数は定義から数える（カラーを足し引きしても文言がずれないように・2026-08-11）。
const HP_PATTERN_COUNT = HP_TEMPLATES.reduce((n, t) => n + HP_COLOR_VARIANTS[t.key].length, 0);

// カラー数ごとのサムネ列数。少ない色数のひな形（タイプS）は1枚を大きく見せる。
const VARIANT_GRID_CLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

const TEMPLATE_TITLES: Record<HpTemplateKey, { en: string; name: string }> = {
  s: { en: 'GRACE', name: 'フラッグシップ' },
  a: { en: 'LUXE',  name: '高級・しっとり' },
  b: { en: 'CLEAN', name: '清潔感・癒やし' },
  c: { en: 'MODE',  name: '都会的・シャープ' },
};

export default function HpTemplatesPage() {
  return (
    <div className="min-h-screen bg-[#fdf5f5] text-[#4a3f3a]">
      {/* ── ヒーロー（KV・文字焼き込み済み）──
          PC は 2.5:1・スマホは縦長を <picture> で出し分け。文字が欠けるため cover 切り抜きはしない */}
      <section>
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/hero-sp.webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hp-lp/hero-pc.webp"
            alt="メンズエステ専門のホームページ制作 — 集客・信頼・ブランディングを加速させる。デザイン性・スマホ対応・集客サポート。すべてのデバイスで美しく、使いやすく。"
            className="block w-full h-auto"
            fetchPriority="high"
          />
        </picture>
      </section>

      {/* ── お悩み → 解決 ── */}
      <section className="mx-auto max-w-5xl px-5 pt-14 sm:pt-16">
        <header className="text-center mb-8">
          <p className="text-[11px] tracking-[.3em] text-[#c99ba6] mb-2">PROBLEM</p>
          <h2 className="text-xl sm:text-2xl font-bold tracking-wider text-[#3f342e]">
            こんなお悩みは<span className="text-[#c9808f]">ありませんか？</span>
          </h2>
        </header>
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          {[
            ['ポータル頼みになっている', '検索してくれたお客様に見せる「お店の公式の顔」がなく、信頼感・ブランドづくりで一歩届かない。'],
            ['制作会社は高くて面倒', '見積もりも打ち合わせも大ごと。写真や原稿も全部自分で用意してほしいと言われてしまう。'],
            ['作っても更新が続かない', 'セラピストの入れ替わりや出勤の変化にHPが追いつかず、気づけば古い情報のまま放置。'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-[#f0dde0] bg-white shadow-sm p-5">
              <p className="text-[13px] font-bold text-[#3f342e] mb-2">{t}</p>
              <p className="text-[12px] leading-relaxed text-[#8a7a70]">{d}</p>
            </div>
          ))}
        </div>

        {/* 解決（勝ち筋） */}
        <div className="rounded-2xl bg-gradient-to-r from-[#f7dee3] via-[#fbeee7] to-[#f3e3d3] p-[1px] shadow-sm">
          <div className="rounded-2xl bg-white/95 px-6 py-8 sm:px-10 text-center">
            <p className="text-[11px] tracking-[.3em] text-[#b98d4f] mb-3">SOLUTION</p>
            <p className="text-lg sm:text-xl font-bold leading-relaxed text-[#3f342e]">
              フクエスの掲載データが、<span className="text-[#c9808f]">そのまま公式ホームページに。</span>
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-[#6d5d53] max-w-2xl mx-auto">
              セラピスト・本日の出勤・料金・写メ日記・口コミは、いつものフクエスの管理画面を更新するだけで
              公式ホームページにも自動で反映。<span className="font-bold">HPのための二重入力はゼロ</span>です。
              写真や原稿をイチから用意する必要はありません。
            </p>
          </div>
        </div>
      </section>

      {/* ── 強み4つ ── */}
      <section className="mx-auto max-w-5xl px-5 pt-12 sm:pt-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['掲載データと自動連動', 'セラピスト・出勤・料金・写メ日記・口コミをそのまま表示。フクエスを更新すればHPも常に最新。'],
            ['独自ドメイン', 'お店だけのドメインを運営が取得・管理・自動更新。面倒な手続きは一切ありません。'],
            [`選べるデザイン${HP_PATTERN_COUNT}種`, '高級感のある4つのひな形×カラー。お店の雰囲気に合わせてお選びいただけます。'],
            ['公開後も安心サポート', '写真や文章は専用の管理画面からいつでも変更OK。ご質問は無料で承ります。'],
          ].map(([t, d], i) => (
            <div key={t} className="rounded-2xl border border-[#f0dde0] bg-white shadow-sm p-5 text-center">
              <p className="text-[20px] font-black text-[#d5a86b] mb-1">{String(i + 1).padStart(2, '0')}</p>
              <p className="text-[13px] font-bold text-[#3f342e] mb-2">{t}</p>
              <p className="text-[11px] leading-relaxed text-[#8a7a70] text-left">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── デザイン一覧 ── */}
      <section id="design" className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
        <header className="text-center mb-10">
          <p className="text-[11px] tracking-[.3em] text-[#c99ba6] mb-2">DESIGN LINEUP</p>
          <h2 className="text-xl sm:text-2xl font-bold tracking-wider mb-4 text-[#3f342e]">
            選べるデザイン <span className="text-[#b98d4f]">全{HP_PATTERN_COUNT}パターン</span>
          </h2>
          <p className="text-[13px] leading-relaxed text-[#8a7a70] max-w-xl mx-auto">
            4つのひな形 × カラーをご用意しました（最上位のタイプSはシャンパンゴールド・ワインレッド・ロイヤルブルー・エメラルドグリーンの4種類）。
            気になるデザインが決まりましたら、担当者までお知らせください。
            <br className="hidden sm:block" />
            ドメイン取得・制作・写真や文章の設定まで、すべて運営がおこなって納品します。
          </p>
        </header>

        <div className="space-y-8">
          {HP_TEMPLATES.map((t) => {
            const title = TEMPLATE_TITLES[t.key];
            const variants = HP_COLOR_VARIANTS[t.key];
            // 実写真のサムネがあるひな形（タイプS）は、白いカードで囲わず地の上に直接大きく並べる
            // （2026-08-12 要望）。写真そのものを主役にし、スマホの横幅も余さず使うため。
            const photo = hpDesignThumbSrc(t.key, variants[0]?.key) !== null;
            return (
              <section
                key={t.key}
                className={photo ? '' : 'rounded-2xl border border-[#f0dde0] bg-white shadow-sm p-6 sm:p-8'}
              >
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
                  {/* 見出し側は縮めない（「フラッグシップ」が2行に折り返していたため） */}
                  <div className="sm:shrink-0">
                    <p className="text-[10px] tracking-[.28em] text-[#b98d4f]">{title.en}</p>
                    <h3 className="text-lg font-bold tracking-wide text-[#3f342e]">
                      {t.label}
                      <span className="ml-3 text-[12px] font-normal text-[#8a7a70]">{title.name}</span>
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#a08e84] sm:text-right">{HP_TEMPLATE_NOTES[t.key]}</p>
                </div>

                {/* ★ Tailwind は文字列を組み立てたクラス名を拾えない（未使用として消える）ので、
                    列数は必ずベタ書きの候補から選ぶこと。 */}
                <div
                  className={`grid ${photo ? 'gap-2 sm:gap-3' : 'gap-3'} ${
                    VARIANT_GRID_CLS[Math.min(variants.length, 6)] ?? VARIANT_GRID_CLS[6]
                  }`}
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
                        className={`group block overflow-hidden border border-[#ecdcdc] bg-white hover:border-[#d5a86b] hover:shadow-md transition-all ${
                          /* 実写真のサムネは角を直角に（2026-08-12 要望） */ src ? '' : 'rounded-xl'
                        }`}
                      >
                        {src ? (
                          /* 横長（スマホ16:9・PC2:1）＝PCの画面で見ているような比率。
                             切り取り基準（object-position）はひな形ごとにモデルの立ち位置が違うので
                             hpDesignThumbObjectCls に集約している。 */
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            loading="lazy"
                            className={`block w-full aspect-video sm:aspect-[2/1] object-cover ${hpDesignThumbObjectCls(
                              t.key,
                              'list',
                            )}`}
                          />
                        ) : (
                          <DesignThumb template={t.key} accent={c.accent} deep={c.deep} colorKey={v.key} />
                        )}
                        <span className="flex items-center justify-between px-2.5 py-2 bg-[#faf4f0] text-[10px] font-bold text-[#7a6a60]">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="inline-block w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                              style={{ backgroundColor: c.accent }}
                            />
                            <span className="truncate">{v.label}</span>
                          </span>
                          <span className="text-[#b98d4f] flex-shrink-0">デモ →</span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
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
            ['デザインを決める', `このページの${HP_PATTERN_COUNT}パターンから、担当者とご相談のうえお選びいただきます。`],
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
            「デモ →」から、サンプル店舗のデータが入った実際のページをご覧いただけます。
            <br className="hidden sm:block" />
            写真・文章・表示する内容は、お店ごとに運営がカスタマイズしてお納めします。
          </p>
          <p className="text-[12px] text-[#a08e84]">
            掲載・制作のご相談：フクエス運営事務局（
            <a href="mailto:info@fukues.com" className="underline text-[#b98d4f] hover:text-[#9a743c]">info@fukues.com</a>
            ）
          </p>
        </div>
      </footer>
    </div>
  );
}
