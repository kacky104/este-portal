'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { isOwnerLiveRow } from '@/lib/imasugu';

// セラピスト本人の「今すぐ受付中」（キャスト枠）を更新するサーバー専用処理。
// therapists には「本人（user_id = auth.uid()）の UPDATE」を許す RLS が無いため、
// service_role で更新しつつ、ここで本人性を検証する（既存 castTheme.ts / castInvite.ts と同じ流儀）。
//
// 安全装置：
//  - ログイン中ユーザーの user_id に一致する行のみ更新（.eq('user_id', user.id)）。
//  - 更新列は is_available_now_cast / available_until_cast の2列のみ（キャスト専用枠）。
//    オーナー枠（is_available_now / available_until）には一切触れない。
//  - ON は30分有効（available_until_cast = now + 30分）。期限切れは cron／クライアント判定で失効。

const THIRTY_MIN_MS = 30 * 60 * 1000;

export async function setCastImasugu(
  on: boolean
): Promise<{ ok: true; availableUntil: string | null } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();

  // 排他制御：ON にしようとしたとき、オーナー枠が現在ライブなら拒否（相手の枠は上書きしない）。
  // UIロック（CastImasugu）が効いていても念のためサーバー側で二重ガード。OFF（解除）は常に許可。
  if (on) {
    const { data: row } = await svc
      .from('therapists')
      .select('is_available_now, available_until')
      .eq('user_id', user.id)
      .maybeSingle();
    if (row && isOwnerLiveRow(row)) {
      return { ok: false, error: 'お店が「今すぐ」を設定中のため、本人からは設定できません。' };
    }
  }

  // ON：30分後まで有効。OFF：即失効（null）。
  const availableUntil = on ? new Date(Date.now() + THIRTY_MIN_MS).toISOString() : null;

  const { data: updated, error } = await svc
    .from('therapists')
    .update({
      is_available_now_cast: on,
      available_until_cast: availableUntil,
    })
    .eq('user_id', user.id)
    .select('id');

  if (error) return { ok: false, error: `今すぐの更新に失敗しました: ${error.message}` };
  if (!updated || updated.length === 0) {
    return { ok: false, error: '対象のセラピストが見つかりません' };
  }
  return { ok: true, availableUntil };
}
