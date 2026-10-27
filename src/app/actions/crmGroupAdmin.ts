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
import { checkCrmGroupName, checkCrmGroupMember, CRM_GROUP_NOTE_MAX, CRM_GROUP_CORP_NAME_MAX } from '@/lib/crmGroup';
// ★ 第1328便: 画面での申込み（署名待ちで入れる・取りやめる・署名の記録を見る）
import { CRM_GROUP_APPLY_VERSION, crmGroupApplyValid, crmGroupInviteeCanSign, crmGroupMemberAnswer, type CrmGroupParty, type CrmGroupSig } from '@/lib/crmGroupApply';
import { crmGroupTableMissing } from '@/app/lib/crm/groupAlerts';
import { loadCrmGroupJoinState } from '@/app/lib/crm/groupJoin';

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
  /** 署名待ち・断られた店（第1328便・画面での申込み） */
  invites: CrmGroupInviteAdminRow[];
};
/** 運営の画面に出す「署名待ち」1件 */
export type CrmGroupInviteAdminRow = {
  id: number;
  salonId: number;
  salonName: string;
  corpName: string;
  crmUntil: string | null;
  status: 'pending' | 'declined';
  createdAt: string;
  closedAt: string | null;
  /** この店の、申込書への署名が済んでいるか（今の版・今の顔ぶれで） */
  applied: boolean;
  /** 今いる店の承認（あとから足す店のときだけ）。done＝認めた数／total＝今いる店の数 */
  approvals: { done: number; total: number } | null;
  /** この店の画面に、申込書が出ているか */
  shown: boolean;
};

/** グループの一覧（運営）。★ 表がまだ無ければ ready: false */
export async function adminListCrmGroups(): Promise<{ ok: true; ready: boolean; /** 追加SQL_第1328便（画面での申込みの表）が流れているか */ invitesReady: boolean; applyVersion: string; groups: CrmGroupRow[] } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const svc = createServiceClient();
  const { data: gs, error: gErr } = await svc.from('crm_groups')
    .select('id, name, note, created_at, ended_at').order('id', { ascending: false });
  if (tableMissing(gErr)) return { ok: true, ready: false, invitesReady: false, applyVersion: CRM_GROUP_APPLY_VERSION, groups: [] };
  if (gErr) return { ok: false, error: 'グループを読めませんでした: ' + gErr.message };
  const ids = (gs ?? []).map((g) => Number(g.id));
  // ★ 第1328便: 署名待ちの表があるか（★ 無いあいだは、画面での申込みの口を出さない）
  const probe = await svc.from('crm_group_invites').select('id').limit(1);
  const invitesReady = !probe.error;
  if (probe.error && !crmGroupTableMissing(probe.error, probe.status)) return { ok: false, error: '署名待ちを読めませんでした: ' + probe.error.message };
  if (ids.length === 0) return { ok: true, ready: true, invitesReady, applyVersion: CRM_GROUP_APPLY_VERSION, groups: [] };

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

  // ★ 第1328便: 署名待ち・断られた店（続いているグループの分だけ）
  const invitesOf = new Map<number, CrmGroupInviteAdminRow[]>();
  if (invitesReady) {
    const liveIds = (gs ?? []).filter((g) => !g.ended_at).map((g) => Number(g.id));
    if (liveIds.length > 0) {
      const iRes = await svc.from('crm_group_invites')
        .select('id, group_id, salon_id, corp_name, status, created_at, closed_at, salons(name, crm_until)')
        .in('group_id', liveIds).in('status', ['pending', 'declined']).order('id', { ascending: true });
      if (iRes.error) return { ok: false, error: '署名待ちを読めませんでした: ' + iRes.error.message };
      const rows = (iRes.data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const gid of [...new Set(rows.map((r) => Number(r.group_id)))]) {
        const st = await loadCrmGroupJoinState(svc, gid);
        const memberIds = st.ok ? st.state.members.map((m) => m.salonId) : [];
        const pend = st.ok ? st.state.invites : [];
        const sigs: CrmGroupSig[] = st.ok ? st.state.sigs : [];
        invitesOf.set(gid, rows.filter((r) => Number(r.group_id) === gid).map((r) => {
          const s = r.salons as { name?: string | null; crm_until?: string | null } | Array<{ name?: string | null; crm_until?: string | null }> | null;
          const salon = Array.isArray(s) ? s[0] : s;
          const lite = { id: Number(r.id), salonId: Number(r.salon_id) };
          const pending = r.status === 'pending';
          return {
            id: lite.id, salonId: lite.salonId, salonName: salon?.name ?? '', corpName: String(r.corp_name ?? ''),
            crmUntil: salon?.crm_until ?? null,
            status: pending ? 'pending' as const : 'declined' as const,
            createdAt: String(r.created_at ?? ''), closedAt: (r.closed_at as string | null) ?? null,
            applied: pending && crmGroupApplyValid(sigs, memberIds, pend, lite, CRM_GROUP_APPLY_VERSION),
            approvals: pending && memberIds.length > 0
              ? { done: memberIds.filter((m) => crmGroupMemberAnswer(sigs, lite.id, m) === 'approve').length, total: memberIds.length }
              : null,
            shown: pending && crmGroupInviteeCanSign(sigs, memberIds, pend, lite),
          };
        }));
      }
    }
  }

  return {
    ok: true, ready: true, invitesReady, applyVersion: CRM_GROUP_APPLY_VERSION,
    groups: (gs ?? []).map((g) => ({
      id: Number(g.id), name: String(g.name ?? ''), note: String(g.note ?? ''),
      createdAt: String(g.created_at ?? ''), endedAt: (g.ended_at as string | null) ?? null,
      members: membersOf.get(Number(g.id)) ?? [], alertCount: countOf.get(Number(g.id)) ?? 0,
      invites: invitesOf.get(Number(g.id)) ?? [],
    })),
  };
}

/**
 * 店を「署名待ち」で入れる（運営）＝ その店の CRM の画面に、申込書（か、今いる店への確認）を出す。
 * ★ 入れただけでは、共有は使えない。全部の署名・承認がそろった時に、グループに入る（決まりは src/lib/crmGroupApply.ts）。
 * ★ 1店が署名待ちでいられるのは1つだけ・どこかのグループに入っている店は入れられない（DB の索引が最後の番）。
 */
export async function adminInviteCrmGroupMember(input: { groupId: number; salonId: number; corpName: string }): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const groupId = Number(input.groupId), salonId = Number(input.salonId);
  if (!Number.isInteger(groupId) || groupId <= 0) return { ok: false, error: 'グループが不正です' };
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗を選んでください' };
  const corp = String(input.corpName ?? '').trim();
  if (corp.length === 0) return { ok: false, error: '運営者（法人名。個人なら屋号かお名前）を入れてください' };
  if (corp.length > CRM_GROUP_CORP_NAME_MAX) return { ok: false, error: '運営者の欄は' + CRM_GROUP_CORP_NAME_MAX + '文字までです' };
  const svc = createServiceClient();

  const { data: g, error: gErr } = await svc.from('crm_groups').select('id, ended_at').eq('id', groupId).maybeSingle();
  if (gErr) return { ok: false, error: 'グループを読めませんでした: ' + gErr.message };
  if (!g) return { ok: false, error: 'グループが見つかりません' };
  if (g.ended_at) return { ok: false, error: 'このグループは終わっています' };
  const { data: s, error: sErr } = await svc.from('salons').select('id, crm_until').eq('id', salonId).maybeSingle();
  if (sErr) return { ok: false, error: '店舗を読めませんでした: ' + sErr.message };
  if (!s) return { ok: false, error: '店舗が見つかりません' };
  const { data: mem, error: mErr } = await svc.from('crm_group_members').select('id').eq('salon_id', salonId).is('left_at', null).limit(1);
  if (mErr) return { ok: false, error: '読めませんでした: ' + mErr.message };
  if ((mem ?? []).length > 0) return { ok: false, error: 'この店は、もうどこかのグループに入っています（1店が入れるグループは1つだけです）' };
  // ★ 書く前に読んで確かめる（表が無いとき、書くほうのエラーは見分けられない）
  const cur = await svc.from('crm_group_invites').select('id').eq('salon_id', salonId).eq('status', 'pending').limit(1);
  if (cur.error) return { ok: false, error: crmGroupTableMissing(cur.error, cur.status) ? '追加SQL_第1328便 がまだ流れていません' : '読めませんでした: ' + cur.error.message };
  if ((cur.data ?? []).length > 0) return { ok: false, error: 'この店は、もう署名待ちになっています' };

  const { error } = await svc.from('crm_group_invites').insert({ group_id: groupId, salon_id: salonId, corp_name: corp });
  if (error) return { ok: false, error: error.code === '23505' ? 'この店は、もう署名待ちになっています' : '入れられませんでした: ' + error.message };
  return { ok: true };
}

/** 署名待ちを取りやめる（運営）。★ 済んだ署名・承認の記録は消えない（追記専用） */
export async function adminCancelCrmGroupInvite(input: { inviteId: number }): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Number(input.inviteId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: '対象が不正です' };
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_group_invites')
    .update({ status: 'cancelled', closed_at: new Date().toISOString() }).eq('id', id).in('status', ['pending', 'declined']).select('id');
  if (error) return { ok: false, error: '取りやめられませんでした: ' + error.message };
  if (!data || data.length === 0) return { ok: false, error: 'もう済んでいます（入った・取りやめた）' };
  return { ok: true };
}

/** 署名・承認の記録1件（運営が見る・印刷する） */
export type CrmGroupSignatureRow = {
  id: number;
  inviteId: number;
  salonId: number;
  salonName: string;
  kind: 'apply' | 'approve' | 'decline';
  signerName: string;
  docVersion: string;
  docBody: string;
  parties: CrmGroupParty[];
  createdAt: string;
};

/** そのグループの、署名・承認の記録（運営）。新しい順 */
export async function adminListCrmGroupSignatures(input: { groupId: number }): Promise<{ ok: true; rows: CrmGroupSignatureRow[] } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const groupId = Number(input.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) return { ok: false, error: 'グループが不正です' };
  const svc = createServiceClient();
  const res = await svc.from('crm_group_signatures')
    .select('id, invite_id, salon_id, kind, signer_name, doc_version, doc_body, parties, created_at')
    .eq('group_id', groupId).order('id', { ascending: false }).limit(200);
  if (res.error) return crmGroupTableMissing(res.error, res.status) ? { ok: true, rows: [] } : { ok: false, error: '記録を読めませんでした: ' + res.error.message };
  const rows = (res.data ?? []) as Array<Record<string, unknown>>;
  const ids = [...new Set(rows.map((r) => Number(r.salon_id)))];
  const nameOf = new Map<number, string>();
  if (ids.length > 0) {
    const { data } = await svc.from('salons').select('id, name').in('id', ids);
    for (const s of data ?? []) nameOf.set(Number(s.id), String((s.name as string | null) ?? ''));
  }
  return {
    ok: true,
    rows: rows.flatMap((r) => {
      const kind = r.kind;
      if (kind !== 'apply' && kind !== 'approve' && kind !== 'decline') return [];
      const parties = (Array.isArray(r.parties) ? r.parties : []).map((p) => {
        const o = (p ?? {}) as { salonId?: unknown; name?: unknown; corp?: unknown };
        return { salonId: Number(o.salonId) || 0, name: String(o.name ?? ''), corp: String(o.corp ?? '') };
      });
      return [{
        id: Number(r.id), inviteId: Number(r.invite_id), salonId: Number(r.salon_id), salonName: nameOf.get(Number(r.salon_id)) ?? '',
        kind, signerName: String(r.signer_name ?? ''), docVersion: String(r.doc_version ?? ''), docBody: String(r.doc_body ?? ''),
        parties, createdAt: String(r.created_at ?? ''),
      }];
    }),
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
  // ★ 第1328便: 署名待ちも取りやめる（終わったグループの申込書を、店の画面に残さない）。★ 書く前に読んで確かめる（表が無ければ、署名待ちそのものが無い）
  {
    const pend = await svc.from('crm_group_invites').select('id').eq('group_id', id).eq('status', 'pending');
    if (pend.error && !crmGroupTableMissing(pend.error, pend.status)) return { ok: false, error: '署名待ちを読めなかったので、終わらせていません: ' + pend.error.message };
    if (!pend.error && (pend.data ?? []).length > 0) {
      const c = await svc.from('crm_group_invites').update({ status: 'cancelled', closed_at: nowIso }).eq('group_id', id).eq('status', 'pending');
      if (c.error) return { ok: false, error: '署名待ちを取りやめられなかったので、終わらせていません: ' + c.error.message };
    }
  }
  const { error: lErr } = await svc.from('crm_group_members').update({ left_at: nowIso }).eq('group_id', id).is('left_at', null);
  if (lErr) return { ok: false, error: '店を外せませんでした: ' + lErr.message };
  const { error } = await svc.from('crm_groups').update({ ended_at: nowIso }).eq('id', id).is('ended_at', null);
  if (error) return { ok: false, error: '終わらせられませんでした: ' + error.message };
  await writeLog(svc, { groupId: id, action: 'group_end', actor: 'admin', detail: { left: (ms ?? []).length, withdrawn } });
  return { ok: true, left: (ms ?? []).length, withdrawn };
}
