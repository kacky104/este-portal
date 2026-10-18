'use server';

// ★ 第1552便（2026-10-18・カッキーさん）: 共通ヘッダーの「いまのポイント」。
// ★ 読み取りだけ（書き込みはしない）。期限切れの行を足す処理（expireIfNeeded）は、ここでは呼ばない
//   ＝ページを見るたびに DB へ書き込まないため。期限が過ぎていれば表示を 0 にするだけ（本当の失効はポイントページ側）。
// ★ 返すのはログインした本人の分だけ。テーブル・列・RLS は変えていない。
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { POINT_EARN_KINDS, pointExpiresAt, pointsExpired } from '@/lib/points';

export async function getHeaderPoints(): Promise<{ ok: true; balance: number; expiresAt: string | null } | { ok: false }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    const { data, error } = await createServiceClient()
      .from('member_points').select('delta, kind, created_at')
      .eq('user_id', user.id).limit(5000);
    if (error) return { ok: false };
    const rows = data ?? [];
    const sum = rows.reduce((s, r) => s + (Number(r.delta) || 0), 0);
    const lastEarn = rows
      .filter((r) => POINT_EARN_KINDS.includes(String(r.kind)))
      .map((r) => String(r.created_at)).sort().pop() ?? null;
    const balance = sum > 0 && pointsExpired(lastEarn) ? 0 : Math.max(0, sum);
    return { ok: true, balance, expiresAt: balance > 0 ? (pointExpiresAt(lastEarn)?.toISOString() ?? null) : null };
  } catch {
    return { ok: false };
  }
}
