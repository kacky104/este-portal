'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { TopBanner } from '@/app/lib/topBanners';

// トップのサロン一覧中（15枚目直下）に挿入する画像バナースライダー。
// ピックアップサロンブロック（FeaturedSalonSlider）と見た目・挙動を1:1で一致させる：
// - セクションタイトル：グラデ縦バー＋グラデ文字「福岡のピックアップサロン」＋「おすすめ」バッジ（page.tsx の実装を踏襲）。
// - 1枚見せ：各スライド w-full。flex＋translateX(-current*100%) の平行移動式（transition-transform duration-500）。
//   高さは全スライド共通で h-52 sm:h-96（固定高＝アスペクト依存でないので2枚目以降が巨大化しない）。
//   外殻に rounded-3xl overflow-hidden shadow-lg、画像は next/image fill＋object-cover。
// - 画像左上に「✦ PICKUP」バッジ（ピックアップ側と同位置・同スタイル）。
// - 自動スライド：4500ms・hover で一時停止・末尾→先頭ループ・矢印＋ドット・タッチスワイプ。
//   1件のみは interval を張らず矢印/ドットも非表示（静止）。手動操作（矢印/ドット/スワイプ）でタイマーリセット。unmount で cleanup。
// - link_url あり：外部URL(http/https)は target=_blank rel=noopener、内部パス(/…)は next/link。null は画像のみ。
// - alt_text を alt に使用（空文字可）。0件ならブロックごと非表示。
// - PC幅：salon-card-zoom / lg:w-[512px] は挿入元（ShuffledSalons の insertBlock ラッパ）が適用済みのため当コンポーネントでは付けない（二重適用回避）。
const AUTO_PLAY_MS = 4500;
const PICKUP_TITLE = '福岡のピックアップ店舗';

export function TopBannerSlider({ banners }: { banners: TopBanner[] }) {
  const count = banners.length;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number>(0);

  const prev = useCallback(() => setCurrent(c => (c - 1 + count) % count), [count]);
  const next = useCallback(() => setCurrent(c => (c + 1) % count), [count]);

  // 自動送り：hover 一時停止・1件は張らない。current を deps に含めることで手動操作（矢印/ドット/スワイプ）でも
  // タイマーがリセットされる。unmount / 依存変化時は clearInterval で cleanup。
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setCurrent(c => (c + 1) % count), AUTO_PLAY_MS);
    return () => clearInterval(id);
  }, [paused, count, current]);

  if (count === 0) return null;
  const multiple = count > 1;
  // 件数が減った直後に current が範囲外になっても破綻しないよう、描画時にクランプ（modulo で 0..count-1）。
  const safeCurrent = ((current % count) + count) % count;

  // 各スライド共通ラッパ：w-full flex-shrink-0 relative h-52 sm:h-96（固定高で高さ制約を全スライドに効かせる）。
  const slideClass = 'w-full flex-shrink-0 relative h-52 sm:h-96 block';

  const slideInner = (b: TopBanner) => (
    <>
      <Image
        src={b.imageUrl}
        alt={b.altText}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 100vw, 992px"
      />
      {/* PICKUP バッジ（ピックアップ側と同位置・同スタイル）。 */}
      <span className="absolute top-4 left-4 text-[11px] font-black text-white bg-pink-500 px-3 py-1 rounded-full shadow-lg tracking-wide">
        ✦ PICKUP
      </span>
    </>
  );

  const renderSlide = (b: TopBanner) => {
    if (b.linkUrl) {
      const isExternal = /^https?:\/\//i.test(b.linkUrl);
      if (isExternal) {
        return (
          <a key={b.id} href={b.linkUrl} target="_blank" rel="noopener noreferrer" className={slideClass}>
            {slideInner(b)}
          </a>
        );
      }
      return (
        <Link key={b.id} href={b.linkUrl} className={slideClass}>
          {slideInner(b)}
        </Link>
      );
    }
    return (
      <div key={b.id} className={slideClass}>
        {slideInner(b)}
      </div>
    );
  };

  return (
    <div>
      {/* ── セクションタイトル（ピックアップサロンと同一構造・スタイル） ── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
        <h2
          className="font-bold whitespace-nowrap leading-tight"
          style={{
            background: 'linear-gradient(to right, #ec4899, #f97316)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontSize: `min(1.25rem, calc((100vw - 56px) / ${PICKUP_TITLE.length}))`,
          }}
        >
          {PICKUP_TITLE}
        </h2>
        <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
          おすすめ
        </span>
      </div>

      {/* ── スライダー本体 ── */}
      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* スライドトラック：flex＋translateX の平行移動。外殻に rounded-3xl overflow-hidden shadow-lg。 */}
        <div className="rounded-3xl overflow-hidden shadow-lg">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${safeCurrent * 100}%)` }}
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
              const delta = e.changedTouches[0].clientX - touchStartX.current;
              if (Math.abs(delta) > 50) {
                if (delta < 0) next(); else prev();
              }
            }}
          >
            {banners.map(renderSlide)}
          </div>
        </div>

        {/* ── 矢印（>1件のみ） ── */}
        {multiple && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-[calc(50%-16px)] -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors border border-white/20 shadow"
              aria-label="前へ"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-[calc(50%-16px)] -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors border border-white/20 shadow"
              aria-label="次へ"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* ── ドット（>1件のみ） ── */}
      {multiple && (
        <div className="flex justify-center items-center gap-2 mt-3">
          {banners.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setCurrent(i)}
              className={`transition-all duration-300 rounded-full ${
                i === safeCurrent
                  ? 'w-6 h-2 bg-pink-500'
                  : 'w-2 h-2 bg-slate-300 hover:bg-pink-300'
              }`}
              aria-label={`スライド${i + 1}へ`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
