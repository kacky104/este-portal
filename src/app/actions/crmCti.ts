'use server';

// フクエスCRM 着信ポップ（CTI）：店舗様の画面から呼ぶ口（第1686便・2026-10-28）。設計メモ_2026-10-28_CTI着信ポップ_D方式.md §4
// ★ 守り: assertCrmOwner（オーナー本人か運営・契約中・規約同意）＋ service_role。表は追加SQL_第1685便。
// ★ ここにあるもの:
//   ・getCrmIncomingCalls … CRM を開いているブラウザが 3 秒ごとに「この id より後の着信は？」と聞く（軽い読み）
//   ・lookupCtiCaller     … 番号から台帳のお客様＋グループ共有＋「次は◯回目」を引く（ポップの中身）
//   ・listCrmCtiDevices   … 設定タブの端末一覧（読むだけ。発行は /admin）
//   ・crmCtiTestCall      … 店舗様の「テスト着信」ボタン

import { assertCrmOwner } from '@/app/lib/crm/auth';
import { normalizeIncomingPhone, parseHiddenReason, recordCtiCall, type CtiHiddenReason } from '@/app/lib/crm/cti';
import { lookupCrmCustomerByPhone } from '@/app/actions/crm';
import type { CrmScheduleCustomer } from '@/app/lib/crm/types';
import type { CrmGroupHit } from '@/lib/crmGroup';

type Err = { ok: false; error: string };

function tableMissing(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /crm_cti_/.test(e.message ?? '') && /does not exist|schema cache/.test(e.message ?? ''));
}

export type CrmIncomingCall = {
  id: number;
  phone: string | null;
  hidden: CtiHiddenReason | null;
  /** テスト着信（device_id null）か */
  test: boolean;
  rangAtISO: string;
};

/**
 * 着信の見張り。afterId より後の着信を古い順に（最大 10 件）。
 * ★ afterId が null（開いた直後）のときは「今より 2 分以内」の着信だけ返す（開いた瞬間に昨日の着信が積まれないように）。
 * ★ CTI の端末が1台も無く、テスト着信も無い店は enabled: false（ブラウザはそれ以上聞かない）。
 */
export async function getCrmIncomingCalls(
  salonId: number,
  afterId: number | null,
): Promise<{ ok: true; enabled: boolean; calls: CrmIncomingCall[]; latestId: number | null } | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const svc = a.svc;

  if (afterId == null) {
    // 端末があるか（止めている端末も「ある」に数える＝運営が止めただけで店にはある）
    const { count, error } = await svc.from('crm_cti_devices').select('id', { count: 'exact', head: true }).eq('salon_id', salonId);
    if (tableMissing(error)) return { ok: true, enabled: false, calls: [], latestId: null };
    if (error) return { ok: false, error: '着信の設定を読めませんでした: ' + error.message };
    // 端末が無くてもテスト着信（直近 1 日）があれば見張る（端末が届く前の確認用）
    let enabled = (count ?? 0) > 0;
    if (!enabled) {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { count: tc } = await svc.from('crm_cti_calls').select('id', { count: 'exact', head: true })
        .eq('salon_id', salonId).gte('received_at', since);
      enabled = (tc ?? 0) > 0;
    }
    if (!enabled) return { ok: true, enabled: false, calls: [], latestId: null };
    // 開いた直後は「最新の id」と、2 分以内の着信だけ
    const since2 = new Date(Date.now() - 120_000).toISOString();
    const { data, error: e2 } = await svc.from('crm_cti_calls')
      .select('id, phone, hidden_reason, device_id, rang_at')
      .eq('salon_id', salonId).order('id', { ascending: false }).limit(10);
    if (e2) return { ok: false, error: '着信を読めませんでした: ' + e2.message };
    const rows = (data ?? []);
    const latestId = rows.length > 0 ? Number(rows[0].id) : 0;
    const recent = rows.filter((r) => String(r.rang_at) >= since2).reverse();
    return { ok: true, enabled: true, latestId, calls: recent.map(toCall) };
  }

  const { data, error } = await svc.from('crm_cti_calls')
    .select('id, phone, hidden_reason, device_id, rang_at')
    .eq('salon_id', salonId).gt('id', afterId).order('id', { ascending: true }).limit(10);
  if (tableMissing(error)) return { ok: true, enabled: false, calls: [], latestId: afterId };
  if (error) return { ok: false, error: '着信を読めませんでした: ' + error.message };
  const rows = data ?? [];
  return { ok: true, enabled: true, calls: rows.map(toCall), latestId: rows.length > 0 ? Number(rows[rows.length - 1].id) : afterId };
}

function toCall(r: Record<string, unknown>): CrmIncomingCall {
  return {
    id: Number(r.id),
    phone: (r.phone as string | null) ?? null,
    hidden: parseHiddenReason(r.hidden_reason),
    test: r.device_id == null,
    rangAtISO: new Date(String(r.rang_at)).toISOString(),
  };
}

export type CtiCallerInfo = {
  customer: CrmScheduleCustomer | null;
  groupHits: CrmGroupHit[];
  groupFailed: boolean;
  /** この番号の人の、CRM に入れた予約の数（キャンセル込み）。次の予約は bookingCount+1 回目。台帳に無ければ 0 */
  bookingCount: number;
};

/** 番号からポップの中身を引く。★ 台帳の判定・グループ共有は受付フォームと同じ lookupCrmCustomerByPhone（1か所） */
export async function lookupCtiCaller(salonId: number, phone: string): Promise<({ ok: true } & CtiCallerInfo) | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const r = await lookupCrmCustomerByPhone(salonId, phone);
  if (!r.ok) return r;
  let bookingCount = 0;
  if (r.customer) {
    const { count } = await a.svc.from('salon_bookings').select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId).eq('customer_id', r.customer.id);
    bookingCount = count ?? 0;
  }
  return { ok: true, customer: r.customer, groupHits: r.groupHits, groupFailed: r.groupFailed, bookingCount };
}

export type CrmCtiDeviceInfo = {
  id: number;
  name: string;
  isEnabled: boolean;
  lastSeenAt: string | null;
  lastCallAt: string | null;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
};

/** 設定タブの端末一覧（読むだけ）。★ 表が無ければ ready: false */
export async function listCrmCtiDevices(salonId: number): Promise<{ ok: true; ready: boolean; devices: CrmCtiDeviceInfo[] } | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const { data, error } = await a.svc.from('crm_cti_devices')
    .select('id, name, is_enabled, last_seen_at, last_call_at, device_model, android_version, app_version')
    .eq('salon_id', salonId).order('id', { ascending: true });
  if (tableMissing(error)) return { ok: true, ready: false, devices: [] };
  if (error) return { ok: false, error: '端末を読めませんでした: ' + error.message };
  return {
    ok: true, ready: true,
    devices: (data ?? []).map((r) => ({
      id: Number(r.id), name: String(r.name ?? ''), isEnabled: !!r.is_enabled,
      lastSeenAt: (r.last_seen_at as string | null) ?? null, lastCallAt: (r.last_call_at as string | null) ?? null,
      deviceModel: String(r.device_model ?? ''), androidVersion: String(r.android_version ?? ''), appVersion: String(r.app_version ?? ''),
    })),
  };
}

/** 店舗様の「テスト着信」。device_id は null。phone が空なら非通知のテスト */
export async function crmCtiTestCall(salonId: number, input: { phone?: string; hidden?: boolean }): Promise<{ ok: true; duplicate: boolean } | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const raw = String(input.phone ?? '').trim();
  const phone = input.hidden ? null : normalizeIncomingPhone(raw);
  if (!input.hidden && !phone) return { ok: false, error: '電話番号は数字10〜13桁で入れてください' };
  const r = await recordCtiCall(a.svc, { salonId, deviceId: null, phone, hidden: phone ? null : 'withheld' });
  if (!r.ok) {
    if (/crm_cti_/.test(r.error) && /does not exist|schema cache/.test(r.error)) return { ok: false, error: '着信ポップはまだ準備中です（運営が設定すると使えます）' };
    return { ok: false, error: 'テスト着信を入れられませんでした: ' + r.error };
  }
  return { ok: true, duplicate: r.duplicate };
}
