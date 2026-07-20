// ページ上部のヒーロー画像（ランキングと同流儀）。未設定なら何も描画しない。
// 純粋な表示コンポーネント（サーバー/クライアント両対応）。
export function PageHero({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return null;
  return (
    <div className="mb-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="block w-full h-auto shadow-sm" />
    </div>
  );
}
