'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';

// ★ 第898便: 管理画面に「今日のメール送信 N/100通」を出す（運営だけ）。

export async function getEmailSendToday(): Promise<{ ok: true; day: string; sent: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  const day = getCalendarDateJST();
  const svc = createServiceClient();
  const { data, error } = await svc.from('email_send_daily').select('sent').eq('day', day).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, day, sent: Number((data as { sent?: number } | null)?.sent ?? 0) };
}
