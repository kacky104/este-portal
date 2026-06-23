import type { SupabaseClient } from '@supabase/supabase-js';

// 会員の「保存サロンの新着」フィード（プル型・動的計算）。
// 通知レコードは作らず、表示のたびに saved_items / announcements / coupons から算出する。
// - 新着の定義：保存サロンを「保存した日時（saved_items.created_at）より後」に出た公開済みの
//   announcement（published_at で判定）と coupon（created_at で判定）。
// - 未読の定義：上記のうち notification_reads.last_checked_at より後に出たもの。
// server / browser どちらの Supabase クライアントでも呼べる（getUser でログイン会員のみ対象）。

export type NotificationItem = {
  key: string;                          // 一意キー（種別+ID）
  type: 'announcement' | 'coupon';
  salonId: number;
  salonName: string;
  title: string;
  at: string;                           // ISO日時（announcement=published_at / coupon=created_at）
  href: string;                         // 遷移先（お知らせ→/news、クーポン→/coupon）
  isUnread: boolean;
};

export type NotificationFeed = {
  items: NotificationItem[];
  unreadCount: number;
  lastCheckedAt: string | null;
};

const EMPTY: NotificationFeed = { items: [], unreadCount: 0, lastCheckedAt: null };

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

  const savedAtBySalon = new Map<number, number>();
  for (const s of saved) savedAtBySalon.set(Number(s.item_id), new Date(s.created_at).getTime());
  const salonIds = [...savedAtBySalon.keys()];

  // 互いに独立なクエリを並列化。
  const [annRes, coupRes, salonRes, readRes] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, salon_id, title, published_at')
      .in('salon_id', salonIds)
      .eq('is_published', true),
    supabase
      .from('coupons')
      .select('id, salon_id, title, created_at')
      .in('salon_id', salonIds)
      .eq('is_published', true),
    supabase.from('salons').select('id, name').in('id', salonIds),
    supabase.from('notification_reads').select('last_checked_at').eq('user_id', user.id).maybeSingle(),
  ]);

  const salonNameById = new Map<number, string>();
  for (const s of (salonRes.data ?? []) as Record<string, unknown>[]) {
    salonNameById.set(Number(s.id), (s.name as string) ?? '');
  }

  const lastCheckedAt = (readRes.data?.last_checked_at as string | null) ?? null;
  const lastMs = lastCheckedAt ? new Date(lastCheckedAt).getTime() : 0; // 行が無ければ全件未読扱い

  const items: NotificationItem[] = [];

  for (const a of (annRes.data ?? []) as Record<string, unknown>[]) {
    const sid = Number(a.salon_id);
    const savedMs = savedAtBySalon.get(sid);
    const pub = a.published_at as string | null;
    if (savedMs == null || !pub) continue;
    const atMs = new Date(pub).getTime();
    if (atMs <= savedMs) continue; // 保存日時より後のものだけ新着
    items.push({
      key: `announcement-${a.id}`,
      type: 'announcement',
      salonId: sid,
      salonName: salonNameById.get(sid) ?? '',
      title: (a.title as string) ?? '',
      at: pub,
      href: `/salon/${sid}/news`,
      isUnread: atMs > lastMs,
    });
  }

  for (const c of (coupRes.data ?? []) as Record<string, unknown>[]) {
    const sid = Number(c.salon_id);
    const savedMs = savedAtBySalon.get(sid);
    const created = c.created_at as string | null;
    if (savedMs == null || !created) continue;
    const atMs = new Date(created).getTime();
    if (atMs <= savedMs) continue;
    items.push({
      key: `coupon-${c.id}`,
      type: 'coupon',
      salonId: sid,
      salonName: salonNameById.get(sid) ?? '',
      title: (c.title as string) ?? '',
      at: created,
      href: `/salon/${sid}/coupon`,
      isUnread: atMs > lastMs,
    });
  }

  // 種別をまたいで日時の降順（新しい順）に統一。
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const unreadCount = items.filter(i => i.isUnread).length;
  return { items, unreadCount, lastCheckedAt };
}
