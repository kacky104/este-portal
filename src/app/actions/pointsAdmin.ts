'use server';

// フクエスポイント: 運営の操作（第1444便・2026-10-14）。/admin/points から使う。運営アカウント（ADMIN_UUID）だけ。
//   ・ポイント加盟店の ON／OFF（salons.points_member）。★ 加盟店の一覧はサイトに公開されるので、お店の了承を取ってから ON。
//   ・月ごと・店ごとの集計（付けた／使われた＝実際の負担額／期限切れ／取り消し）と、受け取り券の数（受け取り率を見る）。
//   ・予約が取り消された・消された予約に付いた来店ポイントの一覧と、手での取り消し。
import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';

type Err = { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true };
}

export type PointSalonRow = { id: number; name: string; hidden: boolean; crmActive: boolean; member: boolean };

/** CRM 契約中の店と、加盟店になっている店 */
export async function listPointSalons(): Promise<{ ok: true; rows: PointSalonRow[] } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const svc = createServiceClient();
  const { data, error } = await svc.from('salons').select('id, name, is_hidden, crm_until, points_member').order('id').limit(1000);
  if (error) return { ok: false, error: /points_member/.test(error.message) ? 'ポイントの準備がまだです（追加SQL_第1444便を流してください）' : error.message };
  const today = getCalendarDateJST();
  const rows = (data ?? [])
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      hidden: r.is_hidden === true,
      crmActive: !!r.crm_until && String(r.crm_until).slice(0, 10) >= today,
      member: r.points_member === true,
    }))
    .filter((r) => r.crmActive || r.member);
  return { ok: true, rows };
}

/** 加盟店の ON／OFF。★ ON にできるのは CRM 契約中の店だけ（QR の同意書が無いと貯まらないため） */
export async function setPointsMember(salonId: number, on: boolean): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Math.trunc(Number(salonId));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: '店舗が不正です' };
  const svc = createServiceClient();
  if (on) {
    const { data: s } = await svc.from('salons').select('crm_until').eq('id', id).maybeSingle();
    if (!s?.crm_until || String(s.crm_until).slice(0, 10) < getCalendarDateJST()) return { ok: false, error: 'フクエスCRM の契約中のお店だけ加盟店にできます' };
  }
  const { error } = await svc.from('salons').update({ points_member: on === true }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  // ★ お店ページの「加盟店」の札と、加盟店の一覧（/points）を作り直す
  revalidatePath(`/salon/${id}`);
  revalidatePath('/points');
  return { ok: true };
}

export type PointStatRow = { salonId: number | null; salonName: string; earned: number; earnedCount: number; used: number; usedCount: number; expired: number; revoked: number; claimsIssued: number; claimsTaken: number };

/** 月（YYYY-MM・日本時間）ごと・店ごとの集計 */
export async function getPointStats(month: string): Promise<{ ok: true; rows: PointStatRow[]; total: PointStatRow } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: '月が不正です' };
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600_000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) - 9 * 3600_000).toISOString();
  const svc = createServiceClient();
  const [pts, cls] = await Promise.all([
    svc.from('member_points').select('delta, kind, salon_id').gte('created_at', from).lt('created_at', to).limit(50000),
    svc.from('point_claims').select('salon_id, claimed_by').gte('created_at', from).lt('created_at', to).limit(50000),
  ]);
  if (pts.error) return { ok: false, error: pts.error.message };
  if (cls.error) return { ok: false, error: cls.error.message };
  const map = new Map<string, PointStatRow>();
  const get = (sid: number | null): PointStatRow => {
    const k = String(sid ?? '');
    let r = map.get(k);
    if (!r) { r = { salonId: sid, salonName: '', earned: 0, earnedCount: 0, used: 0, usedCount: 0, expired: 0, revoked: 0, claimsIssued: 0, claimsTaken: 0 }; map.set(k, r); }
    return r;
  };
  for (const p of pts.data ?? []) {
    const sid = p.salon_id == null ? null : Number(p.salon_id);
    const d = Number(p.delta) || 0;
    if (p.kind === 'visit') { const r = get(sid); r.earned += d; r.earnedCount += 1; }
    else if (p.kind === 'signup' || p.kind === 'review') { const r = get(null); r.earned += d; r.earnedCount += 1; } // ★ 第1450便: 会員登録・口コミ（お店なし）
    else if (p.kind === 'use') { const r = get(sid); r.used += -d; r.usedCount += 1; }
    else if (p.kind === 'refund') { const r = get(sid); r.used -= d; r.usedCount -= 1; } // ★ 第1454便: 利用の取り消し（ポイントを戻した分）
    else if (p.kind === 'expire') { get(null).expired += -d; }
    else if (p.kind === 'revoke') { get(sid).revoked += -d; }
  }
  for (const c of cls.data ?? []) {
    const r = get(Number(c.salon_id));
    r.claimsIssued += 1;
    if (c.claimed_by) r.claimsTaken += 1;
  }
  const ids = [...map.values()].map((r) => r.salonId).filter((n): n is number => typeof n === 'number');
  if (ids.length > 0) {
    const { data: s } = await svc.from('salons').select('id, name').in('id', ids);
    const names = new Map((s ?? []).map((r) => [Number(r.id), String(r.name ?? '')]));
    for (const r of map.values()) if (r.salonId != null) r.salonName = names.get(r.salonId) ?? `店舗 ${r.salonId}`;
  }
  const rows = [...map.values()].sort((a, b) => (a.salonId == null ? 1 : b.salonId == null ? -1 : a.salonId - b.salonId));
  const total = rows.reduce<PointStatRow>((t, r) => ({
    ...t,
    earned: t.earned + r.earned, earnedCount: t.earnedCount + r.earnedCount, used: t.used + r.used, usedCount: t.usedCount + r.usedCount,
    expired: t.expired + r.expired, revoked: t.revoked + r.revoked, claimsIssued: t.claimsIssued + r.claimsIssued, claimsTaken: t.claimsTaken + r.claimsTaken,
  }), { salonId: null, salonName: '合計', earned: 0, earnedCount: 0, used: 0, usedCount: 0, expired: 0, revoked: 0, claimsIssued: 0, claimsTaken: 0 });
  return { ok: true, rows, total };
}

export type PointFlagRow = { pointId: number; kind: 'visit' | 'use'; salonName: string; bookingId: string; delta: number; createdAt: string; reason: 'cancelled' | 'deleted'; revoked: boolean };

/** 直近90日の来店ポイント・ポイントの利用（第1454便）のうち、予約が取り消された・消されたもの */
export async function listFlaggedPoints(): Promise<{ ok: true; rows: PointFlagRow[] } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const svc = createServiceClient();
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data: pts, error } = await svc.from('member_points').select('id, kind, delta, salon_id, booking_id, created_at')
    .in('kind', ['visit', 'use']).gte('created_at', since).not('booking_id', 'is', null).limit(5000);
  if (error) return { ok: false, error: error.message };
  const list = pts ?? [];
  if (list.length === 0) return { ok: true, rows: [] };
  const bookingIds = [...new Set(list.map((p) => String(p.booking_id)))];
  const found = new Map<string, string>();
  for (let i = 0; i < bookingIds.length; i += 200) {
    const { data: b, error: bErr } = await svc.from('salon_bookings').select('id, status').in('id', bookingIds.slice(i, i + 200));
    if (bErr) return { ok: false, error: bErr.message };
    for (const r of b ?? []) found.set(String(r.id), String(r.status ?? ''));
  }
  const { data: rev } = await svc.from('member_points').select('booking_id, kind').in('kind', ['revoke', 'refund']).in('booking_id', bookingIds);
  // ★ 来店ポイントの取り消し＝revoke／利用の取り消し＝refund（第1454便）
  const revoked = new Set((rev ?? []).map((r) => `${r.kind === 'refund' ? 'use' : 'visit'}|${String(r.booking_id)}`));
  const flagged = list.filter((p) => !found.has(String(p.booking_id)) || found.get(String(p.booking_id)) === 'cancelled');
  const sids = [...new Set(flagged.map((p) => Number(p.salon_id)).filter((n) => n > 0))];
  const names = new Map<number, string>();
  if (sids.length > 0) {
    const { data: s } = await svc.from('salons').select('id, name').in('id', sids);
    for (const r of s ?? []) names.set(Number(r.id), String(r.name ?? ''));
  }
  return {
    ok: true,
    rows: flagged.map((p) => ({
      pointId: Number(p.id),
      kind: (p.kind === 'use' ? 'use' : 'visit') as 'visit' | 'use',
      salonName: names.get(Number(p.salon_id)) ?? '',
      bookingId: String(p.booking_id),
      delta: Number(p.delta),
      createdAt: String(p.created_at),
      reason: found.has(String(p.booking_id)) ? 'cancelled' : 'deleted',
      revoked: revoked.has(`${p.kind === 'use' ? 'use' : 'visit'}|${String(p.booking_id)}`),
    })),
  };
}

/**
 * 来店ポイントを手で取り消す（revoke の行を足す・同じ予約は1回まで）。
 * ★ 第1454便: ポイントの利用（use）なら「利用の取り消し」＝ refund の行（ポイントを会員に戻す）。CRM の「Pt−1,000」も消え、請求書でも差し引かない。
 */
export async function revokeVisitPoint(pointId: number): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const svc = createServiceClient();
  const { data: p, error } = await svc.from('member_points').select('id, user_id, delta, kind, salon_id, booking_id, business_date').eq('id', Math.trunc(Number(pointId))).maybeSingle();
  if (error || !p) return { ok: false, error: '記録が見つかりません' };
  if (p.kind === 'use') {
    const { count: rc } = await svc.from('member_points').select('id', { count: 'exact', head: true }).eq('kind', 'refund').eq('booking_id', String(p.booking_id));
    if ((rc ?? 0) > 0) return { ok: false, error: 'すでに取り消しています' };
    const { error: rErr } = await svc.from('member_points').insert({
      user_id: p.user_id, delta: -Number(p.delta), kind: 'refund', salon_id: p.salon_id, booking_id: p.booking_id, business_date: p.business_date, note: '運営が利用を取り消し（ポイントを戻した）',
    });
    if (rErr) return { ok: false, error: /member_points_kind_check/.test(rErr.message) ? '準備がまだです（追加SQL_第1454便を流してください）' : rErr.message };
    return { ok: true };
  }
  if (p.kind !== 'visit') return { ok: false, error: '来店ポイント・ポイントの利用だけ取り消せます' };
  const { count } = await svc.from('member_points').select('id', { count: 'exact', head: true }).eq('kind', 'revoke').eq('booking_id', String(p.booking_id));
  if ((count ?? 0) > 0) return { ok: false, error: 'すでに取り消しています' };
  const { error: insErr } = await svc.from('member_points').insert({
    user_id: p.user_id, delta: -Number(p.delta), kind: 'revoke', salon_id: p.salon_id, booking_id: p.booking_id, business_date: p.business_date, note: '運営が取り消し（予約の取り消し・削除）',
  });
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}
