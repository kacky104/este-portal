import Image from 'next/image';
import type { JobGalleryItem } from '@/app/lib/jobs';

// 求人詳細の「お店の雰囲気」正方形スライダー。サーバーコンポーネント（時間依存レンダリング無し）。
// PickupSlider と同じ CSS スクロール（overflow-x-auto + scroll-snap）方式。JSカルーセルは使わない。
// カードは正方形（aspect-square）・object-cover。キャプションは画像の「下」に1行 truncate で表示
// （画像上のオーバーレイではない）。キャプション空なら余白を出さず画像のみ。
// 見せ方: モバイル 2.1枚見せ / PC(md以上) 3.1枚見せ（実機確認後に調整可）。
// ※白帯スイープ（.hero-shine-loop）はヒーロー専用の演出として、ここには適用しない。
export function JobGallery({ images }: { images: JobGalleryItem[] }) {
  // 0枚時はセクションごと非表示（呼び出し側でも制御するが二重防御）。
  if (images.length === 0) return null;

  // 1枚でもキャプションがあれば、全カードにキャプション領域（2行分の高さ）を確保して下端を揃える。
  // 全カードが空のときはキャプション領域ごと出さない（画像のみ・現状踏襲）。
  const hasAnyCaption = images.some((img) => img.caption !== '');

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm mt-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900">お店の雰囲気</h2>
      </div>

      {/* トラック：横スクロール＋スナップ。カードの p-5 分まで端を使い切るため -mx-5 px-5。 */}
      <div className="-mx-5 overflow-x-auto snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1.5 px-5">
          {images.map((img, i) => (
            <div
              key={img.url}
              className="snap-start flex-shrink-0 w-[calc((100%-0.375rem)/2.1)] md:w-[calc((100%-0.75rem)/3.1)]"
            >
              <div className="relative aspect-square rounded-2xl overflow-hidden shadow border border-emerald-100 bg-slate-50">
                <Image
                  src={img.url}
                  alt={img.caption || `お店の雰囲気${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 45vw, 220px"
                />
              </div>
              {/* キャプションは画像の下・2行まで（超過は省略）。高さ揃えのため min-h を確保。 */}
              {hasAnyCaption && (
                <p className="text-sm text-slate-600 mt-1.5 line-clamp-2 min-h-[2.5rem]">{img.caption}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
