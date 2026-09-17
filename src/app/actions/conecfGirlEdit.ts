'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { buildGirlEditValues } from '@/app/lib/media/girlEditPlan';

// コネックエフ「女性の編集」→「駅ちかへ反映」（第418便・2026-09-17）。
// ★ 流れ: ①確かめる（試し打ち＝駅ちかの編集ページを読むだけ）→ ②結果「◯欄が変わります」を見る → ③送る（読み直して照合）
// ★ 中継は1分ごとに取りに来るので、結果は salon_media_audit を flowId で見に行く（画面が数秒おきに聞く）。
// ★ 書くのは「切り替え済み」の自店だけ。★ 決めごと（空の欄は触らない等）は src/lib/ekichikaGirlEdit.ts。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc.from('salons').select('id, conecf_enabled_at')
    .eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (!salon.conecf_enabled_at) return { ok: false as const, error: '反映するには、ホームで「コネックエフに切り替える」を押してください' };
  return { ok: true as const, svc, salonId: Number(salon.id), userId: user.id };
}

export async function startConecfEkichikaEdit(input: { id: number; apply: boolean }): Promise<Result<{ flowId: string }>> {
  const r = await resolve();
  if (!r.ok) return r;
  const therapistId = Number(input.id);
  if (!Number.isFinite(therapistId) || therapistId <= 0) return { ok: false, error: '女性の指定が不正です' };
  const built = await buildGirlEditValues(r.svc, { salonId: r.salonId, therapistId, slot: 1 });
  if (!built.ok) return { ok: false, error: built.error };
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'ekichika', slot: 1,
      intent: 'girl_edit',
      actor: 'shop:' + r.userId,
      girlEdit: { castId: built.data.castId, name: built.data.name, values: built.data.values, apply: input.apply === true },
    });
    if (!f.ok) return { ok: false, error: f.reason === 'busy' ? 'いま駅ちかで別の更新が動いています。少し待ってからお試しください' : f.note };
    return { ok: true, data: { flowId: f.flowId } };
  } catch (e) {
    console.error('[conecf] 駅ちかへの反映を始められなかった', (e as Error).message);
    return { ok: false, error: '反映を開始できませんでした。時間をおいてお試しください' };
  }
}

export type EkichikaEditStatus =
  | { state: 'waiting' }
  | { state: 'done'; outcome: string; summary: string; dryRun: boolean; changes: number; labels: string; skipped: string };

export async function getConecfEkichikaEditStatus(input: { flowId: string }): Promise<Result<EkichikaEditStatus>> {
  const r = await resolve();
  if (!r.ok) return r;
  const flowId = String(input.flowId ?? '');
  if (!/^[0-9a-f-]{8,64}$/i.test(flowId)) return { ok: false, error: '指定が不正です' };
  const { data, error } = await r.svc
    .from('salon_media_audit')
    .select('event, outcome, summary, detail, created_at')
    .eq('salon_id', r.salonId)
    .eq('provider', 'ekichika')
    .filter('detail->>flowId', 'eq', flowId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Array<{ event: string; outcome: string; summary: string | null; detail: Record<string, unknown> | null }>;
  // ★ 最後の記録: edit_girl（本体）か、ログイン等で止まったもの
  const hit = rows.find((x) => x.event === 'edit_girl')
    ?? rows.find((x) => x.outcome === 'failed' || x.outcome === 'stopped');
  if (!hit) return { ok: true, data: { state: 'waiting' } };
  const d = hit.detail ?? {};
  return {
    ok: true,
    data: {
      state: 'done',
      outcome: hit.outcome,
      summary: hit.summary ?? '',
      dryRun: d.dryRun === true,
      changes: Number(d.changes ?? 0),
      labels: typeof d.labels === 'string' ? d.labels : '',
      skipped: typeof d.skippedLabels === 'string' ? d.skippedLabels : '',
    },
  };
}

/** ★ 1回のまとめて更新で回す上限（★ 1人1〜2分。★ 50人で約1時間） */
const BULK_MAX = 50;

/**
 * ★★ 第420便: 駅ちかへまとめて更新。★ 1回のログインで、選んだ人を順に更新する。
 *   ★ 送れない人（駅ちかと未連携・送り先で送らない 等）は外して、名前と理由を返す。
 *   ★ 結果は1人ずつ「更新結果」に出る。
 */
export async function startConecfEkichikaBulkEdit(input: { ids: number[] }): Promise<Result<{ queued: number; skipped: Array<{ name: string; reason: string }> }>> {
  const r = await resolve();
  if (!r.ok) return r;
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(Number).filter((x) => Number.isFinite(x) && x > 0))];
  if (ids.length === 0) return { ok: false, error: '女性を選んでください' };
  if (ids.length > BULK_MAX) return { ok: false, error: `一度に更新できるのは${BULK_MAX}名までです` };
  const { data: names } = await r.svc.from('therapists').select('id, name').eq('salon_id', r.salonId).in('id', ids);
  const nameOf = new Map((names ?? []).map((t) => [Number(t.id), String(t.name ?? '')]));
  const items: Array<{ castId: string; name: string; values: import('@/lib/ekichikaGirlEdit').EkichikaGirlEditValues }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  for (const id of ids) {
    const b = await buildGirlEditValues(r.svc, { salonId: r.salonId, therapistId: id, slot: 1 });
    if (b.ok) items.push(b.data);
    else skipped.push({ name: nameOf.get(id) || '#' + id, reason: b.error });
  }
  if (items.length === 0) return { ok: true, data: { queued: 0, skipped } };
  const [first, ...rest] = items;
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'ekichika', slot: 1,
      intent: 'girl_edit',
      actor: 'shop:' + r.userId,
      girlEdit: { castId: first.castId, name: first.name, values: first.values, apply: true, queue: rest },
    });
    if (!f.ok) return { ok: false, error: f.reason === 'busy' ? 'いま駅ちかで別の更新が動いています。少し待ってからお試しください' : f.note };
    return { ok: true, data: { queued: items.length, skipped } };
  } catch (e) {
    console.error('[conecf] まとめて更新を始められなかった', (e as Error).message);
    return { ok: false, error: '更新を開始できませんでした。時間をおいてお試しください' };
  }
}
