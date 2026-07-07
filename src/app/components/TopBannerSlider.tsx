'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { TopBanner } from '@/app/lib/topBanners';

// トップのサロン一覧中に挿入する画像バナースライダー（クライアント）。
// - 「1.2枚見せ」：1枚を約82%幅にし、次のバナーの端が見切れる peek スタイル。横スクロール＋scroll-snap。
// - 自動スライドは入れない（PickupSlider のドット/peek は参考にしつつ setInterval 部分は移植しない）。
// - ドットインジケータあり（>1件のみ）。1件のみはドット非表示・スクロール無効（全幅表示）。
// - 画像は aspect-video(16:9)・rounded・object-cover。next/image＋sizes 指定。
// - link_url あり：外部URL(http/https)は target=_blank rel=noopener、内部パス(/…)は next/link。null は画像のみ。
// - alt_text を alt に使用（空文字可）。配色は本体（橙→マゼンタ）に馴染むニュートラル枠＋マゼンタのドット（緑系は使わない）。
export function TopBannerSlider({ banners }: { banners: TopBanner[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  if (banners.length === 0) return null;
  const multiple = banners.length > 1;

  // スクロール位置に最も近いカードでドットの選択位置を更新（relative コンテナ前提で offsetLeft がトラック基準）。
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>('[data-banner]');
    const cur = el.scrollLeft;
    let idx = 0;
    let best = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - cur);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    setActive(idx);
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>('[data-banner]');
    const n = cards.length;
    if (n === 0) return;
    const idx = ((i % n) + n) % n;
    el.scrollTo({ left: cards[idx].offsetLeft, behavior: 'smooth' });
  };

  // 1.1枚見せ：メインを約90%幅にし、次スライドを約10%チラ見せ（SP・PC共通比率）。
  const cardClass = `snap-start flex-shrink-0 ${multiple ? 'w-[90%]' : 'w-full'} block`;

  // 表示アスペクトは aspect-[8/3]（≒1280×480）。元画像は 16:9 のままなので object-cover で上下がトリミングされる。
  // 各スライド共通のラッパに relative + aspect-[8/3] + overflow-hidden を付与し、next/image は fill + object-cover
  // に統一する（width/height 指定だと2枚目以降で高さ制約が効かず縦に伸びるため）。トラックは items-start で
  // 「最大の子に高さが引っ張られる」stretch を無効化。幅は 1.2枚見せ（w-82%）のままなので sizes は据え置き。
  const inner = (b: TopBanner) => (
    <div className="relative aspect-[8/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <Image
        src={b.imageUrl}
        alt={b.altText}
        fill
        sizes="(max-width: 768px) 90vw, 700px"
        className="object-cover"
      />
    </div>
  );

  const renderCard = (b: TopBanner) => {
    if (b.linkUrl) {
      const isExternal = /^https?:\/\//i.test(b.linkUrl);
      if (isExternal) {
        return (
          <a key={b.id} data-banner href={b.linkUrl} target="_blank" rel="noopener noreferrer" className={cardClass}>
            {inner(b)}
          </a>
        );
      }
      return (
        <Link key={b.id} data-banner href={b.linkUrl} className={cardClass}>
          {inner(b)}
        </Link>
      );
    }
    return (
      <div key={b.id} data-banner className={cardClass}>
        {inner(b)}
      </div>
    );
  };

  return (
    <div>
      {/* トラック：横スクロール＋スナップ。relative で子カードの offsetLeft をスクロール基点に一致させる。
          1件のみは overflow-x-hidden＝スクロール無効。 */}
      <div
        ref={trackRef}
        onScroll={multiple ? onScroll : undefined}
        className={`relative flex items-start gap-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          multiple ? 'overflow-x-auto' : 'overflow-x-hidden'
        }`}
      >
        {banners.map(renderCard)}
      </div>

      {multiple && (
        <div className="flex justify-center gap-1.5 mt-3">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1}枚目のバナーを表示`}
              aria-current={active === i ? 'true' : undefined}
              className="h-1.5 rounded-full transition-all"
              style={active === i ? { width: '18px', backgroundColor: '#DB2777' } : { width: '6px', backgroundColor: '#cbd5e1' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
