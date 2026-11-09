// 全国エステランキングの待機中の段（第1810便・2026-11-09）。★ 判断と要求は lib/zenkokuWait.ts（純粋関数）
//
//   zenkoku_login_page → zenkoku_login →（ctx.zenkokuWait があると）zenkoku_wait_read（その日の出勤画面）
//     → 待機していない方（w-start）を1人ずつ zenkoku_wait_set（POST /shop/schedule/wait/<gid>/ is_waiting=0）→ 終わり
//   ★ 押せたかは応答（error=0・返ってきたボタンが w-cancel）で決める（実測で、画面の読み直しと一致した）
//   ★ 待機終了は打たない（出勤時間が終わるとボタンごと消える）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { AUDIT_SHOP_HIDDEN } from './mediaAudit';
import { looksLikeZenkokuLoginPage } from './zenkokuParse';
import { parseZenkokuWaitRows, buildZenkokuWaitStartRequest, zenkokuWaitStarted } from './zenkokuWait';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function cookieOf(input: Input, ctx: RelayFlowContext): string {
  return mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
}

function finish(ctx: RelayFlowContext): FlowOutcome {
  const w = ctx.zenkokuWait;
  const done = w?.done ?? [];
  const failed = w?.failed ?? [];
  const audits: FlowAudit[] = [];
  if (done.length > 0 || failed.length > 0) {
    audits.push(failed.length === 0
      ? { event: 'push_bump', outcome: 'ok', summary: '全国エステランキングで ' + done.join('・').slice(0, 80) + ' さんを待機中にしました', detail: { opt: 'zenkoku_wait', started: done.length, flowId: ctx.flowId } }
      : { event: 'push_bump', outcome: 'failed', summary: '全国エステランキングで待機中にできなかった方がいます（' + failed.join('・').slice(0, 80) + '）', detail: { opt: 'zenkoku_wait', started: done.length, failed: failed.length, flowId: ctx.flowId } });
  }
  return { kind: 'done', audits, note: '待機中: 開始 ' + done.length + '・できなかった ' + failed.length + '・もとから待機中 ' + (w?.already ?? 0) };
}

function pushNext(ctx: RelayFlowContext, cookie: string, audits: FlowAudit[], note: string): FlowOutcome {
  const w = ctx.zenkokuWait;
  const queue = [...(w?.queue ?? [])];
  const first = queue.shift();
  if (!w || !first) return finish({ ...ctx, cookie });
  const r = buildZenkokuWaitStartRequest(cookie, w.dateISO, first.gid, first.rowId);
  return {
    kind: 'next',
    next: {
      purpose: 'zenkoku_wait_set', method: r.method, url: r.url, headers: r.headers, body: r.body,
      context: { ...ctx, cookie, zenkokuWait: { ...w, queue: [first, ...queue] } },
    },
    audits,
    note: note + ' → ' + first.name + 'さんを待機中にする',
  };
}

export function afterZenkokuWaitRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (input.status >= 300 && input.status < 400 || (input.status === 200 && looksLikeZenkokuLoginPage(input.body))) {
    return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした。ログイン名・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage: 'wait', flowId: ctx.flowId } }], note: '待機中のための出勤画面がログイン画面だった' };
  }
  if (input.status >= 400) {
    return { kind: 'done', audits: [{ event: 'read_bump', outcome: 'failed', detail: { opt: 'zenkoku_wait', httpStatus: input.status, flowId: ctx.flowId } }], note: '出勤画面が ' + input.status };
  }
  const { rows, formSeen } = parseZenkokuWaitRows(input.body);
  if (!formSeen) {
    return { kind: 'done', audits: [{ event: 'read_bump', outcome: 'failed', summary: '全国エステランキングの出勤画面を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { opt: 'zenkoku_wait', reason: 'form_missing', flowId: ctx.flowId } }], note: '出勤画面の形が違う' };
  }
  const todo = rows.filter((r) => !r.waiting).map((r) => ({ gid: r.gid, rowId: r.rowId, name: r.name }));
  const already = rows.length - todo.length;
  const next: RelayFlowContext = { ...ctx, cookie, zenkokuWait: { dateISO: ctx.zenkokuWait?.dateISO ?? '', queue: todo, done: [], failed: [], already } };
  const audits: FlowAudit[] = [{ event: 'read_bump', outcome: 'ok', detail: { opt: 'zenkoku_wait', onShift: rows.length, todo: todo.length, flowId: ctx.flowId, ...AUDIT_SHOP_HIDDEN } }];
  if (todo.length === 0) return { ...finish(next), audits };
  return pushNext(next, cookie, audits, '出勤時間に入っている方 ' + rows.length + '名（待機していない方 ' + todo.length + '名）');
}

export function afterZenkokuWaitSet(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  const w = ctx.zenkokuWait;
  if (!w) return finish(ctx);
  const queue = [...(w.queue ?? [])];
  const cur = queue.shift();
  const ok = input.status < 400 && zenkokuWaitStarted(input.body);
  const done = [...(w.done ?? []), ...(cur && ok ? [cur.name] : [])];
  const failed = [...(w.failed ?? []), ...(cur && !ok ? [cur.name] : [])];
  const next: RelayFlowContext = { ...ctx, cookie, zenkokuWait: { ...w, queue, done, failed } };
  // ★ ログインが切れていたら、残りは押さない
  if (input.status >= 300 && input.status < 400) return finish(next);
  return pushNext(next, cookie, [], (cur?.name ?? '') + (ok ? 'さん 待機中にできた' : 'さん できなかった'));
}
