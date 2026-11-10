'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { isValidBumpSetting, bumpSlotsPerDay, bumpCountStale, bumpResetMinOf, bumpIntervalsFor, normalizeBumpTimes, BUMP_TIMES_MAX, isCustomBumpInterval } from '@/lib/ekichikaBump';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { ekichikaAreaFromUrl } from '@/lib/ekichikaArea';
import { ESUTAMA_APPEAL_ROWS } from '@/lib/esutamaAppeal';
import { isEsutamaAppealRowKey } from '@/lib/esutamaAppealRows';

// コネックエフ「駅ちか上位表示」の受け口（第1305便・2026-10-08）。
// ★ 駅ちかの管理画面トップの「上位表示する」を、自動（時間帯・間隔）と今すぐの2通りで押す。押すのは中継の流れ（bump_auto / bump_push）。
// ★ 書き込み（設定の保存・今すぐ押す）は「コネックエフに切り替え済み」でセットを契約している自店だけ（第1243便の守り）。
// ★ 設定と状態は salon_import_sources の bump_*（provider='ekichika'・枠ごと）。追加SQL_第1305便。
// ★★ 第1314便: エステ魂の集客ワンクリックアピール（店舗情報）も同じ口・同じ列（provider='esutama'）。★ 押す流れは lib/esutamaAppealFlow.ts

export type BumpProvider = 'ekichika' | 'esutama';
const PROVIDER_NAME: Record<BumpProvider, string> = { ekichika: '駅ちか', esutama: 'エステ魂' };
function okProvider(v: unknown): BumpProvider | null {
  return v === 'ekichika' || v === 'esutama' ? v : null;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  // ★ 第1399便: 運営が店を選んでいるときは、その店（lib/conecf/actingSalon.ts）。店舗様は今までどおり自分の店
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at, crm_until'), user.id, actingId)
    .limit(1).maybeSingle();
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
  /** ★ 第1924便: 駅ちかのお店ページの URL のエリア（福岡市・博多／中洲・天神 など）。読めなければ null */
  area: string | null;
  /** ★ 第1922便: 時刻指定（0時からの分・時刻順）。null＝間隔で押す */
  times: number[] | null;
  /** 時刻指定の列がある（追加SQL_第1922便が済み）。false なら画面に時刻指定を出さない */
  timesReady: boolean;
  /** 駅ちかの最終更新日（＝最後に上位表示された時刻・手で押した分も入る） */
  lastAt: string | null;
  remaining: number | null;
  quota: number | null;
  readAt: string | null;
  /** ★ 第1407便: 読んだあとにサイトの回数が戻る時刻（駅ちか 0:00・エステ魂 6:00）を過ぎた＝remaining は古い（サイトでは1日の回数に戻っている） */
  countStale: boolean;
  /** サイトの回数が戻る時刻（分）。画面の注記に使う */
  resetMin: number | null;
};

/** ready=false … 列がまだ無い（追加SQL_第1305便が未適用）。画面は「準備中」を出す */
export async function getConecfBump(providerArg: BumpProvider = 'ekichika'): Promise<Result<{ salonId: number; ready: boolean; slots: ConecfBumpSlot[] }>> {
  const provider = okProvider(providerArg);
  if (!provider) return { ok: false, error: 'サイトの指定が不正です' };
  const r = await resolve(false);
  if (!r.ok) return r;
  const { svc, salonId } = r;
  const BASE_COLS = 'slot, link_mode, shop_url, bump_auto, bump_start_min, bump_end_min, bump_interval_min, bump_last_at, bump_remaining, bump_quota, bump_read_at';
  const readSrc = (cols: string) => svc.from('salon_import_sources')
    .select(cols).eq('salon_id', salonId).eq('provider', provider).order('slot', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: { data: any[] | null; error: { message?: string } | null } = await readSrc(BASE_COLS + ', bump_times');
  // ★ 第1922便: 時刻指定の列がまだ無い（追加SQL_第1922便が未適用）ときは、今までの列で読む＝画面は今までどおり
  const timesReady = !(src.error && /bump_times/.test(src.error.message ?? ''));
  if (!timesReady) src = await readSrc(BASE_COLS);
  const cred = await svc.from('salon_media_credentials').select('slot, is_enabled').eq('salon_id', salonId).eq('provider', provider);
  if (src.error) {
    if (/bump_/.test(src.error.message ?? '')) return { ok: true, data: { salonId, ready: false, slots: [] } };
    return { ok: false, error: '設定を読み込めませんでした。時間をおいてお試しください' };
  }
  const now = new Date();
  const resetMin = bumpResetMinOf(provider);
  const credOn = new Map((cred.data ?? []).map((c) => [Number(c.slot ?? 1), c.is_enabled === true]));
  const slots: ConecfBumpSlot[] = (src.data ?? []).map((x) => {
    const slot = Number(x.slot ?? 1);
    // ★ 第1314便の2: エステ魂は1日10回。まだ自動を入れていない行は、列の既定（10:00〜23:00・20分＝40回）ではなく
    //   10:00〜19:00・60分（ちょうど10回）を入れた状態で見せる（★ 保存するまで表には書かない）
    const esutamaFresh = provider === 'esutama' && x.bump_auto !== true
      && Number(x.bump_start_min) === 600 && Number(x.bump_end_min) === 1380 && Number(x.bump_interval_min) === 20;
    if (esutamaFresh) { x.bump_end_min = 1140; x.bump_interval_min = 60; }
    return {
      slot,
      hasCredential: credOn.get(slot) === true,
      linkOff: String(x.link_mode ?? '') === 'none',
      enabled: x.bump_auto === true,
      startMin: Number(x.bump_start_min ?? 600),
      endMin: Number(x.bump_end_min ?? 1380),
      intervalMin: Number(x.bump_interval_min ?? 20),
      area: provider === 'ekichika' ? ekichikaAreaFromUrl(typeof x.shop_url === 'string' ? x.shop_url : null) : null,
      times: provider === 'ekichika' && timesReady ? normalizeBumpTimes(x.bump_times) : null,
      timesReady: provider === 'ekichika' && timesReady,
      lastAt: (x.bump_last_at as string | null) ?? null,
      remaining: x.bump_remaining == null ? null : Number(x.bump_remaining),
      quota: x.bump_quota == null ? null : Number(x.bump_quota),
      readAt: (x.bump_read_at as string | null) ?? null,
      countStale: x.bump_remaining != null && bumpCountStale((x.bump_read_at as string | null) ?? null, resetMin, now),
      resetMin,
    };
  });
  return { ok: true, data: { salonId, ready: true, slots } };
}

/** 自動の設定を保存する */
/**
 * 自動の設定を保存する。
 *   ★ 第1922便: times … undefined＝時刻指定はそのまま（4枠まとめて保存など）／null や []＝時刻指定をやめて間隔で押す／時刻の配列＝時刻指定で押す（駅ちかだけ）
 */
export async function saveConecfBump(input: { provider?: BumpProvider; slot: number; enabled: boolean; startMin: number; endMin: number; intervalMin: number; times?: number[] | null }): Promise<Result<{ perDay: number }>> {
  const provider = okProvider(input.provider ?? 'ekichika');
  if (!provider) return { ok: false, error: 'サイトの指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!Number.isInteger(slot) || slot < 1) return { ok: false, error: '枠の指定が不正です' };
  const setting = { enabled: input.enabled === true, startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin) };
  // ★ 第1925便: 駅ちかは好きな分数（10〜240分）も入れられる。エステ魂は今までどおり選択肢だけ
  const intervalOk = provider === 'ekichika' ? isCustomBumpInterval(setting.intervalMin) : bumpIntervalsFor(provider).includes(setting.intervalMin);
  if (!isValidBumpSetting(setting) || !intervalOk) return { ok: false, error: provider === 'ekichika' ? '時間帯か間隔の値が正しくありません（間隔は10〜240分）' : '時間帯か間隔の値が正しくありません' };
  const touchTimes = input.times !== undefined;
  const times = touchTimes ? normalizeBumpTimes(input.times) : undefined;
  if (touchTimes && provider !== 'ekichika' && times) return { ok: false, error: '時刻指定は駅ちかだけです' };
  if (times && times.length > BUMP_TIMES_MAX) return { ok: false, error: `時刻は${BUMP_TIMES_MAX}個までです` };
  const patch: Record<string, unknown> = { bump_auto: setting.enabled, bump_start_min: setting.startMin, bump_end_min: setting.endMin, bump_interval_min: setting.intervalMin };
  // ★ 時刻を変えたら「どこまで押したか」も消す（新しい時刻の一覧で、いまから先を押す）
  if (touchTimes) { patch.bump_times = times ?? null; patch.bump_times_done_at = times ? new Date().toISOString() : null; }
  const { data, error } = await r.svc.from('salon_import_sources')
    .update(patch)
    .eq('salon_id', r.salonId).eq('provider', provider).eq('slot', slot)
    .select('slot');
  if (error) {
    // ★ 第1925便: 追加SQL_第1925便（間隔を10〜240分に）がまだのときに、選択肢にない分数を保存した
    if (/bump_range/.test(error.message ?? '')) return { ok: false, error: 'この分数はまだ保存できません。運営事務局までご連絡ください（10・15・20・30・60分は保存できます）' };
    return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  }
  if (!data || data.length === 0) return { ok: false, error: `${PROVIDER_NAME[provider]}の店舗ページが登録されていません。運営事務局までご連絡ください` };
  return { ok: true, data: { perDay: bumpSlotsPerDay({ ...setting, times: times ?? null }) } };
}

/** 今すぐ上位表示する（駅ちかへは1〜2分で届く） */
export async function runConecfBumpNow(input: { provider?: BumpProvider; slot: number }): Promise<Result<{ note: string }>> {
  const provider = okProvider(input.provider ?? 'ekichika');
  if (!provider) return { ok: false, error: 'サイトの指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!Number.isInteger(slot) || slot < 1) return { ok: false, error: '枠の指定が不正です' };
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider, slot,
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

// ── ★ 第1927便（2026-11-11・カッキーさん「運営でもフクエスの上位表示を設定できるように」）──
//   フクエスの上位表示（SalonBumpButton）は、店舗様のログインでは DB の決まり（RLS・salon_bump は持ち主だけ）で動く。
//   ★ 運営が店を選んで操作しているときだけ、ここ（service role）で同じことをする。★ 店舗様のときは使わない（持ち主の道のまま）
async function resolveOperatorSalon() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const actingId = await operatorActingSalonId(user.id);
  if (actingId == null) return { ok: false as const, error: '運営として店舗を選んでいるときだけ使えます' };
  return { ok: true as const, svc: createServiceClient(), salonId: Number(actingId) };
}

export type FukuesBumpState = {
  bumpDay: string | null; bumpUsed: number; bumpedAt: string | null; jobsEnabled: boolean;
  /** 自動の設定。列が無ければ null */
  auto: { enabled: boolean; startMin: number | null; endMin: number | null; intervalMin: number | null; lastAt: string | null } | null;
};

export async function getFukuesBumpForOperator(): Promise<Result<FukuesBumpState>> {
  const r = await resolveOperatorSalon();
  if (!r.ok) return r;
  const { data, error } = await r.svc.from('salons').select('bumped_at, bump_day, bump_used, jobs_enabled').eq('id', r.salonId).maybeSingle();
  if (error || !data) return { ok: false, error: '読み込めませんでした' };
  const a = await r.svc.from('salons')
    .select('bump_auto_enabled, bump_auto_start_min, bump_auto_end_min, bump_auto_interval_min, bump_auto_at').eq('id', r.salonId).maybeSingle();
  return {
    ok: true,
    data: {
      bumpDay: (data.bump_day as string | null) ?? null,
      bumpUsed: Number(data.bump_used ?? 0),
      bumpedAt: (data.bumped_at as string | null) ?? null,
      jobsEnabled: data.jobs_enabled === true,
      auto: a.error || !a.data ? null : {
        enabled: a.data.bump_auto_enabled === true,
        startMin: (a.data.bump_auto_start_min as number | null) ?? null,
        endMin: (a.data.bump_auto_end_min as number | null) ?? null,
        intervalMin: (a.data.bump_auto_interval_min as number | null) ?? null,
        lastAt: (a.data.bump_auto_at as string | null) ?? null,
      },
    },
  };
}

/** いま1回押す（店舗様の salon_bump と同じ回数の財布）。返事は salon_bump と同じ形 */
export async function pressFukuesBumpForOperator(): Promise<{ ok?: boolean; error?: string; used?: number; quota?: number; remaining?: number; bumped_at?: string }> {
  const r = await resolveOperatorSalon();
  if (!r.ok) return { ok: false, error: r.error };
  // ★ 手で押した扱い（p_auto=false）。★ service role に実行の権限が無い DB では、周と同じ関数で押す（自動の足あとが付くだけ）
  let res = await r.svc.rpc('salon_bump_apply', { p_salon_id: r.salonId, p_auto: false });
  if (res.error && /permission|denied/i.test(res.error.message)) res = await r.svc.rpc('salon_bump_auto_run', { p_salon_id: r.salonId });
  if (res.error) return { ok: false, error: '実行できませんでした。時間をおいてお試しください。' };
  return (res.data ?? { ok: false, error: '実行できませんでした' }) as { ok?: boolean; error?: string };
}

export async function saveFukuesBumpAutoForOperator(input: { enabled: boolean; startMin: number; endMin: number; intervalMin: number }): Promise<Result<null>> {
  const r = await resolveOperatorSalon();
  if (!r.ok) return r;
  const ok = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1439;
  if (!ok(input.startMin) || !ok(input.endMin) || input.startMin === input.endMin) return { ok: false, error: '時刻の形が読み取れません' };
  const { error } = await r.svc.from('salons').update({
    bump_auto_enabled: input.enabled === true,
    bump_auto_start_min: input.startMin,
    bump_auto_end_min: input.endMin,
    bump_auto_interval_min: Number(input.intervalMin),
  }).eq('id', r.salonId);
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: null };
}

// ── ★ 第1930便（2026-11-11）: エステ魂の集客ワンクリックアピールを行ごと（店舗情報・クーポン情報・お店体験談）に ──

export type EsutamaAppealRowSlot = ConecfBumpSlot & { rowKey: string };

/** ready=false … 表がまだ無い（追加SQL_第1930便が未適用）。画面は今までの「3行まとめて」を出す */
export async function getEsutamaAppealRows(): Promise<Result<{ ready: boolean; rows: EsutamaAppealRowSlot[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data, error } = await r.svc.from('conecf_esutama_appeal_rows')
    .select('row_key, auto, start_min, end_min, interval_min, times, last_at, remaining, read_at').eq('salon_id', r.salonId);
  if (error) return { ok: true, data: { ready: false, rows: [] } };
  const cred = await r.svc.from('salon_media_credentials').select('slot, is_enabled').eq('salon_id', r.salonId).eq('provider', 'esutama');
  const src = await r.svc.from('salon_import_sources').select('slot, link_mode, bump_start_min, bump_end_min, bump_interval_min').eq('salon_id', r.salonId).eq('provider', 'esutama').order('slot').limit(1).maybeSingle();
  const hasCred = (cred.data ?? []).some((c) => Number(c.slot ?? 1) === 1 && c.is_enabled === true);
  const linkOff = String(src.data?.link_mode ?? '') === 'none';
  const now = new Date();
  const resetMin = bumpResetMinOf('esutama');
  const byKey = new Map((data ?? []).map((x) => [String(x.row_key), x]));
  const rows: EsutamaAppealRowSlot[] = ESUTAMA_APPEAL_ROWS.map((k, i) => {
    const x = byKey.get(k);
    const readAt = (x?.read_at as string | null) ?? null;
    const remaining = x?.remaining == null ? null : Number(x.remaining);
    return {
      rowKey: k, slot: i + 1, hasCredential: hasCred, linkOff,
      enabled: x?.auto === true,
      startMin: Number(x?.start_min ?? src.data?.bump_start_min ?? 600),
      endMin: Number(x?.end_min ?? src.data?.bump_end_min ?? 240),
      intervalMin: Number(x?.interval_min ?? src.data?.bump_interval_min ?? 120),
      area: null, times: normalizeBumpTimes(x?.times), timesReady: true,
      lastAt: (x?.last_at as string | null) ?? null,
      remaining, quota: 10, readAt,
      countStale: remaining != null && bumpCountStale(readAt, resetMin, now),
      resetMin,
    };
  });
  return { ok: true, data: { ready: true, rows } };
}

export async function saveEsutamaAppealRow(input: { row: string; enabled: boolean; startMin: number; endMin: number; intervalMin: number; times?: number[] }): Promise<Result<{ perDay: number }>> {
  if (!isEsutamaAppealRowKey(input.row)) return { ok: false, error: '行の指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const setting = { enabled: input.enabled === true, startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin) };
  if (!isValidBumpSetting(setting) || !isCustomBumpInterval(setting.intervalMin)) return { ok: false, error: '時間帯か間隔の値が正しくありません（間隔は10〜240分）' };
  const touchTimes = input.times !== undefined;
  const times = touchTimes ? normalizeBumpTimes(input.times) : undefined;
  if (times && times.length > BUMP_TIMES_MAX) return { ok: false, error: `時刻は${BUMP_TIMES_MAX}個までです` };
  const row: Record<string, unknown> = {
    salon_id: r.salonId, row_key: input.row, auto: setting.enabled,
    start_min: setting.startMin, end_min: setting.endMin, interval_min: setting.intervalMin, updated_at: new Date().toISOString(),
  };
  if (touchTimes) { row.times = times ?? null; row.times_done_at = times ? new Date().toISOString() : null; }
  const { error } = await r.svc.from('conecf_esutama_appeal_rows').upsert(row, { onConflict: 'salon_id,row_key' });
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: { perDay: bumpSlotsPerDay({ ...setting, times: times ?? null }) } };
}

export async function runEsutamaAppealRowNow(input: { row: string }): Promise<Result<{ note: string }>> {
  if (!isEsutamaAppealRowKey(input.row)) return { ok: false, error: '行の指定が不正です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'esutama', slot: 1, intent: 'bump_push', actor: 'shop:' + r.userId,
      bump: { force: true }, esutamaAppeal: { rows: [input.row] },
    });
    if (!f.ok) return { ok: false, error: f.note };
    return { ok: true, data: { note: f.note } };
  } catch {
    return { ok: false, error: '受け付けられませんでした。時間をおいてお試しください' };
  }
}
