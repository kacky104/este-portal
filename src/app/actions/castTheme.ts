'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { CAST_THEME_VALUES } from '@/app/cast/castThemes';

// セラピスト本人の /cast 着せ替えテーマ（therapists.cast_theme）を更新するサーバー専用処理。
// therapists には「本人（user_id = auth.uid()）の UPDATE」を許す RLS が無いため、
// service_role で更新しつつ、ここで本人性を検証する（既存 castInvite.ts と同じ流儀）。
// 安全装置：
//  - ログイン中ユーザーの user_id に一致する行のみ更新（.eq('user_id', user.id)）。
//  - 更新列は cast_theme のみ（他の列には一切触れない）。
//  - 値は許可リスト検証。'default'/'' は null（デフォルト）として保存。

export async function setCastTheme(theme: string): Promise<{ ok: boolean; error?: string }> {
  // 'default' / 空 はデフォルト（null）扱い。それ以外は許可リストに含まれる必要がある。
  const value = theme === 'default' || theme === '' ? null : theme;
  if (value !== null && !CAST_THEME_VALUES.includes(value)) {
    return { ok: false, error: '不正なテーマです' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: updated, error } = await svc
    .from('therapists')
    .update({ cast_theme: value })
    .eq('user_id', user.id)
    .select('id');
  if (error) return { ok: false, error: `テーマの保存に失敗しました: ${error.message}` };
  if (!updated || updated.length === 0) {
    return { ok: false, error: '対象のセラピストが見つかりません' };
  }
  return { ok: true };
}
