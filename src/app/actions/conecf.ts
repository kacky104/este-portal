'use server';

import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { createServiceClient } from '@/app/lib/supabase/service';

// コネックエフ（conecf.com）の入口の権限（第395便・1a・2026-09-17）。
//
// ★ 誰が入れるか：店舗オーナー（salons.owner_id = 自分）と運営（ADMIN_UUID）だけ。
// ★ 判定はサーバーで行う。★ 画面は結果に従って「ログイン」「店舗なし」「中身」を出し分けるだけ。
// ★ 店舗の選び方は /mypage/media（useMediaGate）と同じ：非表示でない店を先に、id の若い順で1件。
//   ★ 複数店舗の切り替えは第1弾では作らない。
// ★★ 書くのは enableConecf（切り替え）だけ。

export type ConecfAccess =
  | { ok: true; role: 'owner' | 'operator'; email: string; salonId: number | null; salonName: string; enabledAt: string | null }
  | { ok: false; reason: 'login' }
  | { ok: false; reason: 'no_salon'; email: string };

export async function getConecfAccess(): Promise<ConecfAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'login' };

  const email = user.email ?? '';

  const { data: salon } = await supabase
    .from('salons')
    .select('id, name, conecf_enabled_at')
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
      enabledAt: (salon.conecf_enabled_at as string | null) ?? null,
    };
  }

  // ★ 運営は店舗を持っていなくても入れる（★ 中身の画面は、店舗を選べるようになるまで空）
  if (user.id === ADMIN_UUID) {
    return { ok: true, role: 'operator', email, salonId: null, salonName: '', enabledAt: null };
  }

  return { ok: false, reason: 'no_salon', email };
}

/**
 * ★★ 「コネックエフに切り替える」（第399便・カッキーさんの決定）。
 * ★ 店舗様が自分で押す。★ 押すと salons.conecf_enabled_at に今の時刻が入り、
 *   セラピストの追加・写真・年齢・サイズ・公開・出勤を /mypage で直せなくなる（案B）。
 * ★ 戻すのは運営だけ（★ 行ったり来たりの事故を避ける）。★ ここでは戻す口を作らない。
 * ★ すでに入っていれば何もしない（★ 日付を上書きしない）。
 */
export async function enableConecf(): Promise<{ ok: true; enabledAt: string } | { ok: false; error: string }> {
  const a = await getConecfAccess();
  if (!a.ok) return { ok: false, error: 'ログインが必要です' };
  if (a.salonId == null) return { ok: false, error: '店舗が選ばれていません' };
  if (a.enabledAt) return { ok: true, enabledAt: a.enabledAt };
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from('salons')
    .update({ conecf_enabled_at: now })
    .eq('id', a.salonId)
    .is('conecf_enabled_at', null)
    .select('conecf_enabled_at')
    .maybeSingle();
  if (error) return { ok: false, error: `切り替えに失敗しました: ${error.message}` };
  return { ok: true, enabledAt: (data?.conecf_enabled_at as string | null) ?? now };
}
