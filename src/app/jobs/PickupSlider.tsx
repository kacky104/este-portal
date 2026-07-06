'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { PickupJob } from '@/app/lib/jobs';

export type { PickupJob };

// おすすめ求人（ピックアップ）カード型スライダー。クライアントコンポーネント。
// 本体のサロンバナー（ShuffledSalons の SalonCard）と同系統のカード構成に変更：
//   上部＝求人画像（aspect-video・切れ防止のためブラー背景＋object-contain）／下部＝白背景の情報欄。
//   旧実装の「画像全面＋下部グラデ＋白文字オーバーレイ」は完全撤去し、テキストは白地側へ移設。
// 表示情報は現行オーバーレイと同一（サロン名＝主／求人タイトル／給与）で、新規のDB参照は増やさない。
// 配色はフクエスワークのグリーン→ライム（#10B981→#84CC16）。本体オレンジ/ピンク系は使わない。
// スライド：3秒に1回、横方向に次カードへ。末尾→先頭ループ。1件のみなら静止（interval を張らない）。
// prefers-reduced-motion 有効時は自動スライドを止める。ユーザー操作（スワイプ/ホイール/ドット）は
// タイマーをリセットする簡易対応。unmount / タブ非アクティブ時の暴走は clearInterval と document.hidden で防止。
// AUTO_MS：自動送り間隔。
const AUTO_MS = 3000;

// スクロールコンテナ（position:relative 前提）内で index 番目のカードを左端にスナップさせる。
// card.offsetLeft は relative コンテナ基準＝スナップ先の scrollLeft と一致する。ループのため index は法を取る。
function scrollCardIntoView(el: HTMLDivElement, index: number) {
  const cards = el.querySelectorAll<HTMLElement>('[data-card]');
  const n = cards.length;
  if (n === 0) return;
  const idx = ((index % n) + n) % n;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  el.scrollTo({ left: cards[idx].offsetLeft, behavior });
}

// 現在の scrollLeft に最も近いカードの index（ドット表示・次送り基点）。
function currentIndex(el: HTMLDivElement): number {
  const cards = el.querySelectorAll<HTMLElement>('[data-card]');
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

// title: 見出し文言（既定「おすすめ求人」）。エリアページでは「{エリア名}のおすすめ求人」を渡す。
export function PickupSlider({ jobs, title = 'おすすめ求人' }: { jobs: PickupJob[]; title?: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const multiple = jobs.length > 1;

  // 「開くたびシャッフル」：初回HTML(SSR)は渡された display_order のまま描画し、マウント後に一度だけ
  // Math.random の Fisher–Yates で並べ替える（本体 FeaturedSalonSlider と同方式）。ISRのためサーバーでは
  // シャッフルしない＝hydration不一致を避けつつ、リロードごとに順序が変わる。並べ替えは jobs 変化時（実質マウント時）
  // の1回のみで、自動スライドの interval とは独立（スライド中に再シャッフルしない）。
  const [displayJobs, setDisplayJobs] = useState<PickupJob[]>(jobs);
  useEffect(() => {
    const arr = [...jobs];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setDisplayJobs(arr);
    const el = trackRef.current;
    if (el) el.scrollLeft = 0; // 並べ替え後は先頭カードから表示
    setActive(0);
  }, [jobs]);

  // タイマー（再）起動。1件のみ／reduced-motion では張らない。手動操作・設定変更時に呼び直してリセット。
  const restart = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (jobs.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timerRef.current = window.setInterval(() => {
      if (document.hidden) return; // タブ非アクティブ時は送らない（暴走防止）
      const el = trackRef.current;
      if (!el) return;
      scrollCardIntoView(el, currentIndex(el) + 1); // 末尾の次は法により先頭へループ
    }, AUTO_MS);
  }, [jobs.length]);

  useEffect(() => {
    restart();
    const el = trackRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPref = () => restart();
    reduce.addEventListener?.('change', onPref);

    // ユーザー操作でタイマーリセット（簡易対応）。
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

  // スクロール（自動・手動とも）でドットの選択位置を追従。
  const onScroll = () => {
    const el = trackRef.current;
    if (el) setActive(currentIndex(el));
  };

  // ドット押下：該当カードへスクロール＋タイマーリセット。
  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    scrollCardIntoView(el, i);
    restart();
  };

  // 0件時はセクションごと非表示（呼び出し側でも制御するが二重防御）。
  if (jobs.length === 0) return null;

  return (
    <section className="mb-8">
      {/* 見出し（フクエスワークのブランドグラデ グリーン→ライム） */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2
          className="text-lg font-extrabold inline-block"
          style={{
            background: 'linear-gradient(95deg,#10B981,#84CC16)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          {title}
        </h2>
      </div>

      {/* トラック：横スクロール＋スナップ（1枚ずつ全幅表示）。relative でカードの offsetLeft をスクロール基点に一致させる。
          overflow はこの要素内に閉じ込め、ページ全体を広げない。 */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="relative overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex gap-3">
          {displayJobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              data-card
              className="snap-start flex-shrink-0 w-full block rounded-2xl overflow-hidden shadow-lg border border-emerald-100 bg-white"
            >
              {/* 上部：求人画像（aspect-video）。切れ防止のためブラー背景＋object-contain（焼き込み文言も切れない）。
                  画像が無い場合はブランドグラデを敷く。オーバーレイ（グラデ・文字）は撤去。 */}
              <div className="relative aspect-video bg-emerald-50">
                {job.imageUrl ? (
                  <>
                    <Image
                      src={job.imageUrl}
                      alt=""
                      fill
                      aria-hidden
                      className="object-cover blur-lg scale-110 opacity-60"
                      sizes="(max-width: 768px) 100vw, 768px"
                    />
                    <Image
                      src={job.imageUrl}
                      alt={job.salon.name}
                      fill
                      className="object-contain"
                      sizes="(max-width: 768px) 100vw, 768px"
                    />
                  </>
                ) : (
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#10B981,#84CC16)' }} />
                )}

                {/* PICKUP バッジ（フクエスワークのグリーン→ライム） */}
                <span
                  className="absolute top-2 left-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full shadow tracking-wide"
                  style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
                >
                  ✦ PICKUP
                </span>
              </div>

              {/* 下部：白背景の情報欄。サロン名（主）＋求人タイトル＋給与（給与はグリーン系）。 */}
              <div className="px-4 py-3 bg-white">
                <p className="font-bold text-slate-900 text-sm leading-tight line-clamp-1">{job.salon.name}</p>
                <p className="text-slate-600 text-xs leading-snug mt-1 line-clamp-2">{job.title}</p>
                {job.salaryText && (
                  <p className="text-emerald-600 font-bold text-sm mt-1.5 line-clamp-1">{job.salaryText}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ドット（2件以上のみ）。選択中はグリーン→ライムの横長ドット。 */}
      {multiple && (
        <div className="flex justify-center gap-1.5 mt-3">
          {displayJobs.map((job, i) => (
            <button
              key={job.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1}枚目のおすすめ求人を表示`}
              aria-current={active === i ? 'true' : undefined}
              className="h-1.5 rounded-full transition-all"
              style={
                active === i
                  ? { width: '18px', background: 'linear-gradient(95deg,#10B981,#84CC16)' }
                  : { width: '6px', background: '#cbd5e1' }
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
