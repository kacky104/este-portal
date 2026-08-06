'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 店舗別インプレッション計測（2026-08-06 新設）。
//
// カード/バナーのマークアップ内に <ImpressionMark salonId={..} surface=".." /> を1つ置くと、
// その**親要素**が画面に50%以上見えた時点で「1インプレッション」として記録する
// （IntersectionObserver。祖先の overflow-hidden によるクリップも考慮されるので、
//  横スクロールのスライダーで画面外にあるカードは、スクロールで見えるまで数えない）。
//
// - 記録先: salon_impression_daily（店舗 × 面 × 日）。/admin「店舗別アクセス・送客数」で見る。
// - 多重カウント防止: 同一セッション × 同一店舗 × 同一面 は1回だけ（sessionStorage）。
//   PV（PageViewLogger）・送客（logSalonAction）と同じ人数ベースに揃え、
//   インプレ → 詳細PV → 送客 のファネルが比率として読めるようにする。
// - 送信: 1件ずつ送ると1ページで数十リクエストになるため、モジュール内のキューに貯めて
//   5秒ごと＋タブが隠れた時（visibilitychange）に increment_salon_impressions RPC で一括加算。
//   失敗しても表示には一切影響させない（fire-and-forget）。
// - この部品自体は display:none の span（レイアウトに影響しない）。
//
// 対象面（surface）:
//   card      … 店舗カード（ShuffledSalons の SalonCard。TOP・地域ページの一覧）
//   therapist … セラピストカード（TherapistScroller の Card。TOP/地域スライダー・/working・
//               /therapists 検索・新人・キャストページなど Card を使う全箇所）
//   banner    … 店舗バナー（ピックアップ店舗スライダー・おすすめ店舗バナー）
//   ※「セラピストピックアップ枠」は DB が店舗IDを持たない（店名は自由記入）ため対象外。

export type ImpressionSurface = 'card' | 'therapist' | 'banner';

// ── モジュール共有の送信キュー ──
const queue = new Map<string, { s: number; f: string; n: number }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let visListenerAdded = false;

function flush() {
  if (queue.size === 0) return;
  const items = [...queue.values()];
  queue.clear();
  try {
    createClient()
      .rpc('increment_salon_impressions', { p_items: items })
      .then(() => {}, () => {}); // 失敗は無視（表示を邪魔しない）
  } catch {
    // 送信できない環境でも本文表示には影響させない。
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 5000);
}

function onVisibilityChange() {
  // タブを閉じる/離れる直前に貯まっている分を送る（間に合わない分は諦める）。
  if (document.visibilityState === 'hidden') flush();
}

// ── モジュール共有の IntersectionObserver ──
const meta = new WeakMap<Element, { salonId: number; surface: ImpressionSurface }>();
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const m = meta.get(entry.target);
        observer!.unobserve(entry.target); // 一度数えたら監視終了
        if (!m) continue;
        const storageKey = `imp:${m.surface}:${m.salonId}`;
        try {
          if (sessionStorage.getItem(storageKey)) continue;
          sessionStorage.setItem(storageKey, '1');
        } catch {
          // sessionStorage 不可でも計測は続行（多重防止のみ諦める）。
        }
        const qk = `${m.surface}:${m.salonId}`;
        const cur = queue.get(qk);
        if (cur) cur.n += 1;
        else queue.set(qk, { s: m.salonId, f: m.surface, n: 1 });
        scheduleFlush();
      }
    },
    { threshold: 0.5 }, // 要素の50%が見えたら「表示された」とみなす
  );
  return observer;
}

export function ImpressionMark({
  salonId,
  surface,
}: {
  salonId: number | null | undefined;
  surface: ImpressionSurface;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!salonId || Number.isNaN(salonId)) return;
    if (typeof IntersectionObserver === 'undefined') return; // 古い環境では計測しない
    const el = ref.current?.parentElement;
    if (!el) return;

    // このセッションで既に数えた組は監視自体を省く。
    try {
      if (sessionStorage.getItem(`imp:${surface}:${salonId}`)) return;
    } catch {
      // 判定できなければ監視する（多重防止は enqueue 時にも行う）。
    }

    if (!visListenerAdded) {
      document.addEventListener('visibilitychange', onVisibilityChange);
      visListenerAdded = true;
    }

    const obs = getObserver();
    meta.set(el, { salonId, surface });
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      meta.delete(el);
    };
  }, [salonId, surface]);

  return <span ref={ref} aria-hidden className="hidden" />;
}
