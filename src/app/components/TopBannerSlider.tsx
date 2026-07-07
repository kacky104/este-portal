'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { TopBanner } from '@/app/lib/topBanners';

// トップのサロン一覧中に挿入する画像バナースライダー（クライアント）。
// - 「1.1枚見せ」：1枚を約90%幅にし、次のバナーの端が見切れる peek スタイル。横スクロール＋scroll-snap。
// - 自動スライド：3.5秒ごとに次へ・末尾→先頭ループ（PickupSlider の自動スライドパターンを踏襲）。
//   1件のみは interval を張らない／prefers-reduced-motion は自動送り停止／手動操作でタイマーリセット／unmount で cleanup。
// - ドットインジケータあり（>1件のみ）。1件のみはドット非表示・スクロール無効（全幅表示）。
// - 画像は aspect-[21/9]・rounded・object-cover。next/image は fill＋sizes 指定。
// - link_url あり：外部URL(http/https)は target=_blank rel=noopener、内部パス(/…)は next/link。null は画像のみ。
// - alt_text を alt に使用（空文字可）。配色は本体（橙→マゼンタ）に馴染むニュートラル枠＋マゼンタのドット（緑系は使わない）。
// AUTO_MS：自動送り間隔。
const AUTO_MS = 3500;

// スクロールコンテナ（relative 前提）内で index 番目のバナーを左端にスナップ。offsetLeft がトラック基準になる。
function scrollBannerIntoView(el: HTMLDivElement, index: number) {
  const cards = el.querySelectorAll<HTMLElement>('[data-banner]');
  const n = cards.length;
  if (n === 0) return;
  const idx = ((index % n) + n) % n;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  el.scrollTo({ left: cards[idx].offsetLeft, behavior });
}

// 現在の scrollLeft に最も近いバナーの index（ドット表示・次送り基点）。
function currentBannerIndex(el: HTMLDivElement): number {
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
  return idx;
}

export function TopBannerSlider({ banners }: { banners: TopBanner[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [active, setActive] = useState(0);

  // タイマー（再）起動。1件のみ／reduced-motion では張らない。手動操作・設定変更時に呼び直してリセット。
  const restart = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (banners.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timerRef.current = window.setInterval(() => {
      if (document.hidden) return; // タブ非アクティブ時は送らない（暴走防止）
      const el = trackRef.current;
      if (!el) return;
      scrollBannerIntoView(el, currentBannerIndex(el) + 1); // 末尾の次は法により先頭へループ
    }, AUTO_MS);
  }, [banners.length]);

  useEffect(() => {
    restart();
    const el = trackRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPref = () => restart();
    reduce.addEventListener?.('change', onPref);

    // ユーザー操作（スワイプ/ホイール）でタイマーリセット。プログラムのスクロール（scroll）とは分離。
    const reset = () => restart();
    el?.addEventListener('pointerdown', reset);
    el?.addEventListener('touchstart', reset, { passive: true });
    el?.addEventListener('wheel', reset, { passive: true });

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      reduce.removeEventListener?.('change', onPref);
      el?.removeEventListener('pointerdown', reset);
      el?.removeEventListener('touchstart', reset);
      el?.removeEventListener('wheel', reset);
    };
  }, [restart]);

  if (banners.length === 0) return null;
  const multiple = banners.length > 1;

  // スクロール（自動・手動とも）でドットの選択位置を追従。
  const onScroll = () => {
    const el = trackRef.current;
    if (el) setActive(currentBannerIndex(el));
  };

  // ドット押下：該当バナーへスクロール＋タイマーリセット。
  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    scrollBannerIntoView(el, i);
    restart();
  };

  // 1.1枚見せ：メインを約90%幅にし、次スライドを約10%チラ見せ（SP・PC共通比率）。
  const cardClass = `snap-start flex-shrink-0 ${multiple ? 'w-[90%]' : 'w-full'} block`;

  // 表示アスペクトは aspect-[21/9]（≒1280×549）。元画像は 16:9 のままなので object-cover で上下がトリミングされる。
  // 各スライド共通のラッパに relative + aspect-[21/9] + overflow-hidden を付与し、next/image は fill + object-cover
  // に統一する（width/height 指定だと2枚目以降で高さ制約が効かず縦に伸びるため）。トラックは items-start で
  // 「最大の子に高さが引っ張られる」stretch を無効化。幅は 1.2枚見せ（w-82%）のままなので sizes は据え置き。
  const inner = (b: TopBanner) => (
    <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
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
