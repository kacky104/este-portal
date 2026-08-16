import Image from 'next/image';

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
  url: string | null;
  alt: string;
  fullBleedMobile?: boolean;
  /** 画面幅いっぱいに表示する。★親の左右パディングの【外】に置くこと（2026-08-17 追加）。 */
  fullBleed?: boolean;
  /** 置き場所の <main> の最大幅(px)。max-w-3xl=768 / max-w-4xl=896 / max-w-5xl=1024。 */
  contentMax?: 768 | 896 | 1024;
}) {
  if (!url) return null;
  const sizes = fullBleed ? '100vw' : `(min-width: ${contentMax}px) ${contentMax - 32}px, 100vw`;

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
        <Image src={url} alt={alt} width={2400} height={960} priority sizes={sizes} className="block w-full h-auto" />
      </div>
    );
  }

  return (
    // fullBleedMobile: スマホは親の px-4 を -mx-4 で打ち消して全幅表示（ランキングのヒーロー同様）。sm+ は従来通り。
    <div className={`mb-6${fullBleedMobile ? ' -mx-4 sm:mx-0' : ''}`}>
      <Image
        src={url}
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
