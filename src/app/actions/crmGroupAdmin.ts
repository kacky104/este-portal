'use server';

// 運営（/admin）から、フクエスCRM の「グループ・提携店」を作る・店を入れる・外す（第1324便・2026-10-09・カッキーさん）。
//   設計は 設計メモ_グループで共有するNG・要注意リスト_2026-10-09.md。決まりは src/lib/crmGroup.ts。表は 追加SQL_第1324便。
//
// ★★★ グループは運営だけが作る。店舗様の画面には「グループを作る」「店を誘う」を置かない。
//   ★ 全部の店のサインがそろった契約書を受け取ってから、ここで店を入れる（法人名と受け取った日が無ければ入れられない）。
// ★★ 守り: requireAdmin（ADMIN_UUID 照合）＋ service_role。importSourceAdmin.ts と同じ作法。
//   ★ 5つの表は anon／authenticated に一切開いていない（RLS 有効・ポリシーなし）ので、サーバー以外からは読めも書けもしない。
// ★★★ どの店とどの店が同じグループか（提携しているか）は秘密の情報。
//   ★ ここから返す先は /admin（運営）だけ。★ 記録（crm_group_logs）には、店の名前・法人名を入れない（番号だけ）。
// ★ 店を外した・グループを終わらせたときは、その店が出していた共有を、その場で取り下げる（ほかの店から見えなくする）。
//   ★ 行そのものを消すのは、あとの便（90日後）。ここでは消さない。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { checkCrmGroupName, checkCrmGroupMember, CRM_GROUP_NOTE_MAX } from '@/lib/crmGroup';

type Err = { ok: false; error: string };
type Svc = ReturnType<typeof createServiceClient>;

async function requireAdmin(): Promise<{ ok: true; uid: string } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true, uid: user.id };
}

/** 表がまだ無い（追加SQL_第1324便の前）か。★ 42P01＝Postgres／PGRST205＝PostgREST の表の一覧に無い */
function tableMissing(e: { code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205');
}

type LogAction = 'group_create' | 'group_edit' | 'group_end' | 'member_join' | 'member_leave';

/** 記録を1行足す。★ 書けなくても操作は止めない（黙らずにサーバーのログへ出す）。★ 名前は入れない（番号と数だけ） */
async function writeLog(svc: Svc, row: { groupId: number; salonId?: number | null; action: LogAction; actor: string; detail?: Record<string, number | string | boolean> }): Promise<void> {
  const { error } = await svc.from('crm_group_logs').insert({
    group_id: row.groupId, salon_id: row.salonId ?? null, action: row.action, actor: row.actor, detail: row.detail ?? null,
  });
  if (error) console.error('[crmGroupAdmin] 記録を書けなかった', row.action, row.groupId, error.message);
}

/** その店がそのグループへ出していた共有を、取り下げる（ほかの店から見えなくする）。★ 消さない */
async function withdrawSalonAlerts(svc: Svc, groupId: number, salonId: number, uid: string): Promise<{ count: number; error: string | null }> {
  const { data, error } = await svc.from('crm_group_alerts')
    .update({ withdrawn_at: new Date().toISOString(), withdrawn_by: uid, withdrawn_reason: 'left' })
    .eq('group_id', groupId).eq('salon_id', salonId).is('withdrawn_at', null)
    .select('id');
  if (error) return { count: 0, error: error.message };
  return { count: (data ?? []).length, error: null };
}

export type CrmGroupMemberRow = {
  id: number;
  salonId: number;
  salonName: string;
  /** その店がフクエスCRMを契約しているか（していない店を入れても、共有は見えない） */
  crmUntil: string | null;
  corpName: string;
  agreedOn: string;
  joinedAt: string;
  leftAt: string | null;
};
export type CrmGroupRow = {
  id: number;
  name: string;
  note: string;
  createdAt: string;
  endedAt: string | null;
  members: CrmGroupMemberRow[];
  /** いま有効な共有の件数（中身は運営にも出さない） */
  alertCount: number;
};

/** グループの一覧（運営）。★ 表がまだ無ければ ready: false */
export async function adminListCrmGroups(): Promise<{ ok: true; ready: boolean; groups: CrmGroupRow[] } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const svc = createServiceClient();
  const { data: gs, error: gErr } = await svc.from('crm_groups')
    .select('id, name, note, created_at, ended_at').order('id', { ascending: false });
  if (tableMissing(gErr)) return { ok: true, ready: false, groups: [] };
  if (gErr) return { ok: false, error: 'グループを読めませんでした: ' + gErr.message };
  const ids = (gs ?? []).map((g) => Number(g.id));
  if (ids.length === 0) return { ok: true, ready: true, groups: [] };

  const [mRes, aRes] = await Promise.all([
    svc.from('crm_group_members')
      .select('id, group_id, salon_id, corp_name, agreed_on, joined_at, left_at, salons(name, crm_until)')
      .in('group_id', ids).order('joined_at', { ascending: true }),
    svc.from('crm_group_alerts').select('group_id').in('group_id', ids).is('withdrawn_at', null),
  ]);
  if (mRes.error) return { ok: false, error: 'グループの店を読めませんでした: ' + mRes.error.message };
  if (aRes.error) return { ok: false, error: '共有の件数を読めませんでした: ' + aRes.error.message };

  const membersOf = new Map<number, CrmGroupMemberRow[]>();
  for (const r of (mRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const s = r.salons as { name?: string | null; crm_until?: string | null } | Array<{ name?: string | null; crm_until?: string | null }> | null;
    const salon = Array.isArray(s) ? s[0] : s;
    const gid = Number(r.group_id);
    const list = membersOf.get(gid) ?? [];
    list.push({
      id: Number(r.id), salonId: Number(r.salon_id), salonName: salon?.name ?? '',
      crmUntil: salon?.crm_until ?? null,
      corpName: String(r.corp_name ?? ''), agreedOn: String(r.agreed_on ?? ''),
      joinedAt: String(r.joined_at ?? ''), leftAt: (r.left_at as string | null) ?? null,
    });
    membersOf.set(gid, list);
  }
  const countOf = new Map<number, number>();
  for (const r of (aRes.data ?? []) as Array<{ group_id: number }>) countOf.set(Number(r.group_id), (countOf.get(Number(r.group_id)) ?? 0) + 1);

  return {
    ok: true, ready: true,
    groups: (gs ?? []).map((g) => ({
      id: Number(g.id), name: String(g.name ?? ''), note: String(g.note ?? ''),
      createdAt: String(g.created_at ?? ''), endedAt: (g.ended_at as string | null) ?? null,
      members: membersOf.get(Number(g.id)) ?? [], alertCount: countOf.get(Number(g.id)) ?? 0,
    })),
  };
}

/** グループを作る（運営）。★ 作っただけでは何も起きない（店を入れてはじめて、その店どうしで共有できる） */
export async function adminCreateCrmGroup(input: { name: string; note?: string }): Promise<{ ok: true; id: number } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const c = checkCrmGroupName(input.name);
  if (!c.ok) return c;
  const note = String(input.note ?? '').trim();
  if (note.length > CRM_GROUP_NOTE_MAX) return { ok: false, error: '覚え書きは' + CRM_GROUP_NOTE_MAX + '文字までです' };
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_groups').insert({ name: input.name.trim(), note }).select('id').single();
  if (tableMissing(error)) return { ok: false, error: '追加SQL_第1324便 がまだ流れていません' };
  if (error || !data) return { ok: false, error: 'グループを作れませんでした: ' + (error?.message ?? '') };
  await writeLog(svc, { groupId: Number(data.id), action: 'group_create', actor: 'admin' });
  return { ok: true, id: Number(data.id) };
}

/** グループの名前・覚え書きを直す（運営）。 */
export async function adminUpdateCrmGroup(input: { id: number; name: string; note?: string }): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'グループが不正です' };
  const c = checkCrmGroupName(input.name);
  if (!c.ok) return c;
  const note = String(input.note ?? '').trim();
  if (note.length > CRM_GROUP_NOTE_MAX) return { ok: false, error: '覚え書きは' + CRM_GROUP_NOTE_MAX + '文字までです' };
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_groups').update({ name: input.name.trim(), note }).eq('id', id).select('id');
  if (error) return { ok: false, error: '直せませんでした: ' + error.message };
  if (!data || data.length === 0) return { ok: false, error: 'グループが見つかりません' };
  await writeLog(svc, { groupId: id, action: 'group_edit', actor: 'admin' });
  return { ok: true };
}

/**
 * 店をグループへ入れる（運営）。
 * ★★★ 法人名と、契約書を受け取った日が無ければ入れない。★ 1店が入れるグループは1つだけ（DB の索引が最後の番）。
 */
export async function adminAddCrmGroupMember(input: { groupId: number; salonId: number; corpName: string; agreedOn: string }): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const groupId = Number(input.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) return { ok: false, error: 'グループが不正です' };
  const c = checkCrmGroupMember(input, getCalendarDateJST());
  if (!c.ok) return c;
  const salonId = Number(input.salonId);
  const svc = createServiceClient();

  const { data: g, error: gErr } = await svc.from('crm_groups').select('id, ended_at').eq('id', groupId).maybeSingle();
  if (gErr) return { ok: false, error: 'グループを読めませんでした: ' + gErr.message };
  if (!g) return { ok: false, error: 'グループが見つかりません' };
  if (g.ended_at) return { ok: false, error: 'このグループは終わっています' };
  const { data: s, error: sErr } = await svc.from('salons').select('id').eq('id', salonId).maybeSingle();
  if (sErr) return { ok: false, error: '店舗を読めませんでした: ' + sErr.message };
  if (!s) return { ok: false, error: '店舗が見つかりません' };

  const { error } = await svc.from('crm_group_members').insert({
    group_id: groupId, salon_id: salonId, corp_name: input.corpName.trim(), agreed_on: input.agreedOn,
  });
  // 23505 = unique_violation（crm_group_members_one_active）
  if (error?.code === '23505') return { ok: false, error: 'この店は、もうグループに入っています（1店が入れるグループは1つだけです）' };
  if (error) return { ok: false, error: '入れられませんでした: ' + error.message };
  await writeLog(svc, { groupId, salonId, action: 'member_join', actor: 'admin', detail: { agreedOn: input.agreedOn } });
  return { ok: true };
}

/**
 * 店をグループから外す（運営）。
 * ★★ その店が出していた共有は、その場で取り下げる（ほかの店から見えなくなる）。その店からも、グループの共有は見えなくなる。
 */
export async function adminRemoveCrmGroupMember(input: { memberId: number }): Promise<{ ok: true; withdrawn: number } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const memberId = Number(input.memberId);
  if (!Number.isInteger(memberId) || memberId <= 0) return { ok: false, error: '対象が不正です' };
  const svc = createServiceClient();
  const { data: m, error: mErr } = await svc.from('crm_group_members').select('id, group_id, salon_id, left_at').eq('id', memberId).maybeSingle();
  if (mErr) return { ok: false, error: '読めませんでした: ' + mErr.message };
  if (!m) return { ok: false, error: '見つかりません' };
  if (m.left_at) return { ok: false, error: 'もう外してあります' };
  const groupId = Number(m.group_id), salonId = Number(m.salon_id);

  // ★ 先に共有を取り下げる（外したのに、共有だけ見え続ける瞬間を作らない）
  const w = await withdrawSalonAlerts(svc, groupId, salonId, a.uid);
  if (w.error) return { ok: false, error: '共有を取り下げられなかったので、外していません: ' + w.error };
  const { error } = await svc.from('crm_group_members').update({ left_at: new Date().toISOString() }).eq('id', memberId).is('left_at', null);
  if (error) return { ok: false, error: '外せませんでした: ' + error.message };
  await writeLog(svc, { groupId, salonId, action: 'member_leave', actor: 'admin', detail: { withdrawn: w.count } });
  return { ok: true, withdrawn: w.count };
}

/**
 * グループを終わらせる（運営）。★ 入っている店を全部外し、出ていた共有を全部取り下げる。★ 行は消さない。
 */
export async function adminEndCrmGroup(input: { id: number }): Promise<{ ok: true; left: number; withdrawn: number } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'グループが不正です' };
  const svc = createServiceClient();
  const { data: g, error: gErr } = await svc.from('crm_groups').select('id, ended_at').eq('id', id).maybeSingle();
  if (gErr) return { ok: false, error: 'グループを読めませんでした: ' + gErr.message };
  if (!g) return { ok: false, error: 'グループが見つかりません' };
  if (g.ended_at) return { ok: false, error: 'もう終わっています' };

  const { data: ms, error: msErr } = await svc.from('crm_group_members').select('id, salon_id').eq('group_id', id).is('left_at', null);
  if (msErr) return { ok: false, error: 'グループの店を読めませんでした: ' + msErr.message };
  let withdrawn = 0;
  for (const m of (ms ?? []) as Array<{ id: number; salon_id: number }>) {
    const w = await withdrawSalonAlerts(svc, id, Number(m.salon_id), a.uid);
    if (w.error) return { ok: false, error: '共有を取り下げられなかったので、終わらせていません: ' + w.error };
    withdrawn += w.count;
  }
  const nowIso = new Date().toISOString();
  const { error: lErr } = await svc.from('crm_group_members').update({ left_at: nowIso }).eq('group_id', id).is('left_at', null);
  if (lErr) return { ok: false, error: '店を外せませんでした: ' + lErr.message };
  const { error } = await svc.from('crm_groups').update({ ended_at: nowIso }).eq('id', id).is('ended_at', null);
  if (error) return { ok: false, error: '終わらせられませんでした: ' + error.message };
  await writeLog(svc, { groupId: id, action: 'group_end', actor: 'admin', detail: { left: (ms ?? []).length, withdrawn } });
  return { ok: true, left: (ms ?? []).length, withdrawn };
}
