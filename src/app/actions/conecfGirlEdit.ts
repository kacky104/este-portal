'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { buildGirlEditValues, buildCastEditValues, buildEsutamaEditPhotos, planPhotoRemovalSlots, imagesOf } from '@/app/lib/media/girlEditPlan';
import type { PhotoSyncOp } from '@/lib/ekichikaPhoto';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { providerLabel } from '@/lib/mediaAudit';
import { targetOffMessage } from '@/lib/conecfTargets';
import { conecfPushSlots, pushSlotLabel, sitePushNotReadyMessage, summarizeSlotPushes, type SlotPush } from '@/lib/conecfSitePush';
import { waitToastNote } from '@/lib/relayWait';

/** ★★ 第428便: 「消さずに更新」のときは消す手を外す（★ 既定は外す＝押す前に確認していない呼び出しでは消さない） */
function keepRemoves(photos: PhotoSyncOp[], allowRemove: boolean | undefined): PhotoSyncOp[] {
  return allowRemove === true ? photos : photos.filter((p) => p.action !== 'remove');
}

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
  const { data: salon } = await svc.from('salons').select('id, conecf_enabled_at, crm_until')
    .eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (!salon.conecf_enabled_at) return { ok: false as const, error: '反映するには、ホームで「コネックエフに切り替える」を押してください' };
  // ★ 第1243便: セット（コネックエフ＋フクエスCRM）を OFF にした店は、保存・取り込みを止める（見るのはできる）
  if (isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  return { ok: true as const, svc, salonId: Number(salon.id), userId: user.id };
}

// ★★★ 第1289便（2026-10-07）: 更新は【枠1固定】だった → いま更新を送る枠すべてへ（lib/conecfSitePush.ts）。
//   ★ 2枠ある店で、枠2の内容を保存して「保存して更新」を押しても、枠2へは送られていなかった。
//   ★ 枠ごとに、連携（castId）・送り先サイト・写真の送った記録を見る（★ どれも枠ごとの表）。枠ごとに別の流れを積む。
//   ★ 2026-10-07 の時点で枠2を登録している店は無い＝今日の動きは変わらない。

/** ★ 1人の更新の結果。off＝その店はそのサイトへ送っていない／この方は「送り先サイト」で送らない設定（＝失敗ではない） */
export type ConecfPushResult =
  // ★ 第1296便: waiting … 受け付けた枠のうち、前の更新が動いていて順番待ちの枠（★ 無ければ項目ごと無い）
  | { ok: true; data: { flowId: string; queued: string[]; notes: string[]; waiting?: string[] } }
  | { ok: false; error: string; off?: boolean };

type Svc = ReturnType<typeof createServiceClient>;

/** ★ いま更新を送る枠（ログイン情報が有効・「反映しない」でない）。★ 読めなければ断る（「枠が無い」と決めつけない） */
async function pushSlotsOf(svc: Svc, salonId: number, provider: string): Promise<{ ok: true; slots: number[] } | { ok: false; error: string }> {
  const [c, s] = await Promise.all([
    svc.from('salon_media_credentials').select('slot, is_enabled').eq('salon_id', salonId).eq('provider', provider),
    svc.from('salon_import_sources').select('slot, link_mode').eq('salon_id', salonId).eq('provider', provider),
  ]);
  if (c.error || s.error) return { ok: false, error: 'サイトの設定を読めませんでした。時間をおいてお試しください' };
  return { ok: true, slots: conecfPushSlots(c.data ?? [], s.data ?? []) };
}

/** ★ 断られた理由が「送り先サイトで送らない設定」か（conecfTargetBlock の文と同じ形） */
function isTargetOff(error: string, site: string, slot: number): boolean {
  return error === targetOffMessage(pushSlotLabel(site, slot));
}

// ★ 第1296便: 更新（apply）は、前の更新が動いていても順番待ちで受け付ける（startRelayFlow の whenBusy: 'wait'）。
//   この文が出るのは、順番待ちが3件たまっているとき・確かめるだけ（試し打ち）のとき・SQL が未適用のとき。
const BUSY_NOTE = (site: string) => `いま${site}で別の更新が動いています。少し待ってからお試しください`;

export async function startConecfEkichikaEdit(input: { id: number; apply: boolean; allowRemove?: boolean }): Promise<ConecfPushResult> {
  const r = await resolve();
  if (!r.ok) return r;
  const therapistId = Number(input.id);
  if (!Number.isFinite(therapistId) || therapistId <= 0) return { ok: false, error: '女性の指定が不正です' };
  const site = providerLabel('ekichika');
  const ps = await pushSlotsOf(r.svc, r.salonId, 'ekichika');
  if (!ps.ok) return ps;
  const results: SlotPush[] = [];
  let flowId = '';
  for (const slot of ps.slots) {
    const built = await buildGirlEditValues(r.svc, { salonId: r.salonId, therapistId, slot });
    if (!built.ok) { results.push({ slot, state: isTargetOff(built.error, site, slot) ? 'off' : 'failed', note: built.error }); continue; }
    try {
      const f = await startRelayFlow({
        salonId: r.salonId, provider: 'ekichika', slot,
        intent: 'girl_edit',
        actor: 'shop:' + r.userId,
        girlEdit: {
          castId: built.data.castId, name: built.data.name, values: built.data.values, apply: input.apply === true,
          therapistId: built.data.therapistId, photos: keepRemoves(built.data.photos, input.allowRemove), photoSkipped: built.data.photoSkipped,
        },
        // ★ 第1296便: 送るとき（apply）だけ順番待ちにする。確かめるだけ（試し打ち）は画面で結果を待つので、今までどおり断る
        ...(input.apply === true ? { whenBusy: 'wait' as const } : {}),
      });
      if (!f.ok) { results.push({ slot, state: 'failed', note: f.reason === 'busy' ? BUSY_NOTE(site) : f.note }); continue; }
      results.push({ slot, state: 'queued', ...(f.waiting === true ? { waiting: true } : {}) });
      if (!flowId) flowId = f.flowId;
    } catch (e) {
      console.error('[conecf] 駅ちかへの反映を始められなかった', slot, (e as Error).message);
      results.push({ slot, state: 'failed', note: '反映を開始できませんでした。時間をおいてお試しください' });
    }
  }
  const sum = summarizeSlotPushes(site, results);
  if (!sum.ok) return { ok: false, error: sum.error, off: sum.off };
  return { ok: true, data: { flowId, queued: sum.queued, notes: sum.notes, ...(sum.waiting ? { waiting: sum.waiting } : {}) } };
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

type BulkResult = Result<{ queued: number; skipped: Array<{ name: string; reason: string }>; notes?: string[] }>;

/**
 * ★★ 第420便: 駅ちかへまとめて更新。★ 1回のログインで、選んだ人を順に更新する。
 *   ★ 送れない人（駅ちかと未連携・送り先で送らない 等）は外して、名前と理由を返す。
 *   ★ 結果は1人ずつ「更新結果」に出る。
 *   ★ 第1289便: 枠ごとに1つの流れを積む（queued は、どれかの枠で受け付けた人数。notes は始められなかった枠）。
 */
export async function startConecfEkichikaBulkEdit(input: { ids: number[]; allowRemove?: boolean }): Promise<BulkResult> {
  const r = await resolve();
  if (!r.ok) return r;
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(Number).filter((x) => Number.isFinite(x) && x > 0))];
  if (ids.length === 0) return { ok: false, error: '女性を選んでください' };
  if (ids.length > BULK_MAX) return { ok: false, error: `一度に更新できるのは${BULK_MAX}名までです` };
  const site = providerLabel('ekichika');
  const ps = await pushSlotsOf(r.svc, r.salonId, 'ekichika');
  if (!ps.ok) return ps;
  if (ps.slots.length === 0) return { ok: false, error: sitePushNotReadyMessage(site) };
  const many = ps.slots.length > 1;
  const { data: names } = await r.svc.from('therapists').select('id, name').eq('salon_id', r.salonId).in('id', ids);
  const nameOf = new Map((names ?? []).map((t) => [Number(t.id), String(t.name ?? '')]));
  const skipped: Array<{ name: string; reason: string }> = [];
  const notes: string[] = [];
  const queuedIds = new Set<number>();
  for (const slot of ps.slots) {
    const items: Array<{ castId: string; name: string; values: import('@/lib/ekichikaGirlEdit').EkichikaGirlEditValues; therapistId: number; photos: import('@/lib/ekichikaPhoto').PhotoSyncOp[]; photoSkipped: string[] }> = [];
    for (const id of ids) {
      const b = await buildGirlEditValues(r.svc, { salonId: r.salonId, therapistId: id, slot });
      if (b.ok) items.push({ ...b.data, photos: keepRemoves(b.data.photos, input.allowRemove) });
      else skipped.push({ name: (nameOf.get(id) || '#' + id) + (slot > 1 ? `・枠${slot}` : ''), reason: b.error });
    }
    if (items.length === 0) continue;
    const [first, ...rest] = items;
    try {
      const f = await startRelayFlow({
        salonId: r.salonId, provider: 'ekichika', slot,
        intent: 'girl_edit',
        actor: 'shop:' + r.userId,
        girlEdit: {
          castId: first.castId, name: first.name, values: first.values, apply: true,
          therapistId: first.therapistId, photos: first.photos, photoSkipped: first.photoSkipped, queue: rest,
        },
        whenBusy: 'wait',   // ★ 第1296便: 前の更新が動いていても、順番待ちで受け付ける
      });
      if (!f.ok) { notes.push((many ? pushSlotLabel(site, slot) + '：' : '') + (f.reason === 'busy' ? BUSY_NOTE(site) : f.note)); continue; }
      for (const it of items) queuedIds.add(it.therapistId);
      // ★ 第1296便: 順番待ちで受け付けたことを、お知らせの下の注記に出す（受け付けた人数には数える）
      if (f.waiting === true) notes.push(waitToastNote([pushSlotLabel(site, slot)]));
    } catch (e) {
      console.error('[conecf] まとめて更新を始められなかった', slot, (e as Error).message);
      notes.push((many ? pushSlotLabel(site, slot) + '：' : '') + '更新を開始できませんでした。時間をおいてお試しください');
    }
  }
  if (queuedIds.size === 0 && notes.length > 0) return { ok: false, error: notes.join('　／　') };
  return { ok: true, data: { queued: queuedIds.size, skipped, ...(notes.length > 0 ? { notes } : {}) } };
}

/**
 * ★★ 第428便: 押す前の確認。「更新する」で駅ちかから写真が消える人と枠を返す（★ 通信なし・DB を読むだけ）。
 *   ★ 消える枠が無ければ空配列 → 画面はそのまま送る。
 *   ★ 第1289便: 更新を送る枠すべてを見る（枠2以降は名前に「（枠N）」を付ける）。
 */
export async function previewConecfEkichikaPhotoRemovals(input: { ids: number[] }): Promise<Result<Array<{ id: number; name: string; slots: number[] }>>> {
  const r = await resolve();
  if (!r.ok) return r;
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(Number).filter((x) => Number.isFinite(x) && x > 0))].slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: true, data: [] };
  const ps = await pushSlotsOf(r.svc, r.salonId, 'ekichika');
  if (!ps.ok) return ps;
  const { data: ths } = await r.svc.from('therapists').select('id, name, profile_image_url, profile_images').eq('salon_id', r.salonId).in('id', ids);
  const out: Array<{ id: number; name: string; slots: number[] }> = [];
  for (const slot of ps.slots) {
    for (const t of (ths ?? []) as Array<{ id: number; name: string | null; profile_image_url: string | null; profile_images: string[] | null }>) {
      const slots = await planPhotoRemovalSlots(r.svc, { therapistId: Number(t.id), slot, images: imagesOf(t) });
      if (slots.length > 0) out.push({ id: Number(t.id), name: String(t.name ?? '') + (slot > 1 ? `（枠${slot}）` : ''), slots });
    }
  }
  return { ok: true, data: out };
}

// ── ★★★ 第430便: エステ魂へのプロフィール更新 ──────────────────────
//   ★ 写真は送らない（★ エステ魂は枠を詰める・差し替え不可・削除は未実測。★ 写真は別の便）。
//   ★ apply=false は【確かめるだけ】（編集ページを読んで「何欄変わるか」を記録。1文字も送らない）。

export async function startConecfEsutamaEdit(input: { id: number; apply: boolean; allowRemove?: boolean }): Promise<ConecfPushResult> {
  const r = await resolve();
  if (!r.ok) return r;
  const therapistId = Number(input.id);
  if (!Number.isFinite(therapistId) || therapistId <= 0) return { ok: false, error: '女性の指定が不正です' };
  const site = providerLabel('esutama');
  const ps = await pushSlotsOf(r.svc, r.salonId, 'esutama');
  if (!ps.ok) return ps;
  const results: SlotPush[] = [];
  let flowId = '';
  for (const slot of ps.slots) {
    const built = await buildCastEditValues(r.svc, { salonId: r.salonId, therapistId, slot });
    if (!built.ok) { results.push({ slot, state: isTargetOff(built.error, site, slot) ? 'off' : 'failed', note: built.error }); continue; }
    try {
      const f = await startRelayFlow({
        salonId: r.salonId, provider: 'esutama', slot,
        intent: 'cast_edit',
        actor: 'shop:' + r.userId,
        castEdit: { castId: built.data.castId, name: built.data.name, values: built.data.values, apply: input.apply === true, therapistId: built.data.therapistId,
          photos: { ...built.data.photos, allowRemove: input.allowRemove === true } },
        // ★ 第1296便: 送るとき（apply）だけ順番待ちにする（駅ちかと同じ）
        ...(input.apply === true ? { whenBusy: 'wait' as const } : {}),
      });
      if (!f.ok) { results.push({ slot, state: 'failed', note: f.reason === 'busy' ? BUSY_NOTE(site) : f.note }); continue; }
      results.push({ slot, state: 'queued', ...(f.waiting === true ? { waiting: true } : {}) });
      if (!flowId) flowId = f.flowId;
    } catch (e) {
      console.error('[conecf] エステ魂への反映を始められなかった', slot, (e as Error).message);
      results.push({ slot, state: 'failed', note: '反映を開始できませんでした。時間をおいてお試しください' });
    }
  }
  const sum = summarizeSlotPushes(site, results);
  if (!sum.ok) return { ok: false, error: sum.error, off: sum.off };
  return { ok: true, data: { flowId, queued: sum.queued, notes: sum.notes, ...(sum.waiting ? { waiting: sum.waiting } : {}) } };
}

export async function startConecfEsutamaBulkEdit(input: { ids: number[]; allowRemove?: boolean }): Promise<BulkResult> {
  const r = await resolve();
  if (!r.ok) return r;
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(Number).filter((x) => Number.isFinite(x) && x > 0))];
  if (ids.length === 0) return { ok: false, error: '女性を選んでください' };
  if (ids.length > BULK_MAX) return { ok: false, error: `一度に更新できるのは${BULK_MAX}名までです` };
  const site = providerLabel('esutama');
  const ps = await pushSlotsOf(r.svc, r.salonId, 'esutama');
  if (!ps.ok) return ps;
  if (ps.slots.length === 0) return { ok: false, error: sitePushNotReadyMessage(site) };
  const many = ps.slots.length > 1;
  const { data: names } = await r.svc.from('therapists').select('id, name').eq('salon_id', r.salonId).in('id', ids);
  const nameOf = new Map((names ?? []).map((t) => [Number(t.id), String(t.name ?? '')]));
  const skipped: Array<{ name: string; reason: string }> = [];
  const notes: string[] = [];
  const queuedIds = new Set<number>();
  for (const slot of ps.slots) {
    const items: Array<{ castId: string; name: string; values: import('@/lib/esutamaCastEdit').EsutamaCastEditValues; therapistId: number; photos: import('@/lib/relayFlow').EsutamaEditPhotos }> = [];
    for (const id of ids) {
      const b = await buildCastEditValues(r.svc, { salonId: r.salonId, therapistId: id, slot });
      if (b.ok) items.push({ castId: b.data.castId, name: b.data.name, values: b.data.values, therapistId: b.data.therapistId, photos: { ...b.data.photos, allowRemove: input.allowRemove === true } });
      else skipped.push({ name: (nameOf.get(id) || '#' + id) + (slot > 1 ? `・枠${slot}` : ''), reason: b.error });
    }
    if (items.length === 0) continue;
    const [first, ...rest] = items;
    try {
      const f = await startRelayFlow({
        salonId: r.salonId, provider: 'esutama', slot,
        intent: 'cast_edit',
        actor: 'shop:' + r.userId,
        castEdit: { castId: first.castId, name: first.name, values: first.values, apply: true, therapistId: first.therapistId, photos: first.photos, queue: rest },
        whenBusy: 'wait',   // ★ 第1296便: 前の更新が動いていても、順番待ちで受け付ける
      });
      if (!f.ok) { notes.push((many ? pushSlotLabel(site, slot) + '：' : '') + (f.reason === 'busy' ? BUSY_NOTE(site) : f.note)); continue; }
      for (const it of items) queuedIds.add(it.therapistId);
      // ★ 第1296便: 順番待ちで受け付けたことを、お知らせの下の注記に出す（受け付けた人数には数える）
      if (f.waiting === true) notes.push(waitToastNote([pushSlotLabel(site, slot)]));
    } catch (e) {
      console.error('[conecf] エステ魂へのまとめて更新を始められなかった', slot, (e as Error).message);
      notes.push((many ? pushSlotLabel(site, slot) + '：' : '') + '更新を開始できませんでした。時間をおいてお試しください');
    }
  }
  if (queuedIds.size === 0 && notes.length > 0) return { ok: false, error: notes.join('　／　') };
  return { ok: true, data: { queued: queuedIds.size, skipped, ...(notes.length > 0 ? { notes } : {}) } };
}

/** ★★ 第434便: 押す前の確認。「エステ魂へ更新」でエステ魂から消える写真（★ 送った記録があり、コネックエフに無い写真）。★ 第1289便: 送る枠すべて */
export async function previewConecfEsutamaPhotoRemovals(input: { ids: number[] }): Promise<Result<Array<{ id: number; name: string; slots: number[] }>>> {
  const r = await resolve();
  if (!r.ok) return r;
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(Number).filter((x) => Number.isFinite(x) && x > 0))].slice(0, BULK_MAX);
  if (ids.length === 0) return { ok: true, data: [] };
  const ps = await pushSlotsOf(r.svc, r.salonId, 'esutama');
  if (!ps.ok) return ps;
  const { data: ths } = await r.svc.from('therapists').select('id, name, profile_image_url, profile_images').eq('salon_id', r.salonId).in('id', ids);
  const out: Array<{ id: number; name: string; slots: number[] }> = [];
  for (const slot of ps.slots) {
    for (const t of (ths ?? []) as Array<{ id: number; name: string | null; profile_image_url: string | null; profile_images: string[] | null }>) {
      const { removals } = await buildEsutamaEditPhotos(r.svc, { therapistId: Number(t.id), slot, images: imagesOf(t) });
      if (removals.length > 0) out.push({ id: Number(t.id), name: String(t.name ?? '') + (slot > 1 ? `（枠${slot}）` : ''), slots: removals });
    }
  }
  return { ok: true, data: out };
}
