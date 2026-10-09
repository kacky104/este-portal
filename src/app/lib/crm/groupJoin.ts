// フクエスCRM「グループ・提携店の共有」を、画面で申し込む・承認するときの、サーバーの下請け（第1328便・2026-10-09）。
//   ★ 'use server' ではない（svc を受け取る）。呼ぶ側（actions/crmGroupJoin.ts・crmGroupAdmin.ts・crm.ts）が、先に本人確認をすること。
//   決まりは src/lib/crmGroupApply.ts（純粋関数）。表は 追加SQL_第1328便。
//
// ★★★ 店の名前（参加店の一覧）は、申込み・承認の画面と、運営の画面にだけ返す。ほかの口へ流さない。
// ★ 表がまだ無い（追加SQL_第1328便の前）ときは「署名待ちは無い」として扱う（画面を壊さない）。
// ★★ 書く前に読んで確かめる（表が無いとき、書くほうのエラーは PostgREST の版によって見分けられない）。

import type { createServiceClient } from '@/app/lib/supabase/service';
import { crmGroupTableMissing, readCrmGroupMembership } from '@/app/lib/crm/groupAlerts';
import {
  CRM_GROUP_APPLY_VERSION,
  crmGroupApplyValid, crmGroupInviteeCanSign, crmGroupMemberAnswer, planCrmGroupJoins,
  type CrmGroupParty, type CrmGroupSig, type CrmGroupSigKind,
} from '@/lib/crmGroupApply';

type Svc = ReturnType<typeof createServiceClient>;

export type CrmGroupInviteRow = { id: number; salonId: number; corpName: string };
export type CrmGroupMemberLite = { salonId: number; corpName: string };

export type CrmGroupJoinState = {
  groupId: number;
  members: CrmGroupMemberLite[];
  /** 署名待ち（古い順） */
  invites: CrmGroupInviteRow[];
  /** 署名待ちへの署名・承認の記録 */
  sigs: CrmGroupSig[];
};

function toSig(r: Record<string, unknown>): CrmGroupSig | null {
  const kind = r.kind;
  if (kind !== 'apply' && kind !== 'approve' && kind !== 'decline') return null;
  const parties = Array.isArray(r.parties) ? r.parties : [];
  return {
    id: Number(r.id),
    inviteId: Number(r.invite_id),
    salonId: Number(r.salon_id),
    kind: kind as CrmGroupSigKind,
    version: String(r.doc_version ?? ''),
    partyIds: parties.map((p) => Number((p as { salonId?: unknown })?.salonId)).filter((n) => Number.isInteger(n) && n > 0),
  };
}

/** グループの、いまの顔ぶれと署名待ち。★ 表が無ければ missing: true */
export async function loadCrmGroupJoinState(svc: Svc, groupId: number): Promise<{ ok: true; state: CrmGroupJoinState } | { ok: false; missing: boolean; message: string }> {
  const [mRes, iRes] = await Promise.all([
    svc.from('crm_group_members').select('salon_id, corp_name').eq('group_id', groupId).is('left_at', null).order('id', { ascending: true }),
    svc.from('crm_group_invites').select('id, salon_id, corp_name').eq('group_id', groupId).eq('status', 'pending').order('id', { ascending: true }),
  ]);
  if (mRes.error) return { ok: false, missing: crmGroupTableMissing(mRes.error, mRes.status), message: mRes.error.message };
  if (iRes.error) return { ok: false, missing: crmGroupTableMissing(iRes.error, iRes.status), message: iRes.error.message };
  const members = (mRes.data ?? []).map((r) => ({ salonId: Number(r.salon_id), corpName: String(r.corp_name ?? '') }));
  const invites = (iRes.data ?? []).map((r) => ({ id: Number(r.id), salonId: Number(r.salon_id), corpName: String(r.corp_name ?? '') }));
  let sigs: CrmGroupSig[] = [];
  if (invites.length > 0) {
    const sRes = await svc.from('crm_group_signatures')
      .select('id, invite_id, salon_id, kind, doc_version, parties')
      .in('invite_id', invites.map((i) => i.id)).order('id', { ascending: true });
    if (sRes.error) return { ok: false, missing: crmGroupTableMissing(sRes.error, sRes.status), message: sRes.error.message };
    sigs = ((sRes.data ?? []) as Array<Record<string, unknown>>).map(toSig).filter((s): s is CrmGroupSig => s !== null);
  }
  return { ok: true, state: { groupId, members, invites, sigs } };
}

/** 参加店の一覧（名前つき）。★★★ 申込み・承認の画面と記録、運営の画面にだけ使う */
export async function crmGroupPartiesOf(svc: Svc, list: ReadonlyArray<{ salonId: number; corpName: string }>): Promise<CrmGroupParty[]> {
  const ids = [...new Set(list.map((x) => x.salonId))];
  if (ids.length === 0) return [];
  const { data } = await svc.from('salons').select('id, name').in('id', ids);
  const nameOf = new Map((data ?? []).map((s) => [Number(s.id), String((s.name as string | null) ?? '')]));
  return list.map((x) => ({ salonId: x.salonId, name: nameOf.get(x.salonId) || '店舗' + x.salonId, corp: x.corpName }));
}

/** いま申込書に載る参加店（最初: 署名待ちの全部／あとから足す: 今いる店＋足す店） */
export function crmGroupPartyRowsFor(state: CrmGroupJoinState, invite: CrmGroupInviteRow): Array<{ salonId: number; corpName: string }> {
  if (state.members.length === 0) return state.invites.map((i) => ({ salonId: i.salonId, corpName: i.corpName }));
  return [...state.members, { salonId: invite.salonId, corpName: invite.corpName }];
}

/**
 * そろった署名待ちを、グループに入れる。
 * ★ 決めるのは planCrmGroupJoins（純粋関数）。ここは、その通りに入れるだけ。
 * ★ 同時に2店が押しても、二重に入らない（crm_group_members の「入っている行は1店1つ」の索引が止める → 23505 は「もう入った」として扱う）。
 * @returns 入れた店の数
 */
export async function completeCrmGroupJoins(svc: Svc, groupId: number, todayISO: string): Promise<{ joined: number; error: string | null }> {
  let joined = 0;
  for (let round = 0; round < 20; round++) {
    const st = await loadCrmGroupJoinState(svc, groupId);
    if (!st.ok) return { joined, error: st.missing ? null : st.message };
    const { members, invites, sigs } = st.state;
    const plan = planCrmGroupJoins({ memberIds: members.map((m) => m.salonId), invites, sigs, version: CRM_GROUP_APPLY_VERSION });
    if (plan.length === 0) return { joined, error: null };
    // 最初の顔ぶれは、全部いっしょに入れる。あとから足す店は、1店ずつ（入れたら、顔ぶれを読み直す）
    const batch = members.length === 0 ? plan : plan.slice(0, 1);
    const rows = batch.map((id) => invites.find((i) => i.id === id)).filter((i): i is CrmGroupInviteRow => !!i);
    const ins = await svc.from('crm_group_members')
      .insert(rows.map((i) => ({ group_id: groupId, salon_id: i.salonId, corp_name: i.corpName, agreed_on: todayISO })))
      .select('id, salon_id');
    if (ins.error) {
      if (ins.error.code === '23505') return { joined, error: null }; // ほかの人の操作で、もう入った
      return { joined, error: ins.error.message };
    }
    const nowIso = new Date().toISOString();
    for (const m of ins.data ?? []) {
      const inv = rows.find((i) => i.salonId === Number(m.salon_id));
      if (!inv) continue;
      const up = await svc.from('crm_group_invites')
        .update({ status: 'joined', closed_at: nowIso, member_id: Number(m.id) }).eq('id', inv.id).eq('status', 'pending');
      if (up.error) console.error('[crmGroupJoin] 署名待ちを「入った」に直せなかった', inv.id, up.error.message);
      const lg = await svc.from('crm_group_logs').insert({
        group_id: groupId, salon_id: inv.salonId, action: 'member_join', actor: 'system', detail: { via: 'screen', inviteId: inv.id },
      });
      if (lg.error) console.error('[crmGroupJoin] 記録を書けなかった', inv.id, lg.error.message);
      joined++;
    }
  }
  return { joined, error: null };
}

export type CrmGroupAccess = {
  /** グループに入っている（共有が使える） */
  inGroup: boolean;
  /** 申込み・承認の画面を見られる（署名待ちで、申込書を出してよい／入っている） */
  groupPending: boolean;
  /** この店が、まだ返事をしていないこと（署名・承認）の数 */
  groupTodo: number;
};

/**
 * CRM の入口で使う: この店に「グループ共有」のタブを出すか・赤い印を付けるか。
 * ★ 読めなかったときは「何も無い」として扱う（中身の口が、別に確かめる）。
 * ★★★ あとから足される店には、今いる全部の店が認めるまで、何も出さない（crmGroupInviteeCanSign）。
 */
export async function readCrmGroupAccess(svc: Svc, salonId: number): Promise<CrmGroupAccess> {
  const none: CrmGroupAccess = { inGroup: false, groupPending: false, groupTodo: 0 };
  const m = await readCrmGroupMembership(svc, salonId);
  if (m.state === 'error') return none;
  if (m.state === 'in') {
    // ★ 入口は毎ページで通るので、読むのは最小限に（署名待ちが無ければ、ここで終わり）
    const inGroup: CrmGroupAccess = { inGroup: true, groupPending: false, groupTodo: 0 };
    const iRes = await svc.from('crm_group_invites').select('id').eq('group_id', m.groupId).eq('status', 'pending');
    if (iRes.error || (iRes.data ?? []).length === 0) return inGroup;
    const ids = (iRes.data ?? []).map((r) => Number(r.id));
    const sRes = await svc.from('crm_group_signatures').select('id, invite_id, salon_id, kind, doc_version, parties')
      .in('invite_id', ids).eq('salon_id', salonId).in('kind', ['approve', 'decline']);
    if (sRes.error) return inGroup;
    const sigs = ((sRes.data ?? []) as Array<Record<string, unknown>>).map(toSig).filter((x): x is CrmGroupSig => x !== null);
    return { ...inGroup, groupTodo: ids.filter((id) => crmGroupMemberAnswer(sigs, id, salonId) === null).length };
  }
  const inv = await svc.from('crm_group_invites').select('id, group_id').eq('salon_id', salonId).eq('status', 'pending').limit(1).maybeSingle();
  if (inv.error || !inv.data) return none;
  const inviteId = Number(inv.data.id);
  const st = await loadCrmGroupJoinState(svc, Number(inv.data.group_id));
  if (!st.ok) return none;
  const mine = st.state.invites.find((i) => i.id === inviteId);
  if (!mine) return none;
  const memberIds = st.state.members.map((x) => x.salonId);
  if (!crmGroupInviteeCanSign(st.state.sigs, memberIds, st.state.invites, mine)) return none;
  const signed = crmGroupApplyValid(st.state.sigs, memberIds, st.state.invites, mine, CRM_GROUP_APPLY_VERSION);
  return { inGroup: false, groupPending: true, groupTodo: signed ? 0 : 1 };
}
