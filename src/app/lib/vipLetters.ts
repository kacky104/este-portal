import type { SupabaseClient } from '@supabase/supabase-js';

// VIPレター：会員受信側の型・取得ロジック・未読数。
// 配信（作成）は service_role 専用（src/app/actions/vipLetters.ts）。ここは受信側の読み取りのみ。

export type VipLetterCoupon = {
  discount: string;
  terms: string | null;
  expiresAt: string | null; // 'YYYY-MM-DD'
  color: string;            // couponColors のキー
};

export type MemberVipLetter = {
  recipientId: string;      // vip_letter_recipients.id（既読更新に使う）
  read: boolean;            // read_at != null
  receivedAt: string;       // ISO（letter.created_at）
  salonId: number;
  salonName: string;
  title: string;
  body: string;
  coupon: VipLetterCoupon | null; // coupon_discount が無ければ null
};

/** 自分宛のVIPレター（recipients に自分がいるもの）を新しい順で取得。RLS（本人のみ）に依存。 */
export async function getMemberVipLetters(supabase: SupabaseClient): Promise<MemberVipLetter[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows, error } = await supabase
    .from('vip_letter_recipients')
    .select('id, read_at, letter:vip_letters(id, salon_id, title, body, coupon_discount, coupon_terms, coupon_expires_at, coupon_color, created_at)')
    .order('created_at', { ascending: false });

  if (error || !rows) return [];

  // 店名をまとめて取得。
  const salonIds = [...new Set(
    rows.map(r => {
      const letter = (r as Record<string, unknown>).letter as Record<string, unknown> | null;
      return letter ? Number(letter.salon_id) : NaN;
    }).filter(n => !Number.isNaN(n))
  )];
  const salonNameById = new Map<number, string>();
  if (salonIds.length > 0) {
    const { data: salons } = await supabase.from('salons').select('id, name').in('id', salonIds);
    for (const s of (salons ?? []) as Record<string, unknown>[]) {
      salonNameById.set(Number(s.id), (s.name as string) ?? '');
    }
  }

  const out: MemberVipLetter[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const letter = r.letter as Record<string, unknown> | null;
    if (!letter) continue; // レターが消えている等
    const discount = (letter.coupon_discount as string | null) ?? null;
    const sid = Number(letter.salon_id);
    out.push({
      recipientId: r.id as string,
      read: r.read_at != null,
      receivedAt: (letter.created_at as string) ?? '',
      salonId: sid,
      salonName: salonNameById.get(sid) ?? '',
      title: (letter.title as string) ?? '',
      body: (letter.body as string) ?? '',
      coupon: discount
        ? {
            discount,
            terms: (letter.coupon_terms as string | null) ?? null,
            expiresAt: (letter.coupon_expires_at as string | null) ?? null,
            color: (letter.coupon_color as string | null) ?? 'pink',
          }
        : null,
    });
  }
  // letter.created_at の新しい順に整える（recipients の order が embedded に効かない場合の保険）。
  out.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  return out;
}

/** 自分の未読VIPレター数（read_at が null）。NotificationBell の未読数に合算する。RLS（本人のみ）に依存。 */
export async function getVipUnreadCount(supabase: SupabaseClient): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count } = await supabase
    .from('vip_letter_recipients')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return count ?? 0;
}
