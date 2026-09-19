// フクエスCRM 第1段階：予約を顧客台帳へ名寄せする（2026-09-19）。
//
// ★ 何をするか
//   予約の電話番号（数字のみ・10〜13桁）で、その店の salon_customer_phones を探す。
//   見つかればその customer_id、無ければ salon_customers を1人作って番号を登録し、その id を返す。
// ★ 無料の店でも名寄せ（記録）はする。見せるのは有料CRMの店だけ（画面側・サーバー側で判定）。
// ★ 失敗しても予約そのものは止めない（null を返すだけ）。名寄せは「おまけ」の記録。
// ★ supabase/migrations/20260919_salon_customers.sql と対。電話番号の形は DB の CHECK と同じ。

import type { createServiceClient } from '@/app/lib/supabase/service';
import { normalizePhone } from '@/app/lib/validation/phone';

type Svc = ReturnType<typeof createServiceClient>;

const CRM_PHONE_RE = /^\d{10,13}$/;

/** 名寄せに使える形へそろえた電話番号。使えない番号なら空文字。 */
export function crmPhone(tel: string | null | undefined): string {
  const p = normalizePhone(String(tel ?? ''));
  return CRM_PHONE_RE.test(p) ? p : '';
}

async function findCustomerId(svc: Svc, salonId: number, phone: string): Promise<number | null> {
  const { data, error } = await svc
    .from('salon_customer_phones')
    .select('customer_id')
    .eq('salon_id', salonId)
    .eq('phone', phone)
    .maybeSingle();
  if (error || !data) return null;
  return Number(data.customer_id) || null;
}

/**
 * 電話番号から顧客を探し、無ければ作る。返り値は customer_id（名寄せできないときは null）。
 * 名前は新しく作るときだけ使う（既存の顧客の名前は上書きしない＝店が台帳で直した名前を守る）。
 */
export async function linkBookingCustomer(
  svc: Svc,
  salonId: number,
  tel: string | null | undefined,
  name: string | null | undefined,
): Promise<number | null> {
  try {
    if (!Number.isInteger(salonId) || salonId <= 0) return null;
    const phone = crmPhone(tel);
    if (!phone) return null;

    const found = await findCustomerId(svc, salonId, phone);
    if (found) return found;

    const { data: created, error: cErr } = await svc
      .from('salon_customers')
      .insert({ salon_id: salonId, name: String(name ?? '').trim().slice(0, 40) })
      .select('id')
      .single();
    if (cErr || !created) return null;
    const customerId = Number(created.id);

    const { error: pErr } = await svc
      .from('salon_customer_phones')
      .insert({ customer_id: customerId, salon_id: salonId, phone });
    if (pErr) {
      // 同時に同じ番号で作られた（UNIQUE 違反）→ 作った空の顧客を消して、先に入った方を使う。
      await svc.from('salon_customers').delete().eq('id', customerId);
      return await findCustomerId(svc, salonId, phone);
    }
    return customerId;
  } catch {
    return null;
  }
}
