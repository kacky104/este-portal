import type { SupabaseClient } from '@supabase/supabase-js';
import { pickOnePerSalon, ONE_PER_SALON_FETCH_MULTIPLIER } from '@/lib/announceAuto';

// フクエスワークの「店舗新着情報」ブロック（/jobs トップ）と一覧（/jobs/news）の共通取得。
// ★ フクエス本体の salonNews.ts（announcements 版）と同じ形。★ 中身が work_news に変わっただけ。
//
// ★★★ 飛び先は【その店の求人詳細】（/jobs/<求人ID>）。
//   ★ 新着情報1本ごとのページは作らない。★ どの1本を押しても、その店の求人詳細へ行く
//     （新着情報タブがそこにある）。★ 迷子を作らない。
//
// ★★ 出す条件は3つそろったときだけ:
//   ① 新着情報が公開中（is_published）
//   ② 店舗が表示中（salons.is_hidden = false）
//   ③ その店の求人が公開中（salon_jobs.is_active）
//   ★ ③ が要るのは、飛び先が求人詳細だから。★ 非公開の求人に送ると空振りになる。

export type WorkNewsFeedItem = {
  id: string;
  salonId: number;
  salonName: string;
  /** 飛び先。★ /jobs/<jobId> */
  jobId: number;
  title: string;
  imageUrl: string | null;
  publishedAt: string; // ISO
};

/** 一覧（もっと見る）に出す上限。★ 51件目は出さない（2026-09-11・カッキーさんの指示）。 */
export const WORK_NEWS_FEED_MAX = 50;

/** トップのブロックに出す件数。 */
export const WORK_NEWS_FEED_TOP = 5;

/**
 * @param onePerSalon 同じ店を1件だけにする。
 *
 * ★★★ トップのブロックだけ true。
 *   ★ 自動配信は同じ店の記事を毎日押し上げるので、間引かないとトップが1店で埋まる。
 *   ★ 1店舗1件にすれば【構造的に埋まらない】。★ 判定はフクエス本体と同じ pickOnePerSalon。
 * ★ 一覧（/jobs/news）は false。★ あちらは履歴を見に行く場所で、
 *   間引くと「書いたのに出ていない」に見える。
 */
export async function fetchLatestWorkNews(
  supabase: SupabaseClient,
  limit: number,
  onePerSalon = false,
): Promise<WorkNewsFeedItem[]> {
  // ★ 間引く前提のときは多めに読む。★ さらに「求人が非公開の店」を後から落とすので、
  //   どちらの場合も少し余裕を持って読む（★ 足りなければ空けたまま出す。古い記事で埋めない）。
  const fetchLimit = (onePerSalon ? limit * ONE_PER_SALON_FETCH_MULTIPLIER : limit) * 2;

  const { data } = await supabase
    .from('work_news')
    .select('id, salon_id, title, image_url, published_at, salons!inner(id, name, is_hidden)')
    .eq('is_published', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false })
    .limit(fetchLimit);

  const rows = (data ?? []).map((r) => {
    // to-one リレーションはオブジェクトで返るが、型上は配列になり得るため両対応で name を取る。
    const salonRel = r.salons as { name?: string } | Array<{ name?: string }> | null;
    const salonName = Array.isArray(salonRel) ? (salonRel[0]?.name ?? '') : (salonRel?.name ?? '');
    return {
      id: String(r.id),
      salonId: Number(r.salon_id),
      salonName,
      title: (r.title as string) ?? '',
      imageUrl: (r.image_url as string | null) ?? null,
      publishedAt: (r.published_at as string) ?? '',
    };
  });
  if (rows.length === 0) return [];

  // ★ 飛び先（求人ID）をまとめて引く。★ 公開中の求人だけ。★ 1店1件（1店舗1求人）。
  const salonIds = Array.from(new Set(rows.map((r) => r.salonId)));
  const { data: jobs } = await supabase
    .from('salon_jobs')
    .select('id, salon_id')
    .in('salon_id', salonIds)
    .eq('is_active', true);
  const jobBySalon = new Map<number, number>();
  for (const j of jobs ?? []) jobBySalon.set(Number(j.salon_id), Number(j.id));

  // ★ 並べ替えない。新しい順のまま、飛び先の無い店（求人が非公開）を落とすだけ。
  const items: WorkNewsFeedItem[] = [];
  for (const r of rows) {
    const jobId = jobBySalon.get(r.salonId);
    if (jobId == null) continue;
    items.push({ ...r, jobId });
  }

  return onePerSalon ? pickOnePerSalon(items, limit) : items.slice(0, limit);
}
