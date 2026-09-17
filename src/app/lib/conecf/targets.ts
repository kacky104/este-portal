import type { SupabaseClient } from '@supabase/supabase-js';
import { offSetFrom, targetOffMessage, type TargetRow } from '@/lib/conecfTargets';
import { providerLabel } from '@/lib/mediaAudit';

// コネックエフ「送り先サイト」を送信の前に読む（第408便）。★ 決めごとは src/lib/conecfTargets.ts。
// ★ 切り替え前の店（conecf_enabled_at が空）は、いつも空の集合＝全員送る（★ フクエスリンクは変わらない）。
// ★ 読めなかったときは黙って「全員送る」にしない → error を返して、呼ぶ側が止める。

type Svc = SupabaseClient;

export async function loadConecfOff(
  svc: Svc, salonId: number, provider: string, slot: number,
): Promise<{ off: Set<number>; error: string | null }> {
  const { data: salon, error: sErr } = await svc.from('salons').select('conecf_enabled_at').eq('id', salonId).maybeSingle();
  if (sErr) return { off: new Set(), error: sErr.message };
  if (!salon?.conecf_enabled_at) return { off: new Set(), error: null };
  const { data: ths, error: tErr } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  if (tErr) return { off: new Set(), error: tErr.message };
  const ids = (ths ?? []).map((t) => Number(t.id));
  if (ids.length === 0) return { off: new Set(), error: null };
  const { data, error } = await svc
    .from('conecf_therapist_targets')
    .select('therapist_id, provider, slot, enabled')
    .in('therapist_id', ids).eq('provider', provider).eq('slot', slot).eq('enabled', false);
  if (error) return { off: new Set(), error: error.message };
  return { off: offSetFrom((data ?? []) as TargetRow[], provider, slot), error: null };
}

/** 1人ぶん（写真・新規登録）。★ 送らない設定なら断る文、送ってよいなら null */
export async function conecfTargetBlock(
  svc: Svc, input: { salonId: number; therapistId: number; provider: string; slot: number },
): Promise<string | null> {
  const { off, error } = await loadConecfOff(svc, input.salonId, input.provider, input.slot);
  if (error) return `送り先サイトの設定を読めなかったため送りませんでした（${error}）`;
  if (!off.has(input.therapistId)) return null;
  const label = providerLabel(input.provider) + (input.slot > 1 ? `（枠${input.slot}）` : '');
  return targetOffMessage(label);
}
