'use server';

import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';

// コネックエフ（conecf.com）の入口の権限（第395便・1a・2026-09-17）。
//
// ★ 誰が入れるか：店舗オーナー（salons.owner_id = 自分）と運営（ADMIN_UUID）だけ。
// ★ 判定はサーバーで行う。★ 画面は結果に従って「ログイン」「店舗なし」「中身」を出し分けるだけ。
// ★ 店舗の選び方は /mypage/media（useMediaGate）と同じ：非表示でない店を先に、id の若い順で1件。
//   ★ 複数店舗の切り替えは第1弾では作らない。
// ★★ 1a では読むだけ。★ DB には1行も書かない。

export type ConecfAccess =
  | { ok: true; role: 'owner' | 'operator'; email: string; salonId: number | null; salonName: string }
  | { ok: false; reason: 'login' }
  | { ok: false; reason: 'no_salon'; email: string };

export async function getConecfAccess(): Promise<ConecfAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'login' };

  const email = user.email ?? '';

  const { data: salon } = await supabase
    .from('salons')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (salon) {
    return {
      ok: true,
      role: user.id === ADMIN_UUID ? 'operator' : 'owner',
      email,
      salonId: Number(salon.id),
      salonName: (salon.name as string | null) ?? '',
    };
  }

  // ★ 運営は店舗を持っていなくても入れる（★ 中身の画面は、店舗を選べるようになるまで空）
  if (user.id === ADMIN_UUID) {
    return { ok: true, role: 'operator', email, salonId: null, salonName: '' };
  }

  return { ok: false, reason: 'no_salon', email };
}
