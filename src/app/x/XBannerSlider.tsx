'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { XBanner } from './xBanners';

const AUTO_MS = 3500;

// タイムラインのタブバー直下に出すバナースライダー（全タブ共通・最大5枠・64:27）。
// scroll-snap ベースの手動スワイプ＋3.5秒間隔の自動送り（ループ）。操作中は自動送りを一時停止。
// ★ 第1011便（2026-09-30・カッキーさん）: 1画面に「1枚＋次の0.2枚」が見える幅に（画像の比率はそのまま＝高さも小さくなる）。
//   1枚の幅 = 枠の 82%・すき間 8px。スクロールの1歩は「1枚の幅＋すき間」。
const SLIDE_W = 0.82; // 枠に対する1枚の幅
const GAP_PX = 8;

// 1歩ぶんの幅（1枚＋すき間）
function stepOf(el: HTMLDivElement): number {
  const first = el.firstElementChild as HTMLElement | null;
  return (first?.offsetWidth ?? el.clientWidth * SLIDE_W) + GAP_PX;
}
export function XBannerSlider({ banners }: { banners: XBanner[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0); // interval コールバックから最新値を読むための ref
  const pausedRef = useRef(false); // ドラッグ/タッチ中は自動送り停止

  // スクロール位置から現在ページを算出（スワイプ・自動送りの両方で同期）。
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / stepOf(el));
    indexRef.current = i;
    setIndex(i);
  };

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * stepOf(el), behavior: 'smooth' });
  };

  // 自動送り（2枚以上のときだけ）。タブ非表示中は進めない。
  useEffect(() => {
    if (banners.length < 2) return;
    const id = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      scrollTo((indexRef.current + 1) % banners.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [banners.length]);

  if (banners.length === 0) return null;

  // 中身（画像）。リンク設定があれば / 始まりはサイト内遷移、それ以外は新規タブで開く。
  const slideInner = (b: XBanner) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.imageUrl} alt={`バナー${b.slot}`} className="w-full h-full object-cover" draggable={false} />
  );

  return (
    // x-banner-frame: 枠線リングだけのグラデキラリ（5秒に1回一周・globals.css）。radius は inherit のため rounded-xl をここに持つ。
    <div className="mt-3 relative x-banner-frame" style={{ borderRadius: 12 }}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => {
          pausedRef.current = true;
        }}
        onPointerUp={() => {
          pausedRef.current = false;
        }}
        onPointerCancel={() => {
          pausedRef.current = false;
        }}
        // マウスで押下したまま要素外で離すと pointerup がここに届かず paused が残るため、
        // 要素から出た時点でも再開する（タッチは暗黙キャプチャで pointerup が届くので影響なし）。
        onPointerLeave={() => {
          pausedRef.current = false;
        }}
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((b) => (
          // ★ 第1012便: バナーは1枚ずつ角を丸く（x-theme.css の「箱は直角」ルールに負けないよう inline style で指定）
          <div key={b.slot} className="w-[82%] flex-shrink-0 snap-start aspect-[64/27] overflow-hidden bg-[color:var(--x-inset)]" style={{ borderRadius: 12 }}>
            {b.linkUrl ? (
              b.linkUrl.startsWith('/') ? (
                <Link href={b.linkUrl} className="block w-full h-full">
                  {slideInner(b)}
                </Link>
              ) : (
                <a href={b.linkUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                  {slideInner(b)}
                </a>
              )
            ) : (
              slideInner(b)
            )}
          </div>
        ))}
      </div>

      {/* ドットインジケータ（2枚以上のときだけ）。タップでそのページへ。 */}
      {banners.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.slot}
              type="button"
              aria-label={`バナー${i + 1}へ`}
              onClick={() => scrollTo(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === index ? 'bg-white shadow-sm' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
