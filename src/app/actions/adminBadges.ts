'use server';

// /admin のサイドバーの件数バッジ用（第1543便・2026-10-17・カッキーさん）。
// ★ 読むだけ（書き換えない）。★ 件数だけを返す（中身は返さない）。
// ★ 口コミの承認待ち（therapist_reviews.status='pending'）は RLS で運営本人にも見えないため service_role で数える
//   （/moderation の一覧と同じ理由）。★ 呼べるのは ADMIN_UUID だけ。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

export async function adminPendingReviewCount(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  const svc = createServiceClient();
  const { count, error } = await svc
    .from('therapist_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}
