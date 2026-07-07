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
  // SP（sm未満＝640px未満）のみ「1.05枚見せ」にする（次スライドの端を約5%チラ見せ）。
  // SSR初期は false（＝全幅）だが current=0 では両分岐とも translateX(0) のためハイドレーション不一致は起きない。
  const [peek, setPeek] = useState(false);
  const touchStartX = useRef<number>(0);

  const prev = useCallback(() => setCurrent((c) => (c - 1 + count) % count), [count]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % count), [count]);

  // 自動送り：hover 一時停止・1件は張らない。current を deps に含め手動操作でもタイマーをリセット。cleanup 徹底。
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % count), AUTO_PLAY_MS);
    return () => clearInterval(id);
  }, [paused, count, current]);

  // SP（<640px）検知。sm 以上は全幅1枚見せ、未満は1.05枚見せに切替。
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setPeek(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  if (count === 0) return null;
  const multiple = count > 1;
  // 件数が減った直後に current が範囲外でも破綻しないよう描画時にクランプ。
  const safeCurrent = ((current % count) + count) % count;

  // SPのみ「枠外はみ出し方式」の1.1枚見せ：現在スライドはカード幅のまま縮めず、ビューポートを右パディング分だけ
  // 画面右端まで広げ（-mr-4）、その中でトラックを右へオーバーフローさせて次スライドの左端を右余白にのぞかせる。
  // ビューポート自身の右端は画面端どまり＝overflow-hidden が内部トラックをクリップ→横スクロールバーは出ない。左端はカードと揃えたまま。
  // 1枚のみ／sm以上は全幅・はみ出しなし・100%移動（＝従来の1枚見せ）。高さ制約は全スライド共通の slideClass に置く。
  const peekMode = multiple && peek;
  // SP時ビューポートは右に16px(1rem)広がるので、スライド幅は calc(100%-1rem)=カード幅で維持。sm以上は w-full。
  const slideClass = `${multiple ? 'w-[calc(100%-1rem)] sm:w-full' : 'w-full'} flex-shrink-0 relative h-52 sm:h-96`;
  // 移動量＝スライド幅(カード幅)＋gap。SP: (100% - 1rem) + 0.5rem = (100% - 0.5rem)。sm/1枚: 100%。current=0 は 0。
  const trackTransform = `translateX(calc(${-safeCurrent} * ${peekMode ? '(100% - 0.5rem)' : '100%'}))`;

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

            {/* Bottom content */}
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
              <p className="font-black text-xl sm:text-2xl text-white drop-shadow mb-4 line-clamp-1">
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
        {/* Slide track。SPのみ -mr-4 で右パディング分だけ画面端まで広げ、overflow-hidden で内部トラックをクリップ
          （＝次スライドを右余白にのぞかせつつ横スクロールバーは出さない）。sm以上は従来どおりカード幅。 */}
      <div className={`rounded-3xl overflow-hidden shadow-lg${multiple ? ' -mr-4 sm:mr-0' : ''}`}>
        <div
          className="flex gap-2 sm:gap-0 transition-transform duration-500 ease-in-out"
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
