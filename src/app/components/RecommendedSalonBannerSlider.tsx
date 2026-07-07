'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';
import { areaLabel } from '@/app/lib/areaLabel';
import type { RecommendedSalonBanner } from '@/app/lib/recommendedSalonBanners';

// トップのサロン一覧中（15枚目直下）に表示する「おすすめサロンバナー」スライダー。
// ピックアップサロン（FeaturedSalonSlider）と見た目・挙動を一致させたうえで、背景を admin アップロード
// 画像に差し替え、オーバーレイ（サロン名・セラピスト丸アイコン・地域バッジ・「詳しく見る」・下部暗色グラデ）を
// 重ねる。オーバーレイのマークアップは FeaturedSalonSlider から複製（ピックアップ側は一切変更しない）。
// - 1枚見せ・flex＋translateX の平行移動（transition-transform duration-500）、高さ h-52 sm:h-96。
// - 自動スライド 4500ms・hover 一時停止・ループ・矢印＋ドット・タッチスワイプ・1件は静止・0件は非表示。
// - 各バナーはサロン詳細（/salon/{salonId}）へリンク。link_url は持たない（DBにも列がない）。
// - 非公開サロン（salonName===''）に紐づくバナーはオーバーレイなし＝画像のみ・非リンクにフォールバック（落とさない）。
const AUTO_PLAY_MS = 4500;
// セクションタイトル文言。本物のピックアップブロック「福岡のピックアップサロン」との重複を避けて「おすすめ」に。
const SECTION_TITLE = '福岡のおすすめサロン';

export function RecommendedSalonBannerSlider({ banners }: { banners: RecommendedSalonBanner[] }) {
  const count = banners.length;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  // PC（sm以上＝640px以上）のみ「1.2枚見せ」にする。SSR初期は false（＝1枚見せ）だが current=0 では
  // 両分岐とも translateX(0) のためハイドレーション不一致は起きない。SPは常に1枚見せ。
  const [wide, setWide] = useState(false);
  const touchStartX = useRef<number>(0);

  const prev = useCallback(() => setCurrent((c) => (c - 1 + count) % count), [count]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % count), [count]);

  // 自動送り：hover 一時停止・1件は張らない。current を deps に含め手動操作でもタイマーをリセット。cleanup 徹底。
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % count), AUTO_PLAY_MS);
    return () => clearInterval(id);
  }, [paused, count, current]);

  // PC（≥640px）検知。sm 以上は1.2枚見せ、未満は1枚見せ。
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  if (count === 0) return null;
  const multiple = count > 1;
  // 件数が減った直後に current が範囲外でも破綻しないよう描画時にクランプ。
  const safeCurrent = ((current % count) + count) % count;

  // 高さ制約は全スライド共通の slideClass に置く：
  //  - SP: h-52 固定（1枚見せ・w-full）。
  //  - PC(sm以上): 固定高をやめ aspect-[31/12]（＝ピックアップの 992/384≒2.583 と同比率）でスライド幅から高さを決定。
  //    複数枚は 1.2枚見せ＝スライド幅 calc((100% - 0.5rem)/1.2)（gap 0.5rem 込み）、1枚のみは全幅。
  const peekMode = multiple && wide;
  const slideClass = `${multiple ? 'w-full sm:w-[calc((100%_-_0.5rem)/1.2)]' : 'w-full'} flex-shrink-0 relative h-52 sm:h-auto sm:aspect-[31/12]`;
  // 移動量：SP/1枚は 100%/枚、PC複数枚はスライド幅＋gap＝(100% - 0.5rem)/1.2 + 0.5rem。current=0 は 0。
  const trackTransform = `translateX(calc(${-safeCurrent} * ${peekMode ? '((100% - 0.5rem)/1.2 + 0.5rem)' : '100%'}))`;

  const slideBody = (b: RecommendedSalonBanner, i: number) => {
    const hasOverlay = b.salonName !== '';
    return (
      <>
        {/* 背景＝admin アップロード画像 */}
        <Image
          src={b.imageUrl}
          alt={b.altText || b.salonName}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 992px"
          priority={i === 0}
        />

        {hasOverlay && (
          <>
            {/* Overlay（ピックアップと同一） */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

            {/* PICKUP badge */}
            <span className="absolute top-4 left-4 text-[11px] font-black text-white bg-pink-500 px-3 py-1 rounded-full shadow-lg tracking-wide">
              ✦ PICKUP
            </span>

            {/* Area badge */}
            <span
              className="absolute top-4 right-4 text-[11px] font-semibold backdrop-blur-sm px-3 py-1 rounded-full border"
              style={{ color: '#ffffff', backgroundColor: 'rgba(249, 115, 22, 0.15)', borderColor: '#f97316' }}
            >
              📍 {areaLabel(b.area)}
            </span>

            {/* Bottom content。PC(sm)は 1.2枚見せで高さが低くなるため、SP据え置きのまま overlay の
                拡大（text-2xl / p-5）を止め、名前下マージンも詰めて窮屈さを回避（SPは無変更）。 */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="font-black text-xl text-white drop-shadow mb-4 sm:mb-2.5 line-clamp-1">
                {b.salonName}
              </p>

              <div className="flex items-center justify-between">
                {/* Therapist thumbnails */}
                <div className="flex -space-x-2">
                  {b.therapistImages.slice(0, 4).map((img, j) => (
                    <div key={j} className="relative w-8 h-8 rounded-full border-2 border-white/80 overflow-hidden shadow-sm">
                      <Image src={img} alt={b.salonName} fill className="object-cover" sizes="32px" />
                    </div>
                  ))}
                  {b.therapistImages.length === 0 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white/40 bg-white/10 flex items-center justify-center">
                      <span className="text-white/50 text-xs">♡</span>
                    </div>
                  )}
                </div>

                {/* 「詳しく見る」：スライド全体が /salon/{id} への Link のため、ここは視覚要素（span）。
                    ネストした <a> を避けつつピックアップと同じ見た目を再現する。 */}
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-pink-600 text-xs font-black shadow-md">
                  詳細を見る
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <div>
      {/* ── セクションタイトル（ピックアップサロンと同構造・同スタイル） ── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
        <h2
          className="font-bold whitespace-nowrap leading-tight"
          style={{
            background: 'linear-gradient(to right, #ec4899, #f97316)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontSize: `min(1.25rem, calc((100vw - 56px) / ${SECTION_TITLE.length}))`,
          }}
        >
          {SECTION_TITLE}
        </h2>
        <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
          おすすめ
        </span>
      </div>

      {/* ── スライダー本体（hover で自動送り一時停止） ── */}
      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Slide track */}
      <div className="rounded-3xl overflow-hidden shadow-lg">
        <div
          className="flex sm:gap-2 transition-transform duration-500 ease-in-out"
          style={{ transform: trackTransform }}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(delta) > 50) {
              if (delta < 0) next(); else prev();
            }
          }}
        >
          {banners.map((b, i) =>
            b.salonName !== '' ? (
              <Link key={b.id} href={`/salon/${b.salonId}`} className={`${slideClass} block`}>
                {slideBody(b, i)}
              </Link>
            ) : (
              // 非公開サロン：詳細ページに飛べないため非リンク（画像のみ）。
              <div key={b.id} className={slideClass}>
                {slideBody(b, i)}
              </div>
            )
          )}
        </div>
      </div>

      {/* Arrow buttons */}
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

      {/* Dot indicators */}
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
    </div>
  );
}
