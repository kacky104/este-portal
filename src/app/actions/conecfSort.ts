'use server';

// ★ 第1557便（2026-10-18・カッキーさん・ラビリンス様の依頼）: コネックエフのセラピストの並び順を、駅ちか・エステ魂へ送る受け口。
// ★ 並びは conecf_girl_order（コネックエフのセラピスト一覧と同じ並べ方）。サイトの番号は therapist_media_ids（枠ごと）。
// ★ 送るのは中継の流れ（intent='sort_push'・lib/mediaSortFlow.ts）。いま更新を送る枠（ログイン情報が有効・「反映しない」でない）だけ。
// ★ 書けるのは「コネックエフに切り替え済み」で止めていない自店だけ（他の受け口と同じ守り）。
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { conecfPushSlots, pushSlotLabel } from '@/lib/conecfSitePush';
import { sortTherapistsByManual } from '@/lib/therapistOrder';
import { readConecfGirlOrder } from '@/app/lib/conecf/girlOrder';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const SITES = [{ provider: 'ekichika', name: '駅ちか' }, { provider: 'esutama', name: 'エステ魂' }] as const;

/** 駅ちか・エステ魂へ、いまのコネックエフの並び順を送る */
export async function sendConecfGirlOrderToSites(): Promise<Result<{ queued: string[]; skipped: string[] }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at, crm_until'), user.id, actingId).limit(1).maybeSingle();
  if (!salon) return { ok: false, error: '店舗情報が見つかりません' };
  if (!salon.conecf_enabled_at) return { ok: false, error: '送るには、ホームで「コネックエフに切り替える」を押してください' };
  if (isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) {
    return { ok: false, error: CONECF_STOPPED_MESSAGE };
  }
  const salonId = Number(salon.id);

  // ★ いまの並び（コネックエフのセラピスト一覧と同じ並べ方・公開中の方だけ）
  const { data: ths, error: thErr } = await svc.from('therapists').select('id, name, is_active').eq('salon_id', salonId);
  if (thErr) return { ok: false, error: 'セラピストを読み込めませんでした。時間をおいてお試しください' };
  const all = (ths ?? []).map((t) => ({ id: Number(t.id), name: (t.name as string | null) ?? '', hidden: t.is_active === false }));
  const order = await readConecfGirlOrder(svc, salonId);
  const sorted = sortTherapistsByManual(all, (t) => t.id, (t) => t.name, (t) => t.hidden, order).filter((t) => !t.hidden).map((t) => t.id);
  if (sorted.length === 0) return { ok: false, error: '公開中のセラピストがいません' };

  const { data: links, error: lErr } = await svc.from('therapist_media_ids')
    .select('therapist_id, provider, slot, external_cast_id')
    .in('therapist_id', sorted).in('provider', SITES.map((s) => s.provider));
  if (lErr) return { ok: false, error: 'サイトとの結び付きを読み込めませんでした。時間をおいてお試しください' };

  const queued: string[] = [];
  const skipped: string[] = [];
  for (const site of SITES) {
    const [c, s] = await Promise.all([
      svc.from('salon_media_credentials').select('slot, is_enabled').eq('salon_id', salonId).eq('provider', site.provider),
      svc.from('salon_import_sources').select('slot, link_mode').eq('salon_id', salonId).eq('provider', site.provider),
    ]);
    if (c.error || s.error) { skipped.push(site.name + '（設定を読めませんでした）'); continue; }
    for (const slot of conecfPushSlots(c.data ?? [], s.data ?? [])) {
      const label = pushSlotLabel(site.name, slot);
      const idOf = new Map<number, string>();
      for (const l of links ?? []) {
        if (String(l.provider) === site.provider && Number(l.slot ?? 1) === slot && l.external_cast_id) idOf.set(Number(l.therapist_id), String(l.external_cast_id));
      }
      const want = sorted.map((id) => idOf.get(id)).filter((x): x is string => !!x && /^\d{1,12}$/.test(x));
      if (want.length === 0) { skipped.push(label + '（結び付いている方がいません）'); continue; }
      try {
        const f = await startRelayFlow({
          salonId, provider: site.provider, slot,
          intent: 'sort_push', actor: 'shop:' + user.id,
          sort: { want },
          whenBusy: 'wait',
        });
        if (f.ok) queued.push(label); else skipped.push(label + '（' + f.note + '）');
      } catch (e) {
        console.error('[conecf] 並び順を送り始められなかった', site.provider, slot, (e as Error).message);
        skipped.push(label + '（始められませんでした）');
      }
    }
  }
  if (queued.length === 0 && skipped.length === 0) return { ok: false, error: '並び順を送れるサイトがありません（駅ちか・エステ魂のログイン情報をご確認ください）' };
  return { ok: true, data: { queued, skipped } };
}
