'use server';

// フクエスCRM：店舗様が、グループ・提携店の共有を画面で申し込む／ほかの店が加わることを認める（第1328便・2026-10-09・カッキーさん）。
//   決まりは src/lib/crmGroupApply.ts（純粋関数と申込書の文）。下請けは src/app/lib/crm/groupJoin.ts。表は 追加SQL_第1328便。
//
// ★★★ 守り
//   ・署名・承認ができるのは、その店のオーナーのアカウントだけ。★ 運営のアカウント（運営で表示中）では【できない】
//     （運営が代わりに押すと、本人が押していない同意の記録ができてしまう）。運営は、見るだけ。
//   ・CRM が契約中であること。
//   ・申込書への署名: その店が「署名待ち」で、申込書を出してよいとき（あとから足す店は、今いる全部の店が認めたあと）だけ。
//   ・承認: その店が、いまそのグループに入っているときだけ。返事は1回（認めないを選ぶと、その場で取りやめになる）。
// ★★★ 店の名前（参加店の一覧・加わる店の名前）は、ここからだけ返す。署名・承認が済んだあとは返さない。
// ★ 入れるかどうかを決めるのは planCrmGroupJoins（純粋関数）。ここでは判断しない。

import { headers } from 'next/headers';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { assertCrmOwner } from '@/app/lib/crm/auth';
import {
  CRM_GROUP_APPLY_BODY, CRM_GROUP_APPLY_VERSION,
  checkCrmGroupSignerName, crmGroupApplyValid, crmGroupApproveBody, crmGroupInviteeCanSign, crmGroupMemberAnswer,
} from '@/lib/crmGroupApply';
import { readCrmGroupMembership } from '@/app/lib/crm/groupAlerts';
import { completeCrmGroupJoins, crmGroupPartiesOf, crmGroupPartyRowsFor, loadCrmGroupJoinState } from '@/app/lib/crm/groupJoin';

type Err = { ok: false; error: string };
type Svc = ReturnType<typeof createServiceClient>;
type Auth = { ok: true; svc: Svc; userId: string; isAdmin: boolean };

/** オーナー本人（か運営）で、CRM が契約中・規約同意済みか。★ 2026-10-09 点検#9: 判定は lib/crm/auth.ts に1本化（actions/crm.ts と同じ） */
async function assertOwner(salonId: number): Promise<Auth | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  return { ok: true, svc: a.svc, userId: a.userId, isAdmin: a.isAdmin };
}

const ADMIN_CANNOT_SIGN = '運営のアカウントでは、署名・承認はできません。店舗様のアカウントで行ってください';

/** その店の「署名待ち」（1店に1つ） */
async function pendingInviteOf(svc: Svc, salonId: number): Promise<{ id: number; groupId: number } | null> {
  const { data, error } = await svc.from('crm_group_invites').select('id, group_id').eq('salon_id', salonId).eq('status', 'pending').limit(1).maybeSingle();
  if (error || !data) return null;
  return { id: Number(data.id), groupId: Number(data.group_id) };
}

/** 申込書の画面に出すもの（署名待ちの店） */
export type CrmGroupApplyView = {
  inviteId: number;
  version: string;
  body: string;
  /** 参加店の一覧。★ 署名が済んだあとは、空で返す（店の名前を出さない） */
  parties: Array<{ name: string; corp: string; self: boolean }>;
  /** この店の署名が済んでいるか */
  signed: boolean;
  /** 署名がそろうのを待っている数（最初の顔ぶれのときだけ） */
  waiting: { signed: number; total: number } | null;
};
/** 承認の画面に出すもの（今いる店） */
export type CrmGroupApprovalView = {
  inviteId: number;
  name: string;
  corp: string;
  /** いま共有されている件数（加わる店に見えるようになる） */
  alertCount: number;
};

/**
 * この店が、いま返事をすること（申込書への署名・ほかの店が加わることの承認）。
 * ★ 何も無ければ apply: null・approvals: []。★ 表がまだ無いときも同じ。
 */
export async function getCrmGroupJoinTodo(salonId: number): Promise<{ ok: true; apply: CrmGroupApplyView | null; approvals: CrmGroupApprovalView[]; isAdmin: boolean } | Err> {
  const a = await assertOwner(Number(salonId));
  if (!a.ok) return a;
  const svc = a.svc;
  const none = { ok: true as const, apply: null, approvals: [] as CrmGroupApprovalView[], isAdmin: a.isAdmin };
  const m = await readCrmGroupMembership(svc, salonId);
  if (m.state === 'error') return { ok: false, error: 'グループの情報を読めませんでした。もう一度お試しください' };

  if (m.state === 'in') {
    const st = await loadCrmGroupJoinState(svc, m.groupId);
    if (!st.ok) return st.missing ? none : { ok: false, error: '読めませんでした: ' + st.message };
    const open = st.state.invites.filter((i) => crmGroupMemberAnswer(st.state.sigs, i.id, salonId) === null);
    if (open.length === 0) return none;
    const [names, cnt] = await Promise.all([
      crmGroupPartiesOf(svc, open),
      svc.from('crm_group_alerts').select('id', { count: 'exact', head: true }).eq('group_id', m.groupId).is('withdrawn_at', null),
    ]);
    const alertCount = cnt.error ? 0 : (cnt.count ?? 0);
    return {
      ...none,
      approvals: open.map((i) => {
        const p = names.find((n) => n.salonId === i.salonId);
        return { inviteId: i.id, name: p?.name ?? '', corp: i.corpName, alertCount };
      }),
    };
  }

  const inv = await pendingInviteOf(svc, salonId);
  if (!inv) return none;
  const st = await loadCrmGroupJoinState(svc, inv.groupId);
  if (!st.ok) return st.missing ? none : { ok: false, error: '読めませんでした: ' + st.message };
  const mine = st.state.invites.find((i) => i.id === inv.id);
  if (!mine) return none;
  const memberIds = st.state.members.map((x) => x.salonId);
  // ★★★ あとから足される店には、今いる全部の店が認めるまで、何も出さない
  if (!crmGroupInviteeCanSign(st.state.sigs, memberIds, st.state.invites, mine)) return none;
  const signed = crmGroupApplyValid(st.state.sigs, memberIds, st.state.invites, mine, CRM_GROUP_APPLY_VERSION);
  const founding = memberIds.length === 0;
  const waiting = founding
    ? { signed: st.state.invites.filter((i) => crmGroupApplyValid(st.state.sigs, [], st.state.invites, i, CRM_GROUP_APPLY_VERSION)).length, total: st.state.invites.length }
    : null;
  const parties = signed ? [] : await crmGroupPartiesOf(svc, crmGroupPartyRowsFor(st.state, mine));
  return {
    ...none,
    apply: {
      inviteId: mine.id, version: CRM_GROUP_APPLY_VERSION, body: CRM_GROUP_APPLY_BODY,
      parties: parties.map((p) => ({ name: p.name, corp: p.corp, self: p.salonId === salonId })),
      signed, waiting,
    },
  };
}

async function userAgent(): Promise<string> {
  return ((await headers()).get('user-agent') ?? '').slice(0, 300);
}

/**
 * 申込書に署名する（名前の入力 ＋ 同意のチェック）。
 * ★ そろったら、その場でグループに入る（最初の顔ぶれは全員いっしょに・あとから足す店は、その店が署名した時）。
 */
export async function signCrmGroupApply(input: { salonId: number; inviteId: number; signerName: string; agree: boolean }): Promise<{ ok: true; joined: boolean } | Err> {
  const salonId = Number(input.salonId);
  const a = await assertOwner(salonId);
  if (!a.ok) return a;
  if (a.isAdmin) return { ok: false, error: ADMIN_CANNOT_SIGN };
  if (input.agree !== true) return { ok: false, error: '「内容を読み、同意します」にチェックを入れてください' };
  const nm = checkCrmGroupSignerName(input.signerName);
  if (!nm.ok) return nm;
  const svc = a.svc;

  const inv = await pendingInviteOf(svc, salonId);
  if (!inv || inv.id !== Number(input.inviteId)) return { ok: false, error: 'この申込みは、もう受け付けていません。画面を更新してください' };
  const st = await loadCrmGroupJoinState(svc, inv.groupId);
  if (!st.ok) return { ok: false, error: '読めませんでした: ' + st.message };
  const mine = st.state.invites.find((i) => i.id === inv.id);
  if (!mine) return { ok: false, error: 'この申込みは、もう受け付けていません。画面を更新してください' };
  const memberIds = st.state.members.map((x) => x.salonId);
  if (!crmGroupInviteeCanSign(st.state.sigs, memberIds, st.state.invites, mine)) return { ok: false, error: 'この申込みは、まだ受け付けていません' };
  if (crmGroupApplyValid(st.state.sigs, memberIds, st.state.invites, mine, CRM_GROUP_APPLY_VERSION)) return { ok: false, error: 'もう署名しています' };

  const parties = await crmGroupPartiesOf(svc, crmGroupPartyRowsFor(st.state, mine));
  const { error } = await svc.from('crm_group_signatures').insert({
    group_id: inv.groupId, invite_id: inv.id, salon_id: salonId, kind: 'apply', signer_name: nm.name,
    doc_version: CRM_GROUP_APPLY_VERSION, doc_body: CRM_GROUP_APPLY_BODY, parties,
    signed_by: a.userId, user_agent: await userAgent(),
  });
  if (error) return { ok: false, error: '署名を記録できませんでした: ' + error.message };

  const done = await completeCrmGroupJoins(svc, inv.groupId, getCalendarDateJST());
  if (done.error) return { ok: false, error: '署名は記録しましたが、グループに入れませんでした。運営にお知らせください: ' + done.error };
  const after = await readCrmGroupMembership(svc, salonId);
  return { ok: true, joined: after.state === 'in' };
}

/**
 * ほかの店が加わることを、認める／認めない（今いる店）。
 * ★ 返事は1回。★ 認めないを選ぶと、その場で取りやめになる（加わる店には何も知らせない。運営の画面に出る）。
 */
export async function answerCrmGroupJoin(input: { salonId: number; inviteId: number; signerName: string; approve: boolean }): Promise<{ ok: true } | Err> {
  const salonId = Number(input.salonId);
  const a = await assertOwner(salonId);
  if (!a.ok) return a;
  if (a.isAdmin) return { ok: false, error: ADMIN_CANNOT_SIGN };
  const nm = checkCrmGroupSignerName(input.signerName);
  if (!nm.ok) return nm;
  const svc = a.svc;
  const m = await readCrmGroupMembership(svc, salonId);
  if (m.state !== 'in') return { ok: false, error: 'この確認は、もう受け付けていません。画面を更新してください' };
  const st = await loadCrmGroupJoinState(svc, m.groupId);
  if (!st.ok) return { ok: false, error: '読めませんでした: ' + st.message };
  const inviteId = Number(input.inviteId);
  const inv = st.state.invites.find((i) => i.id === inviteId);
  if (!inv) return { ok: false, error: 'この確認は、もう受け付けていません。画面を更新してください' };
  if (crmGroupMemberAnswer(st.state.sigs, inviteId, salonId) !== null) return { ok: false, error: 'もう返事をしています' };

  const [parties, cnt] = await Promise.all([
    crmGroupPartiesOf(svc, [...st.state.members, { salonId: inv.salonId, corpName: inv.corpName }]),
    svc.from('crm_group_alerts').select('id', { count: 'exact', head: true }).eq('group_id', m.groupId).is('withdrawn_at', null),
  ]);
  const newcomer = parties.find((p) => p.salonId === inv.salonId) ?? { salonId: inv.salonId, name: '店舗' + inv.salonId, corp: inv.corpName };
  const approve = input.approve === true;
  const { error } = await svc.from('crm_group_signatures').insert({
    group_id: m.groupId, invite_id: inviteId, salon_id: salonId, kind: approve ? 'approve' : 'decline', signer_name: nm.name,
    doc_version: CRM_GROUP_APPLY_VERSION, doc_body: crmGroupApproveBody(newcomer, cnt.error ? 0 : (cnt.count ?? 0)), parties,
    signed_by: a.userId, user_agent: await userAgent(),
  });
  if (error) return { ok: false, error: '返事を記録できませんでした: ' + error.message };

  if (!approve) {
    const up = await svc.from('crm_group_invites').update({ status: 'declined', closed_at: new Date().toISOString() }).eq('id', inviteId).eq('status', 'pending');
    if (up.error) return { ok: false, error: '返事は記録しましたが、取りやめにできませんでした。運営にお知らせください: ' + up.error.message };
    return { ok: true };
  }
  // 足す店が先に署名していることは無い（全員が認めるまで申込書を出さない）が、決まりは1か所（planCrmGroupJoins）に任せる
  const done = await completeCrmGroupJoins(svc, m.groupId, getCalendarDateJST());
  if (done.error) console.error('[crmGroupJoin] 承認のあとの見直しで失敗', m.groupId, done.error);
  return { ok: true };
}
