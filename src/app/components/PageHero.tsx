// ページ上部のヒーロー画像（ランキングと同流儀）。未設定なら何も描画しない。
// 純粋な表示コンポーネント（サーバー/クライアント両対応）。
export function PageHero({ url, alt, fullBleedMobile = false }: { url: string | null; alt: string; fullBleedMobile?: boolean }) {
  if (!url) return null;
  return (
    // fullBleedMobile: スマホは親の px-4 を -mx-4 で打ち消して全幅表示（ランキングのヒーロー同様）。sm+ は従来通り。
    <div className={`mb-6${fullBleedMobile ? ' -mx-4 sm:mx-0' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={`block w-full h-auto ${fullBleedMobile ? 'sm:shadow-sm' : 'shadow-sm'}`} />
    </div>
  );
}
