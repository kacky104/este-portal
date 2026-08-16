import Image, { getImageProps } from 'next/image';
import type { PageHeroImages } from '@/app/lib/pageHero';

// PC / スマホ の切り替え幅（2026-08-17 / 第19便）。
// ★ 公式HPのLP・デザイン一覧と同じ 768px に揃えてある（禁則74と同じ考え方）。
//   ここを変えるときは media クエリの両方（max-width/min-width）を必ずセットで直すこと。
//   片方だけ直すと、どちらの画像も出ない幅ができる。
const SP_MAX = 767;

// ページ上部のヒーロー画像（ランキングと同流儀）。未設定なら何も描画しない。
// 純粋な表示コンポーネント（サーバー/クライアント両対応）。
//
// next/image 化（2026-08-05）: このコンポーネントは /salons /reviews /therapists /diary /news
// /join /therapist/new /x-shops /jobs/matching の9ページで LCP を担うため、
// 最適化（WebP/AVIF変換・サイズ別配信）＋ priority（preload）を付ける。
// 画像は管理画面アップロードで縦横比が不定のため、width/height は代表値（1200×400）を渡しつつ
// CSS（w-full h-auto）で実画像の比率どおりに表示する（歪みは起きない）。
//
// contentMax（2026-08-06 追加）: 置き場所の <main> の最大幅（Tailwind の max-w-3xl=768 / 4xl=896 / 5xl=1024）。
// これを渡さないと sizes が常に「PCで1024px」になり、max-w-3xl（実表示 736px）のページでも
// 1080px 幅の画像を取りに行っていた（DevTools で「必要より大きい画像」の警告）。
// 実際の表示幅は contentMax から親の px-4（左右16px＝計32px）を引いた値。
// スマホ（fullBleedMobile）は親の余白を打ち消して全幅なので 100vw のまま。
export function PageHero({
  url,
  alt,
  fullBleedMobile = false,
  fullBleed = false,
  contentMax = 1024,
}: {
  /**
   * URL1本（従来）でも PC/SP の組（fetchPageHero の戻り値）でも受け取れる。
   * ★ 呼び出し側12ページを書き換えずに PC/SP 対応を入れるため、あえて両対応にしてある（2026-08-17）。
   */
  url: string | PageHeroImages | null;
  alt: string;
  fullBleedMobile?: boolean;
  /** 画面幅いっぱいに表示する。★親の左右パディングの【外】に置くこと（2026-08-17 追加）。 */
  fullBleed?: boolean;
  /** 置き場所の <main> の最大幅(px)。max-w-3xl=768 / max-w-4xl=896 / max-w-5xl=1024。 */
  contentMax?: 768 | 896 | 1024;
}) {
  // ── PC/SP の解決（2026-08-17 / 第19便）────────────────────────────
  // ★ 「SPが未設定ならPCを流用」の判断は【ここ1か所だけ】で行う。
  //   呼び出し側やDBのビューで同じ判断を書くと、そのうち食い違って
  //   「管理画面では設定済みなのにスマホで出ない」のような事故になる。
  const pcUrl = typeof url === 'string' ? url : (url?.pc ?? null);
  const spUrl = typeof url === 'string' ? null : (url?.sp ?? null);
  // PCが未設定でSPだけある場合はSPをPCにも使う（逆流用）。片方だけ設定した状態でも消えないように。
  const pc = pcUrl || spUrl;
  const sp = spUrl || pcUrl;
  if (!pc) return null;

  const sizes = fullBleed ? '100vw' : `(min-width: ${contentMax}px) ${contentMax - 32}px, 100vw`;

  // ── PC と SP で別画像のときは <picture> で出し分ける ──────────────
  // ★ next/image の <Image> を2つ置いて CSS で隠す方法は採らない。
  //   display:none の画像もブラウザは取りに行くので、毎回2枚ぶん転送することになる。
  // ★ getImageProps を使うと、next/image の最適化（AVIF/WebP・サイズ別配信）を
  //   保ったまま素の <picture> に流し込める。これが公式の「アートディレクション」手順。
  // ★ 各 <source> に width/height を付けている。PCとSPで縦横比が違うため、
  //   これが無いと読み込み前に確保する箱の比率が片方で必ずズレる（/hp/templates と同じ作法）。
  //   実寸は管理画面アップロード次第なので代表値。実画像が違っても
  //   w-full h-auto なので最終的な表示比率は正しい（読み込み時に一瞬ズレるだけ）。
  // ここに来る時点で pc は非nullが確定しているが、sp も同様であることを型に伝える
  // （sp は「spUrl || pcUrl」なので pc が非nullなら必ず非null）。
  if (sp && sp !== pc) {
    const common = { alt, sizes, priority: true } as const;
    const spProps = getImageProps({ ...common, src: sp, width: 900, height: 1200 }).props;
    const { srcSet: pcSrcSet, ...imgProps } = getImageProps({ ...common, src: pc, width: 2400, height: 960 }).props;
    return (
      <div className={fullBleed ? 'w-full' : `mb-6${fullBleedMobile ? ' -mx-4 sm:mx-0' : ''}`}>
        <picture>
          <source media={`(max-width: ${SP_MAX}px)`} srcSet={spProps.srcSet} width={900} height={1200} />
          <source media={`(min-width: ${SP_MAX + 1}px)`} srcSet={pcSrcSet} width={2400} height={960} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- alt は imgProps に含まれている */}
          <img
            {...imgProps}
            className={
              fullBleed
                ? 'block w-full h-auto'
                : `block w-full h-auto ${fullBleedMobile ? 'sm:shadow-sm' : 'shadow-sm'}`
            }
          />
        </picture>
      </div>
    );
  }

  // ── 全幅表示（2026-08-17 追加・第19便／いまは /listing だけが使う）──────────
  // ★ fullBleedMobile のような -mx-4 は【付けていない】。
  //   パディングを持つ親の中で使うと打ち消しが効かず、逆に横スクロールが出るため。
  //   必ず親のパディングの外に置くこと。
  // ★ sizes は 100vw。contentMax（本文幅）はここでは意味を持たない。
  //   そのままにすると大画面で本文幅ぶんの小さい画像を引き伸ばしてぼやける。
  // ★ 下マージンは付けない。全幅ヒーローは直下のセクションと地続きに見せるのが自然で、
  //   余白が要るときは呼び出し側で足すほうが崩れにくい。
  if (fullBleed) {
    return (
      <div className="w-full">
        <Image src={pc} alt={alt} width={2400} height={960} priority sizes={sizes} className="block w-full h-auto" />
      </div>
    );
  }

  return (
    // fullBleedMobile: スマホは親の px-4 を -mx-4 で打ち消して全幅表示（ランキングのヒーロー同様）。sm+ は従来通り。
    <div className={`mb-6${fullBleedMobile ? ' -mx-4 sm:mx-0' : ''}`}>
      <Image
        src={pc}
        alt={alt}
        width={1200}
        height={400}
        priority
        sizes={sizes}
        className={`block w-full h-auto ${fullBleedMobile ? 'sm:shadow-sm' : 'shadow-sm'}`}
      />
    </div>
  );
}
