// シフト希望管理表の「新しい希望」の数と「最後に見た時刻」（第1740便・2026-11-04・カッキーさん「お店ごと」）。★ サーバー専用。
// ★ shift_settings.board_seen_at（supabase/migrations/20261104_shift_board_seen.sql）。列が無い・読めないときは 0／null（画面は止めない）。
// ★ 数えるのは status='requested'・今日以降の日・submitted_at が board_seen_at より後（一度も開いていない店は、今日以降の希望ぜんぶ）。
import type { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateJST } from '@/lib/dutyStatus';

type Svc = ReturnType<typeof createServiceClient>;

export async function readShiftBoardSeen(svc: Svc, salonId: number): Promise<{ ok: boolean; seenAt: string | null }> {
  try {
    const { data, error } = await svc.from('shift_settings').select('board_seen_at').eq('salon_id', salonId).maybeSingle();
    if (error) return { ok: false, seenAt: null };
    return { ok: true, seenAt: (data as { board_seen_at?: string | null } | null)?.board_seen_at ?? null };
  } catch {
    return { ok: false, seenAt: null };
  }
}

/** 表を開いたとき「見た」を今に進める（失敗しても止めない） */
export async function markShiftBoardSeen(svc: Svc, salonId: number): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data } = await svc.from('shift_settings').select('salon_id').eq('salon_id', salonId).maybeSingle();
    if (data) await svc.from('shift_settings').update({ board_seen_at: now }).eq('salon_id', salonId);
    else await svc.from('shift_settings').insert({ salon_id: salonId, board_seen_at: now });
  } catch { /* バッジが消えないだけ */ }
}

export async function countShiftNew(svc: Svc, salonId: number): Promise<number> {
  try {
    const seen = await readShiftBoardSeen(svc, salonId);
    if (!seen.ok) return 0;
    let q = svc.from('shift_requests').select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId).eq('status', 'requested').gte('work_date', getBusinessDateJST());
    if (seen.seenAt) q = q.gt('submitted_at', seen.seenAt);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}
