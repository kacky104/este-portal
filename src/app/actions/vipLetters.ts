'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// VIPレターの配信（サーバー専用）。
// - 送信者がその salon の owner 本人（または管理者）であることをサーバー側で検証。
// - vip_letters / vip_letter_recipients への書き込みは service_role でのみ行う（クライアント insert 不可）。

type SendInput = {
  salonId: number;
  title: string;
  body: string;
  couponEnabled: boolean;
  couponDiscount: string;
  couponTerms: string;
  couponExpiresAt: string; // 'YYYY-MM-DD' or ''
  couponColor: string;     // couponColors のキー
};

type OwnerOk = { userId: string };
type OwnerErr = { error: string };

// ログインユーザーがその salon の owner（または管理者UID）かをサーバー側で検証。
async function assertOwner(salonId: number): Promise<OwnerOk | OwnerErr> {
  if (!Number.isFinite(salonId)) return { error: '対象店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };

  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { error: '店舗が見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { error: 'この店舗の送信権限がありません' };
  }
  return { userId: user.id };
}

/** 送信前に「このお店を保存している会員数」を返す（owner検証必須・service_roleで集計）。 */
export async function getSavedSalonMemberCount(
  salonId: number,
): Promise<{ count: number } | { error: string }> {
  const auth = await assertOwner(salonId);
  if ('error' in auth) return { error: auth.error };

  const svc = createServiceClient();
  const { count, error } = await svc
    .from('saved_items')
    .select('user_id', { count: 'exact', head: true })
    .eq('item_type', 'salon')
    .eq('item_id', salonId);
  if (error) return { error: error.message };
  return { count: count ?? 0 };
}

/** VIPレターを送信（スナップショット型）。letter作成→保存者のuser_idをrecipientsへ一括登録。 */
export async function sendVipLetter(
  input: SendInput,
): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }> {
  const auth = await assertOwner(input.salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: 'タイトルと本文は必須です' };

  const svc = createServiceClient();

  // 保存者（item_type='salon' かつ item_id=salonId）の user_id を全件取得（RLS越え）。
  const { data: savedRows, error: savedErr } = await svc
    .from('saved_items')
    .select('user_id')
    .eq('item_type', 'salon')
    .eq('item_id', input.salonId);
  if (savedErr) return { ok: false, error: savedErr.message };

  const userIds = [...new Set((savedRows ?? []).map(r => r.user_id as string))];
  if (userIds.length === 0) {
    return { ok: false, error: 'このお店を保存している会員がいないため送信できません' };
  }

  // クーポン同梱は「クーポンを付ける」かつ割引内容ありのときのみ。
  const hasCoupon = input.couponEnabled && input.couponDiscount.trim() !== '';

  const { data: letter, error: letterErr } = await svc
    .from('vip_letters')
    .insert({
      salon_id: input.salonId,
      title,
      body,
      coupon_discount: hasCoupon ? input.couponDiscount.trim() : null,
      coupon_terms: hasCoupon ? (input.couponTerms.trim() || null) : null,
      coupon_expires_at: hasCoupon ? (input.couponExpiresAt || null) : null,
      coupon_color: hasCoupon ? input.couponColor : 'pink',
    })
    .select('id')
    .single();
  if (letterErr || !letter) {
    return { ok: false, error: letterErr?.message ?? 'レターの作成に失敗しました' };
  }

  // recipients を一括 insert（read_at は default null）。
  const rows = userIds.map(uid => ({ letter_id: letter.id as string, user_id: uid }));
  const { error: recErr } = await svc.from('vip_letter_recipients').insert(rows);
  if (recErr) return { ok: false, error: recErr.message };

  return { ok: true, recipientCount: userIds.length };
}
