'use server';

// フクエスCRM：店舗様が、グループ・提携店へ NG・要注意を共有する／共有リストを見る（第1325便・2026-10-09・カッキーさん）。
//   設計は 設計メモ_グループで共有するNG・要注意リスト_2026-10-09.md。決まりは src/lib/crmGroup.ts。表は 追加SQL_第1324便。
//
// ★★★ 守り
//   ・ログイン中のユーザーが、その店のオーナー本人（か運営）で、CRM が契約中であること（actions/crm.ts の assertCrm と同じ判定）。
//   ・その店が、いまグループに入っていること（毎回 DB で確かめる。外した直後から見えなくする）。
//   ・直す・取り下げるは、自店が出した分だけ（salon_id で絞る）。
// ★★★ 店舗様の画面へ返す形には、出した店の番号・名前を入れない（mine＝自店の分か、だけ）。グループの店の名前も返さない（数だけ）。
// ★★ 共有できるのは、自店の台帳にいるお客様の、台帳に載っている電話番号だけ（自由に番号を打ちこんで共有する口は作らない）。
// ★ 記録（crm_group_logs）には、電話番号・名前・内容を入れない（消したあとに残さないため）。だれが（ユーザーID）・いつ・何をしたか、だけ。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import {
  checkCrmGroupAlert,
  isCrmGroupCertainty, isCrmGroupKind, isCrmGroupLevel,
  type CrmGroupAlertInput, type CrmGroupCertainty, type CrmGroupHit, type CrmGroupKind, type CrmGroupLevel,
} from '@/lib/crmGroup';
import {
  CRM_GROUP_HIT_COLS, countCrmGroupMembers, crmActiveIssuerIds, readCrmGroupHits, readCrmGroupMembership, toCrmGroupHit,
} from '@/app/lib/crm/groupAlerts';

// ★ 第1334便: 「グループ共有」の使い方の文。★ ここ（サーバーの口）からだけ返す。画面の部品から import しない
import { CRM_GROUP_GUIDE, type CrmGroupGuideSection } from '@/app/lib/crm/groupGuideText';

type Err = { ok: false; error: string };
type Svc = ReturnType<typeof createServiceClient>;

const LIST_LIMIT = 500;
// ★ 2026-10-09 点検#7: グループに入っていない店には、機能の名前を出さない
const NOT_IN_GROUP = 'この操作は、このお店では使えません';

type Auth = { ok: true; svc: Svc; userId: string; isAdmin: boolean };

/** オーナー本人（か運営）で、CRM が契約中か。★ actions/crm.ts の assertCrm と同じ判定 */
async function assertOwner(salonId: number): Promise<Auth | Err> {
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon, error } = await svc.from('salons').select('owner_id, crm_until').eq('id', salonId).maybeSingle();
  if (error || !salon) return { ok: false, error: '店舗が見つかりません' };
  const isAdmin = user.id === ADMIN_UUID;
  if (!isAdmin && (salon.owner_id as string | null) !== user.id) return { ok: false, error: 'この店舗の顧客台帳を見る権限がありません' };
  const until = (salon.crm_until as string | null) ?? null;
  if (!isAdmin && !(until && String(until).slice(0, 10) >= getCalendarDateJST())) return { ok: false, error: 'フクエスCRMのご契約期間外です' };
  return { ok: true, svc, userId: user.id, isAdmin };
}

/** 本人確認 ＋ グループに入っているか */
async function assertMember(salonId: number): Promise<(Auth & { groupId: number }) | (Err & { notInGroup?: true })> {
  const a = await assertOwner(salonId);
  if (!a.ok) return a;
  const m = await readCrmGroupMembership(a.svc, salonId);
  if (m.state === 'error') return { ok: false, error: 'グループの情報を読めませんでした。もう一度お試しください' };
  if (m.state === 'out') return { ok: false, error: NOT_IN_GROUP, notInGroup: true };
  return { ...a, groupId: m.groupId };
}

type LogAction = 'alert_create' | 'alert_edit' | 'alert_withdraw';
/** 記録を1行足す。★ 書けなくても操作は止めない（黙らずにサーバーのログへ出す）。★ 電話番号・名前・内容は入れない */
async function writeLog(svc: Svc, row: { groupId: number; salonId: number; alertId: number; action: LogAction; auth: Auth; detail?: Record<string, number | string | boolean> }): Promise<void> {
  const { error } = await svc.from('crm_group_logs').insert({
    group_id: row.groupId, salon_id: row.salonId, alert_id: row.alertId, action: row.action,
    actor: (row.auth.isAdmin ? 'admin:' : 'owner:') + row.auth.userId, detail: row.detail ?? null,
  });
  if (error) console.error('[crmGroupShare] 記録を書けなかった', row.action, row.alertId, error.message);
}

/** 自店が出した共有（直すときに要る全部）。★ 自店の分だけに使う */
export type CrmGroupMyAlert = {
  id: number;
  customerId: number | null;
  level: CrmGroupLevel;
  kind: CrmGroupKind;
  certainty: CrmGroupCertainty;
  happenedOn: string;
  what: string;
  checkedHow: string;
  shownName: string;
  phones: string[];
  createdAt: string;
  updatedAt: string;
};

const MY_COLS = 'id, customer_id, level, kind, certainty, happened_on, what, checked_how, shown_name, created_at, updated_at';

function toMyAlert(r: Record<string, unknown>, phones: string[]): CrmGroupMyAlert | null {
  if (!isCrmGroupLevel(r.level) || !isCrmGroupKind(r.kind) || !isCrmGroupCertainty(r.certainty)) return null;
  return {
    id: Number(r.id),
    customerId: r.customer_id == null ? null : Number(r.customer_id),
    level: r.level, kind: r.kind, certainty: r.certainty,
    happenedOn: String(r.happened_on ?? '').slice(0, 10),
    what: String(r.what ?? ''),
    checkedHow: String(r.checked_how ?? ''),
    shownName: String(r.shown_name ?? ''),
    phones,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

async function alertPhones(svc: Svc, alertIds: number[]): Promise<{ map: Map<number, string[]>; error: string | null }> {
  const map = new Map<number, string[]>();
  for (let i = 0; i < alertIds.length; i += 200) {
    const { data, error } = await svc.from('crm_group_alert_phones')
      .select('alert_id, phone').in('alert_id', alertIds.slice(i, i + 200)).order('id', { ascending: true });
    if (error) return { map, error: error.message };
    for (const p of data ?? []) {
      const k = Number(p.alert_id);
      map.set(k, [...(map.get(k) ?? []), String(p.phone)]);
    }
  }
  return { map, error: null };
}

async function customerPhones(svc: Svc, salonId: number, customerId: number): Promise<string[]> {
  const { data } = await svc.from('salon_customer_phones')
    .select('phone').eq('salon_id', salonId).eq('customer_id', customerId).order('id', { ascending: true });
  return (data ?? []).map((p) => String(p.phone));
}

/**
 * 顧客台帳の1人について：自店が出している共有と、ほかの店から共有されている分。
 * ★ グループに入っていない店には inGroup: false だけを返す（欄そのものを出さない）。
 */
export async function getCrmCustomerGroupShare(
  salonId: number,
  customerId: number,
): Promise<
  | { ok: true; inGroup: false }
  | { ok: true; inGroup: true; memberCount: number; phones: string[]; mine: CrmGroupMyAlert | null; others: CrmGroupHit[]; othersFailed: boolean }
  | Err
> {
  const a = await assertMember(salonId);
  if (!a.ok) return a.notInGroup ? { ok: true, inGroup: false } : { ok: false, error: a.error };
  const svc = a.svc;
  if (!Number.isInteger(customerId) || customerId <= 0) return { ok: false, error: 'お客様が不正です' };
  const { data: c } = await svc.from('salon_customers').select('id').eq('salon_id', salonId).eq('id', customerId).maybeSingle();
  if (!c) return { ok: false, error: 'お客様が見つかりません' };

  const [memberCount, phones, mineRes] = await Promise.all([
    countCrmGroupMembers(svc, a.groupId),
    customerPhones(svc, salonId, customerId),
    svc.from('crm_group_alerts').select(MY_COLS)
      .eq('group_id', a.groupId).eq('salon_id', salonId).eq('customer_id', customerId).is('withdrawn_at', null)
      .order('id', { ascending: false }).limit(1),
  ]);
  if (mineRes.error) return { ok: false, error: '共有を読めませんでした: ' + mineRes.error.message };
  let mine: CrmGroupMyAlert | null = null;
  const row = (mineRes.data ?? [])[0] as Record<string, unknown> | undefined;
  if (row) {
    const ph = await alertPhones(svc, [Number(row.id)]);
    if (ph.error) return { ok: false, error: '共有を読めませんでした: ' + ph.error };
    mine = toMyAlert(row, ph.map.get(Number(row.id)) ?? []);
  }
  const hits = await readCrmGroupHits(svc, a.groupId, salonId, phones);
  const seen = new Set<number>();
  const others: CrmGroupHit[] = [];
  for (const hs of hits.byPhone.values()) for (const h of hs) {
    if (h.mine || seen.has(h.id)) continue;
    seen.add(h.id); others.push(h);
  }
  return { ok: true, inGroup: true, memberCount, phones, mine, others, othersFailed: hits.failed };
}

export type CrmGroupAlertSaveInput = CrmGroupAlertInput & {
  salonId: number;
  customerId: number;
  /** null＝新しく共有する ／ 番号＝自店の共有を直す */
  alertId: number | null;
};

/**
 * 共有を登録する・直す（自店の台帳のお客様だけ）。
 * ★★ 電話番号は、そのお客様の台帳に載っている番号の中からだけ選べる。★ 名前は台帳の名前を写す。
 * ★ 1人のお客様につき、自店から出せる共有は1件（2件目は「直す」で書き足す）。
 */
export async function saveCrmGroupAlert(input: CrmGroupAlertSaveInput): Promise<{ ok: true; alertId: number } | Err> {
  const salonId = Number(input.salonId);
  const a = await assertMember(salonId);
  if (!a.ok) return { ok: false, error: a.error };
  const svc = a.svc;
  const customerId = Number(input.customerId);
  if (!Number.isInteger(customerId) || customerId <= 0) return { ok: false, error: 'お客様が不正です' };
  const checked = checkCrmGroupAlert(input, getCalendarDateJST());
  if (!checked.ok) return checked;
  const v = checked.value;

  const { data: c } = await svc.from('salon_customers').select('id, name').eq('salon_id', salonId).eq('id', customerId).maybeSingle();
  if (!c) return { ok: false, error: 'お客様が見つかりません' };
  const own = await customerPhones(svc, salonId, customerId);
  if (own.length === 0) return { ok: false, error: '電話番号が台帳に無いお客様は、共有できません（電話番号で照らし合わせるためです）' };
  if (v.phones.some((p) => !own.includes(p))) return { ok: false, error: '共有できるのは、このお客様の台帳に載っている電話番号だけです' };

  const fields = {
    level: v.level, kind: v.kind, certainty: v.certainty, happened_on: v.happenedOn,
    what: v.what, checked_how: v.checkedHow, shown_name: String((c.name as string | null) ?? '').slice(0, 40),
  };

  const { data: cur, error: curErr } = await svc.from('crm_group_alerts').select('id')
    .eq('group_id', a.groupId).eq('salon_id', salonId).eq('customer_id', customerId).is('withdrawn_at', null);
  if (curErr) return { ok: false, error: '共有を読めませんでした: ' + curErr.message };
  const curIds = (cur ?? []).map((r) => Number(r.id));

  if (input.alertId == null) {
    if (curIds.length > 0) return { ok: false, error: 'このお客様は、もう共有しています（「直す」で書き足してください）' };
    const { data: ins, error } = await svc.from('crm_group_alerts')
      .insert({ group_id: a.groupId, salon_id: salonId, customer_id: customerId, created_by: a.userId, ...fields })
      .select('id').single();
    if (error || !ins) return { ok: false, error: '共有できませんでした: ' + (error?.message ?? '') };
    const alertId = Number(ins.id);
    const { error: pErr } = await svc.from('crm_group_alert_phones')
      .insert(v.phones.map((phone) => ({ alert_id: alertId, group_id: a.groupId, phone })));
    if (pErr) {
      // ★ 電話番号の無い共有を残さない（当たらないのに「共有した」ことになる）
      const { error: dErr } = await svc.from('crm_group_alerts').delete().eq('id', alertId).eq('salon_id', salonId);
      if (dErr) console.error('[crmGroupShare] 電話番号を入れられなかった共有を消せなかった', alertId, dErr.message);
      return { ok: false, error: '共有できませんでした（電話番号を登録できませんでした）: ' + pErr.message };
    }
    await writeLog(svc, { groupId: a.groupId, salonId, alertId, action: 'alert_create', auth: a, detail: { level: v.level, kind: v.kind, certainty: v.certainty, phones: v.phones.length } });
    return { ok: true, alertId };
  }

  const alertId = Number(input.alertId);
  if (!curIds.includes(alertId)) return { ok: false, error: '直せるのは、自店が出している共有だけです（取り下げたあとは、もう一度共有してください）' };
  const { data: up, error: upErr } = await svc.from('crm_group_alerts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', alertId).eq('salon_id', salonId).eq('group_id', a.groupId).is('withdrawn_at', null).select('id');
  if (upErr) return { ok: false, error: '直せませんでした: ' + upErr.message };
  if (!up || up.length === 0) return { ok: false, error: '共有が見つかりません' };
  // 電話番号の入れ替え。★ 先に足してから消す（途中で失敗しても、番号がゼロにならない）
  const ph = await alertPhones(svc, [alertId]);
  if (ph.error) return { ok: false, error: '内容は直しましたが、電話番号を読めませんでした: ' + ph.error };
  const had = ph.map.get(alertId) ?? [];
  const toAdd = v.phones.filter((p) => !had.includes(p));
  const toDel = had.filter((p) => !v.phones.includes(p));
  if (toAdd.length > 0) {
    const { error } = await svc.from('crm_group_alert_phones').insert(toAdd.map((phone) => ({ alert_id: alertId, group_id: a.groupId, phone })));
    if (error) return { ok: false, error: '内容は直しましたが、電話番号を足せませんでした: ' + error.message };
  }
  if (toDel.length > 0) {
    const { error } = await svc.from('crm_group_alert_phones').delete().eq('alert_id', alertId).in('phone', toDel);
    if (error) return { ok: false, error: '内容は直しましたが、外した電話番号を消せませんでした: ' + error.message };
  }
  await writeLog(svc, { groupId: a.groupId, salonId, alertId, action: 'alert_edit', auth: a, detail: { level: v.level, kind: v.kind, certainty: v.certainty, phones: v.phones.length } });
  return { ok: true, alertId };
}

/** 自店が出した共有を取り下げる（ほかの店から見えなくなる）。★ 行は消さない（消すのは、あとの便） */
export async function withdrawCrmGroupAlert(salonId: number, alertId: number): Promise<{ ok: true } | Err> {
  const a = await assertMember(Number(salonId));
  if (!a.ok) return { ok: false, error: a.error };
  const id = Number(alertId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: '共有が不正です' };
  const { data, error } = await a.svc.from('crm_group_alerts')
    .update({ withdrawn_at: new Date().toISOString(), withdrawn_by: a.userId, withdrawn_reason: 'self' })
    .eq('id', id).eq('salon_id', Number(salonId)).eq('group_id', a.groupId).is('withdrawn_at', null).select('id');
  if (error) return { ok: false, error: '取り下げられませんでした: ' + error.message };
  if (!data || data.length === 0) return { ok: false, error: '取り下げられるのは、自店が出している共有だけです' };
  await writeLog(a.svc, { groupId: a.groupId, salonId: Number(salonId), alertId: id, action: 'alert_withdraw', auth: a });
  return { ok: true };
}

/**
 * 共有リストの1行。
 * ★★★ 出した店の番号・名前は入れない。mine＝自店の分か、だけ。customerId は自店の分のときだけ（台帳へのリンク用）。
 */
export type CrmGroupListRow = CrmGroupHit & {
  checkedHow: string;
  phones: string[];
  createdAt: string;
  customerId: number | null;
};

/** グループの共有リスト（いま有効な分・新しい順）。★ グループに入っていない店には inGroup: false だけ */
export async function listCrmGroupAlerts(
  salonId: number,
): Promise<{ ok: true; inGroup: false } | { ok: true; inGroup: true; memberCount: number; rows: CrmGroupListRow[]; more: boolean } | Err> {
  const a = await assertMember(Number(salonId));
  if (!a.ok) return a.notInGroup ? { ok: true, inGroup: false } : { ok: false, error: a.error };
  const svc = a.svc;
  const [memberCount, res] = await Promise.all([
    countCrmGroupMembers(svc, a.groupId),
    svc.from('crm_group_alerts').select(CRM_GROUP_HIT_COLS + ', checked_how, customer_id, created_at')
      .eq('group_id', a.groupId).is('withdrawn_at', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LIST_LIMIT + 1),
  ]);
  if (res.error) return { ok: false, error: '共有リストを読めませんでした: ' + res.error.message };
  const all = (res.data ?? []) as unknown as Array<Record<string, unknown>>;
  // ★ 第1331便: CRM を解約した店が出した共有は、一覧にも出さない（受付の当たりと同じ決まり）
  const active = await crmActiveIssuerIds(svc, all.map((r) => Number(r.salon_id)), Number(salonId));
  if (!active) return { ok: false, error: '共有リストを読めませんでした。もう一度お試しください' };
  const page = all.filter((r) => active.has(Number(r.salon_id))).slice(0, LIST_LIMIT);
  const ph = await alertPhones(svc, page.map((r) => Number(r.id)));
  if (ph.error) return { ok: false, error: '共有リストを読めませんでした: ' + ph.error };
  const rows: CrmGroupListRow[] = [];
  for (const r of page) {
    const h = toCrmGroupHit(r as Parameters<typeof toCrmGroupHit>[0], Number(salonId));
    if (!h) continue;
    rows.push({
      ...h,
      checkedHow: String(r.checked_how ?? ''),
      phones: ph.map.get(h.id) ?? [],
      createdAt: String(r.created_at ?? ''),
      customerId: h.mine && r.customer_id != null ? Number(r.customer_id) : null,
    });
  }
  return { ok: true, inGroup: true, memberCount, rows, more: all.length > LIST_LIMIT };
}

/**
 * 「グループ共有」の使い方（第1334便）。
 * ★★★ グループに入っている店にだけ返す（この仕組みがあることは、表に出さない＝カッキーさんの決定）。
 *   入っていない店・申込みの途中の店には返さない。文は画面の部品に埋めこまず、押されたときに、ここから渡す。
 */
export async function getCrmGroupGuide(salonId: number): Promise<{ ok: true; sections: CrmGroupGuideSection[] } | Err> {
  const a = await assertMember(Number(salonId));
  if (!a.ok) return { ok: false, error: a.error };
  return { ok: true, sections: CRM_GROUP_GUIDE.map((s) => ({ heading: s.heading, items: [...s.items] })) };
}
