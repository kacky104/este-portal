'use client';

// ★ 第1524便: ブラウザ側の「セラピスト＋今日の出勤」取得を 1 か所にまとめる。
//
// なぜ要るか（PageSpeed・2026-10-17）
//   トップでは TherapistScroller（出勤中の帯）と useSalonTherapists（店舗カードのサムネ列）が
//   【同じ therapists 全件＋同じ therapist_schedules】をそれぞれ取りに行っていた（35KB＋21KB の二重）。
//   ここで Promise を共有し、同じ画面では 1 回だけ投げる。
//
// 使い方
//   loadTherapistFeed(null)        … 公開中の全セラピスト（非表示店を除く）＋今日の出勤
//   loadTherapistFeed([1, 2, 3])   … salon_id で絞る（エリアページなど）
//   ・絞り込みの要求が来たとき、全件の結果（または取得中）があればそこから切り出す（投げ直さない）。
//   ・同じキーは FEED_TTL_MS の間は同じ Promise を返す（画面内の複数コンポーネントで共有）。
//   ・runWhenIdle(fn) … 初期描画が落ち着いてから fn を呼ぶ（ヒーロー画像の描画と取り合わない）。
//
// ★ ここで投げるクエリの中身（列・条件）は、まとめる前の TherapistScroller と同じ。
//   列は THERAPIST_CARD_COLUMNS（今すぐ3枠の列を含む・tools-test-imasugu-columns.mjs が見張る）。

import { createClient } from '@/app/lib/supabase/client';
import { THERAPIST_CARD_COLUMNS } from '@/lib/therapistColumns';
import { getBusinessDateJST } from '@/lib/dutyStatus';

export type FeedScheduleRow = {
  therapist_id: unknown;
  is_active: unknown;
  start_time: unknown;
  end_time: unknown;
};

async function fetchFeed(salonIds: number[] | null) {
  const supabase = createClient();
  let query = supabase
    .from('therapists')
    .select(THERAPIST_CARD_COLUMNS)
    .eq('salons.is_hidden', false)
    // ★ 非公開（is_active=false）は出さない（第216便の方針）。
    .eq('is_active', true);
  if (salonIds) query = query.in('salon_id', salonIds);
  const { data: therapistData, error } = await query;
  const therapists = therapistData ?? [];

  const ids = therapists.map((t) => t.id);
  let schedules: FeedScheduleRow[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from('therapist_schedules')
      .select('therapist_id, is_active, start_time, end_time')
      .in('therapist_id', ids)
      .eq('schedule_date', getBusinessDateJST());
    schedules = data ?? [];
  }
  return { therapists, schedules, error: error ?? null };
}

export type TherapistFeed = Awaited<ReturnType<typeof fetchFeed>>;
export type FeedTherapistRow = TherapistFeed['therapists'][number];

// 同じキーは短い間だけ共有する（画面内の同時マウントをまとめるのが目的。「今すぐ」の鮮度を長く落とさない）。
const FEED_TTL_MS = 30_000;
const cache = new Map<string, { at: number; p: Promise<TherapistFeed> }>();

function keyOf(salonIds: number[] | null): string {
  return salonIds ? [...salonIds].sort((a, b) => a - b).join(',') : 'all';
}

export function loadTherapistFeed(salonIds: number[] | null): Promise<TherapistFeed> {
  const now = Date.now();
  const key = keyOf(salonIds);
  const hit = cache.get(key);
  if (hit && now - hit.at < FEED_TTL_MS) return hit.p;

  // 絞り込みは、全件があればそこから切り出す
  if (salonIds) {
    const all = cache.get('all');
    if (all && now - all.at < FEED_TTL_MS) {
      const want = new Set(salonIds);
      const p = all.p.then((feed) => {
        const therapists = feed.therapists.filter((t) => want.has(t.salon_id as number));
        const ids = new Set(therapists.map((t) => t.id as number));
        const schedules = feed.schedules.filter((s) => ids.has(s.therapist_id as number));
        return { therapists, schedules, error: feed.error };
      });
      cache.set(key, { at: all.at, p });
      return p;
    }
  }

  const p = fetchFeed(salonIds);
  cache.set(key, { at: now, p });
  p.catch(() => cache.delete(key));
  return p;
}

/**
 * 初期描画が落ち着いてから fn を呼ぶ。戻り値で取り消せる（unmount 用）。
 * requestIdleCallback が無いブラウザ（Safari）では短い setTimeout。
 * timeout を付けるので、ずっと忙しいページでも 1.5 秒以内には必ず動く。
 */
export function runWhenIdle(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 1500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 200);
  return () => window.clearTimeout(id);
}
