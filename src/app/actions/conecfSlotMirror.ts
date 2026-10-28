'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { readSlotMirrorStuck, type SlotMirrorStuck } from '@/app/lib/media/slotMirror';

// コネックエフ ホームの帯「枠2以降に自動で登録できていない方」（第1698便・A-3・2026-10-28・カッキーさんの決定）。読むだけ。
// ★ 決めごとは src/lib/slotMirrorGiveUp.ts、読み方は src/app/lib/media/slotMirror.ts の readSlotMirrorStuck。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getConecfSlotMirrorStuck(): Promise<Result<{ salonId: number; people: SlotMirrorStuck[] }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  // ★ 運営が店を選んでいるときは、その店（lib/conecf/actingSalon.ts）。店舗様は自分の店
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at'), user.id, actingId)
    .limit(1).maybeSingle();
  if (!salon) return { ok: false, error: '店舗情報が見つかりません' };
  if (!salon.conecf_enabled_at) return { ok: true, data: { salonId: Number(salon.id), people: [] } };
  return { ok: true, data: { salonId: Number(salon.id), people: await readSlotMirrorStuck(svc, Number(salon.id)) } };
}
