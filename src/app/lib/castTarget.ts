import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// ★ 第1777便（カッキーさん・2026-11-08）: セラピストページ（/cast）を店舗オーナー様が【見るだけ】で開けるように。
//
// ★★ 誰のセラピストページを読むか（読み取りの Server Action だけが使う）
//   ・viewAs なし → ログイン中の本人（user_id に結びついたセラピスト）。今までどおり。
//   ・viewAs あり → そのセラピストの店のオーナー様（salons.owner_id）か運営（ADMIN_UUID）のときだけ、そのセラピスト。
//     それ以外は null（★ 在否も答えない）。
// ★★ 書き込み（投稿・記録・保存・今すぐ・着せ替え・ニックネーム）は【これを使わない】。
//   今までどおり「ログイン中の本人」だけ。★ オーナー様が書き込みを呼んでも、本人ではないので必ず断られる。

export type CastTarget = { therapistId: number; salonId: number; viewer: 'self' | 'owner' };

export function toViewAs(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function resolveCastTarget(viewAs?: number | string | null): Promise<CastTarget | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const id = toViewAs(viewAs);

  if (id == null) {
    // ★ 第1223便と同じ: 同じログインが2人に結びついていても先頭の1人
    const { data: rows } = await svc.from('therapists').select('id, salon_id').eq('user_id', user.id).order('id').limit(1);
    const t = rows?.[0];
    if (!t?.id || t.salon_id == null) return null;
    return { therapistId: Number(t.id), salonId: Number(t.salon_id), viewer: 'self' };
  }

  const { data: t } = await svc.from('therapists').select('id, salon_id').eq('id', id).maybeSingle();
  if (!t?.id || t.salon_id == null) return null;
  const salonId = Number(t.salon_id);
  if (user.id !== ADMIN_UUID) {
    const { data: s } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
    if (!s || (s.owner_id as string | null) !== user.id) return null;
  }
  return { therapistId: Number(t.id), salonId, viewer: 'owner' };
}
