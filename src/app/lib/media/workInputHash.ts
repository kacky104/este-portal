import type { SupabaseClient } from '@supabase/supabase-js';
import { businessDateJSTFrom } from '@/lib/dutyStatus';
import { loadCastIds } from '@/lib/mediaCastIds';
import { loadConecfOff } from '@/app/lib/conecf/targets';
import { workInputFingerprint, type WorkInputShift, type WorkInputTherapist } from '@/lib/workInputHash';

// ★★ 出勤の自動反映の「フクエス側の材料の指紋」を DB から集める（第1245便）。★ 決めごとは src/lib/workInputHash.ts。
//   ★ 読む材料は planWork（駅ちか・7日）と planEsutamaWork（エステ魂・14日）の【和集合】: 在籍は公開／非公開を問わず全員、窓は14日。
//     ★ 片方の計画にしか効かない変化でも指紋は変わる＝余計に行くことはあっても、行くべきときに行かないことは無い。
//   ★ 読めなかったときは null＝呼ぶ側は「今までどおり行く」（★ 読み取りの不調で送信を止めない）。

const WINDOW_DAYS = 14;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function loadWorkInputHash(
  svc: SupabaseClient,
  params: { salonId: number; provider: string; slot: number; nowMs?: number },
): Promise<string | null> {
  const todayISO = businessDateJSTFrom(params.nowMs ?? Date.now());
  const { data: ths, error: thErr } = await svc
    .from('therapists').select('id, is_active, import_cast_id').eq('salon_id', params.salonId);
  if (thErr) { console.error('[auto-push] 指紋: therapists を読めなかった', thErr.message); return null; }
  const rows = (ths ?? []) as Array<{ id: number; is_active: boolean | null; import_cast_id?: string | null }>;

  const { maps, error: castErr } = await loadCastIds(svc, { therapists: rows, provider: params.provider, slot: params.slot });
  if (castErr) { console.error('[auto-push] 指紋: 名簿の結びを読めなかった', castErr); return null; }
  const off = await loadConecfOff(svc, params.salonId, params.provider, params.slot);
  if (off.error) { console.error('[auto-push] 指紋: 送り先サイトを読めなかった', off.error); return null; }

  const ids = rows.map((t) => Number(t.id));
  let shifts: WorkInputShift[] = [];
  if (ids.length > 0) {
    const { data: sched, error: schErr } = await svc
      .from('therapist_schedules')
      .select('therapist_id, schedule_date, is_active, start_time, end_time')
      .in('therapist_id', ids)
      .gte('schedule_date', todayISO)
      .lte('schedule_date', addDays(todayISO, WINDOW_DAYS - 1));
    if (schErr) { console.error('[auto-push] 指紋: 出勤を読めなかった', schErr.message); return null; }
    shifts = ((sched ?? []) as Array<Record<string, unknown>>).map((r) => ({
      therapistId: Number(r['therapist_id']),
      dateISO: String(r['schedule_date']),
      active: r['is_active'] === true,
      start: typeof r['start_time'] === 'string' ? r['start_time'].slice(0, 5) : null,
      end: typeof r['end_time'] === 'string' ? r['end_time'].slice(0, 5) : null,
    }));
  }
  const therapists: WorkInputTherapist[] = rows.map((t) => ({
    id: Number(t.id),
    active: t.is_active === true,
    castId: maps.castIdOf.get(Number(t.id)) ?? null,
    off: off.off.has(Number(t.id)),
  }));
  return workInputFingerprint({ todayISO, therapists, shifts });
}

/**
 * 「この指紋の材料は相手サイトと同期できた」と記録する（salon_import_sources.auto_synced_hash / auto_synced_at）。
 * ★ 列が無い（SQL 未適用）・書けないときは console.error だけ＝次の周は今までどおり行く。
 */
export async function markWorkSynced(
  svc: SupabaseClient, params: { salonId: number; provider: string; slot: number; hash: string },
): Promise<void> {
  const { error } = await svc
    .from('salon_import_sources')
    .update({ auto_synced_hash: params.hash, auto_synced_at: new Date().toISOString() })
    .eq('salon_id', params.salonId).eq('provider', params.provider).eq('slot', params.slot);
  if (error) console.error('[auto-push] 同期済みの印を書けなかった（SQL 未適用?）', params.salonId, params.provider, error.message);
}
