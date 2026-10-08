'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { isValidBumpSetting, bumpSlotsPerDay } from '@/lib/ekichikaBump';

// コネックエフ「駅ちか上位表示」の受け口（第1305便・2026-10-08）。
// ★ 駅ちかの管理画面トップの「上位表示する」を、自動（時間帯・間隔）と今すぐの2通りで押す。押すのは中継の流れ（bump_auto / bump_push）。
// ★ 書き込み（設定の保存・今すぐ押す）は「コネックエフに切り替え済み」でセットを契約している自店だけ（第1243便の守り）。
// ★ 設定と状態は salon_import_sources の bump_*（provider='ekichika'・枠ごと）。追加SQL_第1305便。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc
    .from('salons').select('id, conecf_enabled_at, crm_until')
    .eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) return { ok: false as const, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  if (write && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) {
    return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  }
  return { ok: true as const, svc, salonId: Number(salon.id), userId: user.id };
}

export type ConecfBumpSlot = {
  slot: number;
  /** 駅ちかのログイン情報が登録されていて、止めていない */
  hasCredential: boolean;
  /** 向きが「反映しない」 */
  linkOff: boolean;
  enabled: boolean;
  startMin: number;
  endMin: number;
  intervalMin: number;
  /** 駅ちかの最終更新日（＝最後に上位表示された時刻・手で押した分も入る） */
  lastAt: string | null;
  remaining: number | null;
  quota: number | null;
  readAt: string | null;
};

/** ready=false … 列がまだ無い（追加SQL_第1305便が未適用）。画面は「準備中」を出す */
export async function getConecfBump(): Promise<Result<{ salonId: number; ready: boolean; slots: ConecfBumpSlot[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { svc, salonId } = r;
  const [src, cred] = await Promise.all([
    svc.from('salon_import_sources')
      .select('slot, link_mode, bump_auto, bump_start_min, bump_end_min, bump_interval_min, bump_last_at, bump_remaining, bump_quota, bump_read_at')
      .eq('salon_id', salonId).eq('provider', 'ekichika').order('slot', { ascending: true }),
    svc.from('salon_media_credentials').select('slot, is_enabled').eq('salon_id', salonId).eq('provider', 'ekichika'),
  ]);
  if (src.error) {
    if (/bump_/.test(src.error.message ?? '')) return { ok: true, data: { salonId, ready: false, slots: [] } };
    return { ok: false, error: '設定を読み込めませんでした。時間をおいてお試しください' };
  }
  const credOn = new Map((cred.data ?? []).map((c) => [Number(c.slot ?? 1), c.is_enabled === true]));
  const slots: ConecfBumpSlot[] = (src.data ?? []).map((x) => {
    const slot = Number(x.slot ?? 1);
    return {
      slot,
      hasCredential: credOn.get(slot) === true,
      linkOff: String(x.link_mode ?? '') === 'none',
      enabled: x.bump_auto === true,
      startMin: Number(x.bump_start_min ?? 600),
      endMin: Number(x.bump_end_min ?? 1380),
      intervalMin: Number(x.bump_interval_min ?? 20),
      lastAt: (x.bump_last_at as string | null) ?? null,
      remaining: x.bump_remaining == null ? null : Number(x.bump_remaining),
      quota: x.bump_quota == null ? null : Number(x.bump_quota),
      readAt: (x.bump_read_at as string | null) ?? null,
    };
  });
  return { ok: true, data: { salonId, ready: true, slots } };
}

/** 自動の設定を保存する */
export async function saveConecfBump(input: { slot: number; enabled: boolean; startMin: number; endMin: number; intervalMin: number }): Promise<Result<{ perDay: number }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!Number.isInteger(slot) || slot < 1) return { ok: false, error: '枠の指定が不正です' };
  const setting = { enabled: input.enabled === true, startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin) };
  if (!isValidBumpSetting(setting)) return { ok: false, error: '時間帯か間隔の値が正しくありません' };
  const { data, error } = await r.svc.from('salon_import_sources')
    .update({ bump_auto: setting.enabled, bump_start_min: setting.startMin, bump_end_min: setting.endMin, bump_interval_min: setting.intervalMin })
    .eq('salon_id', r.salonId).eq('provider', 'ekichika').eq('slot', slot)
    .select('slot');
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  if (!data || data.length === 0) return { ok: false, error: '駅ちかの店舗ページが登録されていません。運営事務局までご連絡ください' };
  return { ok: true, data: { perDay: bumpSlotsPerDay(setting) } };
}

/** 今すぐ上位表示する（駅ちかへは1〜2分で届く） */
export async function runConecfBumpNow(input: { slot: number }): Promise<Result<{ note: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!Number.isInteger(slot) || slot < 1) return { ok: false, error: '枠の指定が不正です' };
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'ekichika', slot,
      intent: 'bump_push', actor: 'shop:' + r.userId,
      bump: { force: true },
    });
    if (!f.ok) return { ok: false, error: f.note };
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] 上位表示を始められなかった', (e as Error).message);
    return { ok: false, error: '上位表示を始められませんでした。時間をおいてお試しください' };
  }
}
