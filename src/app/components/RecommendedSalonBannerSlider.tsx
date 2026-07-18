'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState, useEffect } from 'react';
import { areaLabel } from '@/app/lib/areaLabel';
import { SalonNameCaption } from './SalonNameCaption';
import type { RecommendedSalonBanner } from '@/app/lib/recommendedSalonBanners';

// トップのサロン一覧中（15枚目直下）に表示する「おすすめサロンバナー」。
// 出勤中セラピスト列（TherapistScroller）と同じ「独立カード＋ネイティブ横スクロール」パターンに準拠：
// - スクロールコンテナは overflow-x-auto ＋ scrollbar-pink（モバイル非表示・md+ でピンク細バー）＋ pb-4。
// - カードは flex-shrink-0 の独立した角丸カード（rounded-3xl・shadow）を gap で横並び。snap-x/snap-start で止まり位置を揃える。
// - カード幅は「1枚強＋次カードの端がのぞく」：SP≒85%・PC(sm)≒82%（＝現行1.2枚見せの幅感）。1件のみは全幅。
// - 各カードの中身はバナー画像＋ピックアップ同一オーバーレイ（PICKUPバッジ・地域バッジ・サロン名・丸アイコン・詳細を見る）。
//   高さは SP は h-52 固定、PC は aspect-[31/12]（＝ピックアップ実測 992/384≒2.583 と同比率）で幅から決定。
// - link はサロン詳細（/salon/{salonId}）。非公開サロン（salonName===''）は画像のみ・非リンクにフォールバック。
// - 0件はブロックごと非表示。自動送り（3.5秒ごとに次カードへスムーススクロール・hover/タッチで一時停止・末尾→先頭ループ）は持つ。
//   矢印・ドット・translateX・matchMedia は持たない（ネイティブ横スクロール＋scroll-snap のまま実スクロール位置で送る）。
const SECTION_TITLE = '福岡のおすすめ店舗';
const AUTO_SLIDE_MS = 3500; // 自動送り間隔（3.5秒ごとに1枚進める）

export function RecommendedSalonBannerSlider({ banners, hideTitle = false }: { banners: RecommendedSalonBanner[]; hideTitle?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // 自動送り：AUTO_SLIDE_MS ごとに、実スクロール位置から左端に最も近いカードを求めて次の1枚へスムーススクロール。
  // 末尾→先頭ループ。hover / タッチ中は一時停止。1件以下は張らない。unmount / 一時停止で cleanup。
  // フックはルール上、早期リターンより前に置く（banners.length を deps に含め件数変化にも追従）。
  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const el = scrollerRef.current;
    if (!el) return;
    const id = setInterval(() => {
      const cards = Array.from(el.children) as HTMLElement[];
      if (cards.length <= 1) return;
      const elLeft = el.getBoundingClientRect().left;
      let cur = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.getBoundingClientRect().left - elLeft);
        if (d < best) { best = d; cur = i; }
      });
      const nextIndex = cur + 1 >= cards.length ? 0 : cur + 1;
      const target = cards[nextIndex];
      const left = el.scrollLeft + (target.getBoundingClientRect().left - elLeft);
      el.scrollTo({ left, behavior: 'smooth' });
    }, AUTO_SLIDE_MS);
    return () => clearInterval(id);
  }, [banners.length, paused]);

  if (banners.length === 0) return null;
  const multiple = banners.length > 1;

  // カード外枠（幅・スナップのみ）と画像ボックス（高さ制約・影・オーバーフロー）を分離。
  // 店名は画像ボックスの「下」に置くため、外枠は overflow-hidden を持たせない。
  const cardOuter = `snap-start flex-shrink-0 ${multiple ? 'w-[85%] sm:w-[82%]' : 'w-full'}`;
  const cardImage = 'relative overflow-hidden shadow-lg h-52 sm:h-auto sm:aspect-[31/12] w-full';

  const cardBody = (b: RecommendedSalonBanner, i: number) => {
    const hasOverlay = b.salonName !== '';
    return (
      <>
        {/* 背景＝admin アップロード画像 */}
        <Image
          src={b.imageUrl}
          alt={b.altText || b.salonName}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 85vw, 420px"
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

            {/* Bottom content（店名はバナー下に移動＝オーバーレイからは削除）。 */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
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

                {/* 「詳しく見る」：カード全体が /salon/{id} への Link のため、ここは視覚要素（span）でネスト<a>を回避。 */}
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
      {/* ── セクションタイトル（ピックアップサロンと同構造・同スタイル）。hideTitle 時は出さない（保存ページ等の単発利用向け） ── */}
      {!hideTitle && (
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
      )}

      {/* ── 独立カードの横スクロール列（TherapistScroller と同じ overflow-x-auto ＋ scrollbar-pink。snap で止まり位置を揃える） ── */}
      <div
        ref={scrollerRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink snap-x snap-mandatory w-full"
      >
        {banners.map((b, i) =>
          b.salonName !== '' ? (
            <Link key={b.id} href={`/salon/${b.salonId}`} className={cardOuter}>
              <div className={cardImage}>{cardBody(b, i)}</div>
              {/* 店名（バナー下・カード全体が Link なので自身はリンクにしない＝<a>二重ネスト回避） */}
              <SalonNameCaption salonId={b.salonId} name={b.salonName} link={false} />
            </Link>
          ) : (
            // 非公開サロン：詳細ページに飛べないため非リンク（画像のみ・店名なし）。
            <div key={b.id} className={cardOuter}>
              <div className={cardImage}>{cardBody(b, i)}</div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
