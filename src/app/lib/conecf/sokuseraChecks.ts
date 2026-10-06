import type { SupabaseClient } from '@supabase/supabase-js';
import { SOKUSERA_CHECK_HOLD_MIN } from '@/lib/esutamaSokuseraTargets';

// ★★ 即セラ「見に行って打たなかった」方の記録（第1246便・2026-10-06・カッキーさん）。
//   表: conecf_sokusera_checks（追加SQL_第1246便）。店舗×媒体×枠×セラピストで1行（上書き）。
//   ★ 読めない（表が無い＝SQL 未適用）ときは空＝今までどおり見に行く。書けないときは console.error だけ。
//   ★ 決めごと（55分）は src/lib/esutamaSokuseraTargets.ts。ここは DB を読み書きするだけ。

type Svc = SupabaseClient;

/** 直近（55分＋5分）に「見に行って打たなかった」方の時刻。therapistId → ISO */
export async function loadSokuseraChecks(
  svc: Svc, params: { salonId: number; provider: string; slot: number; now?: Date },
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const now = params.now ?? new Date();
  const since = new Date(now.getTime() - (SOKUSERA_CHECK_HOLD_MIN + 5) * 60000).toISOString();
  const { data, error } = await svc
    .from('conecf_sokusera_checks')
    .select('therapist_id, checked_at')
    .eq('salon_id', params.salonId).eq('provider', params.provider).eq('slot', params.slot)
    .gte('checked_at', since);
  if (error) {
    console.error('[sokusera] 確かめた記録を読めなかった（SQL 未適用?）。今までどおり見に行く:', error.message);
    return out;
  }
  for (const r of (data ?? []) as Array<{ therapist_id: number; checked_at: string }>) {
    out.set(Number(r.therapist_id), String(r.checked_at));
  }
  return out;
}

/** 「見に行って打たなかった」を記録する（上書き）。★ 失敗しても流れは止めない */
export async function recordSokuseraChecks(
  svc: Svc,
  params: { salonId: number; provider: string; slot: number },
  rows: ReadonlyArray<{ therapistId: number; castId: string | null; reason: string }>,
): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await svc.from('conecf_sokusera_checks').upsert(
    rows.map((r) => ({
      salon_id: params.salonId, provider: params.provider, slot: params.slot,
      therapist_id: r.therapistId, cast_id: r.castId, checked_at: now, reason: r.reason.slice(0, 60),
    })),
    { onConflict: 'salon_id,provider,slot,therapist_id' },
  );
  if (error) console.error('[sokusera] 確かめた記録を書けなかった（SQL 未適用?）:', params.salonId, error.message);
}
