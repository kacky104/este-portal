import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildNotificationFeed,
  FEED_WINDOW_DAYS,
  type FeedCandidate,
  type FeedKind,
} from '@/lib/notificationFeed';

// 会員の「保存サロンの新着」フィード（プル型・動的計算）。
// 通知レコードは作らず、表示のたびに saved_items / announcements / coupons から算出する。
//
// ★★★ 絞り込みの判断は src/lib/notificationFeed.ts の純粋関数（第103便）。
//   ★ ここは【DBから拾って渡し、返ってきたとおりに出す】だけ。★ 条件をここに書かない。
//   ★ now もあちらへ渡す（★ 点検で「15日前」を作れるように）。
//
// - 新着の定義：保存サロンを「保存した日時（saved_items.created_at）より後」に出た公開済みの
//   announcement（published_at で判定）と coupon（created_at で判定）。
//   ★★ かつ【直近14日】（第103便・カッキーさんの決定「見てないだけで1ヶ月放置は新着ではない」）。
// - 未読の定義：上記のうち notification_reads.last_checked_at より後に出たもの。
//   ★★ 数えるのは【絞ったあとの行】だけ。★ ベルと一覧をずらさない。
// server / browser どちらの Supabase クライアントでも呼べる（getUser でログイン会員のみ対象）。

export type NotificationItem = {
  key: string;                          // 一意キー（種別+ID）
  type: FeedKind;
  salonId: number;
  salonName: string;
  title: string;
  at: string;                           // ISO日時（announcement=published_at / coupon=created_at）
  href: string;                         // 遷移先（お知らせ→/news、クーポン→/coupon）
  isUnread: boolean;
  /** ★ この店には出していない新着がまだある。★ 件数は持たない（第103便の判断） */
  hasMore: boolean;
};

export type NotificationFeed = {
  items: NotificationItem[];
  unreadCount: number;
  lastCheckedAt: string | null;
  /** ★ 上限で出せなかった店の数。0なら上限に当たっていない */
  cappedSalons: number;
};

const EMPTY: NotificationFeed = { items: [], unreadCount: 0, lastCheckedAt: null, cappedSalons: 0 };

export async function getNotificationFeed(supabase: SupabaseClient): Promise<NotificationFeed> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY; // 未ログインは通知なし

  // 保存サロン（item_type='salon'）と各々の保存日時。
  const { data: savedRows } = await supabase
    .from('saved_items')
    .select('item_id, created_at')
    .eq('item_type', 'salon');

  const saved = (savedRows ?? []) as { item_id: number | string; created_at: string }[];
  if (saved.length === 0) return EMPTY;

  const savedAtBySalon = new Map<number, string>();
  for (const s of saved) savedAtBySalon.set(Number(s.item_id), s.created_at);
  const salonIds = [...savedAtBySalon.keys()];

  // ★★ 期間の区切りは DB 側でも掛ける。★ 1年ぶんを持ってきてから捨てない（第103便）。
  //   ★ 判定そのものは純粋関数がもう一度やる。ここは【運ぶ量を減らすため】だけ。
  const now = new Date();
  const windowStartISO = new Date(now.getTime() - FEED_WINDOW_DAYS * 24 * 3_600_000).toISOString();

  // 互いに独立なクエリを並列化。
  const [annRes, coupRes, salonRes, readRes] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, salon_id, title, published_at')
      .in('salon_id', salonIds)
      .eq('is_published', true)
      .gte('published_at', windowStartISO),
    supabase
      .from('coupons')
      .select('id, salon_id, title, created_at')
      .in('salon_id', salonIds)
      .eq('is_published', true)
      .gte('created_at', windowStartISO),
    supabase.from('salons').select('id, name').in('id', salonIds),
    supabase.from('notification_reads').select('last_checked_at').eq('user_id', user.id).maybeSingle(),
  ]);

  const salonNameById = new Map<number, string>();
  for (const s of (salonRes.data ?? []) as Record<string, unknown>[]) {
    salonNameById.set(Number(s.id), (s.name as string) ?? '');
  }

  const lastCheckedAt = (readRes.data?.last_checked_at as string | null) ?? null;

  // ── 候補を組み立てる（★ ここでは何も落とさない。落とすのは純粋関数）──
  const candidates: FeedCandidate[] = [];

  for (const a of (annRes.data ?? []) as Record<string, unknown>[]) {
    const sid = Number(a.salon_id);
    candidates.push({
      key: `announcement-${a.id}`,
      type: 'announcement',
      salonId: sid,
      salonName: salonNameById.get(sid) ?? '',
      title: (a.title as string) ?? '',
      at: (a.published_at as string) ?? '',
      href: `/salon/${sid}/news`,
      savedAt: savedAtBySalon.get(sid) ?? null,
    });
  }

  for (const c of (coupRes.data ?? []) as Record<string, unknown>[]) {
    const sid = Number(c.salon_id);
    candidates.push({
      key: `coupon-${c.id}`,
      type: 'coupon',
      salonId: sid,
      salonName: salonNameById.get(sid) ?? '',
      title: (c.title as string) ?? '',
      at: (c.created_at as string) ?? '',
      href: `/salon/${sid}/coupon`,
      savedAt: savedAtBySalon.get(sid) ?? null,
    });
  }

  const feed = buildNotificationFeed({ candidates, now, lastCheckedAt });

  return {
    items: feed.rows,
    unreadCount: feed.unreadCount,
    lastCheckedAt,
    cappedSalons: feed.cappedSalons,
  };
}
