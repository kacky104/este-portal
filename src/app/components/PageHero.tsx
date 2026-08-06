import Image from 'next/image';

// ページ上部のヒーロー画像（ランキングと同流儀）。未設定なら何も描画しない。
// 純粋な表示コンポーネント（サーバー/クライアント両対応）。
//
// next/image 化（2026-08-05）: このコンポーネントは /salons /reviews /therapists /diary /news
// /join /therapist/new /x-shops /jobs/matching の9ページで LCP を担うため、
// 最適化（WebP/AVIF変換・サイズ別配信）＋ priority（preload）を付ける。
// 画像は管理画面アップロードで縦横比が不定のため、width/height は代表値（1200×400）を渡しつつ
// CSS（w-full h-auto）で実画像の比率どおりに表示する（歪みは起きない）。
export function PageHero({ url, alt, fullBleedMobile = false }: { url: string | null; alt: string; fullBleedMobile?: boolean }) {
  if (!url) return null;
  return (
    // fullBleedMobile: スマホは親の px-4 を -mx-4 で打ち消して全幅表示（ランキングのヒーロー同様）。sm+ は従来通り。
    <div className={`mb-6${fullBleedMobile ? ' -mx-4 sm:mx-0' : ''}`}>
      <Image
        src={url}
        alt={alt}
        width={1200}
        height={400}
        priority
        sizes="(min-width: 1024px) 1024px, 100vw"
        className={`block w-full h-auto ${fullBleedMobile ? 'sm:shadow-sm' : 'shadow-sm'}`}
      />
    </div>
  );
}
