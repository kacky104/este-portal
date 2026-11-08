// エステ魂【オプション】を押す流れ（第1799便・2026-11-09）。★ 押し方・判断は lib/esutamaOption.ts（純粋関数）
//
// ★★ 段: esutama_login_page → esutama_login → esutama_opt_read（画面を読む）
//          →（押すなら）esutama_opt_set（POST）→（セラピストアピールだけ）esutama_opt_verify（読み直す）→ 終わり
//   ★ intent は bump_push（店舗様が押した）/ bump_auto（周）。文脈の esutamaOpt があるとこちらへ来る（esutamaFlow.afterEsutamaLogin）
//   ★ esutama_opt_set だけが相手の回数を1つ減らす（送り直さない・lib/relayRetry.ts）
//   ★ 結果は outcome.esutamaOpt に入れて返す。表（conecf_esutama_options）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { AUDIT_SHOP_HIDDEN } from './mediaAudit';
import { parseEsutamaAppealRow } from './esutamaAppeal';
import { readEsutamaCsrf } from './esutamaParse';
import {
  ESUTAMA_OPT_LABEL, ESUTAMA_JOB_APPEAL_ROWS, ESUTAMA_JOB_APPEAL_LABEL, buildJobAppealRequest, parseGoNowPage, goNowBoostAccepted, parseCastAppealPage, pickCastToAppeal,
  buildEsutamaOptPageRequest, buildGoNowBoostRequest, buildCastAppealRequest, type EsutamaOptKey,
} from './esutamaOption';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function backToLogin(input: Input): boolean {
  return input.status >= 300 && input.status < 400 && String(input.headers['location'] ?? '').includes('/login');
}
function looksLikeLoginPage(body: string): boolean {
  return /post\/login_shop|name=["']login_id["']|ログインID/.test(String(body ?? '')) && !/csrf_footer[\s\S]*本日の残り回数|ShopWaitSettingForm/.test(String(body ?? ''));
}

function keyOf(ctx: RelayFlowContext): EsutamaOptKey {
  return (ctx.esutamaOpt?.key ?? 'shop_boost') as EsutamaOptKey;
}

function finish(ctx: RelayFlowContext, r: { remaining: number | null; readAt: string; pressed: boolean; outcome: string; lastAt?: string | null }, audits: FlowAudit[], note: string): FlowOutcome {
  return {
    kind: 'done', audits, note,
    esutamaOpt: { key: keyOf(ctx), remaining: r.remaining, readAt: r.readAt, pressed: r.pressed, outcome: r.outcome, lastAt: r.lastAt ?? null },
  };
}

/** ログインできたあとの最初の段 */
export function buildEsutamaOptReadStep(cookie: string, ctx: RelayFlowContext) {
  const r = buildEsutamaOptPageRequest(cookie, keyOf(ctx));
  return { purpose: 'esutama_opt_read' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } };
}

/** ① 画面を読んだ → 押す */
export function afterEsutamaOptRead(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const key = keyOf(ctx);
  const label = ESUTAMA_OPT_LABEL[key];
  const now = nowArg ?? new Date();
  const readAt = now.toISOString();
  const manual = ctx.esutamaOpt?.force === true;
  if (backToLogin(input) || (input.status === 200 && looksLikeLoginPage(input.body))) {
    return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした。メールアドレス・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'login_page', flowId } }], note: label + 'の画面の代わりにログイン画面が返った' };
  }
  if (input.status !== 200) {
    return finish(ctx, { remaining: null, readAt, pressed: false, outcome: 'error: http ' + input.status },
      [{ event: 'read_bump', outcome: 'failed', detail: { opt: key, httpStatus: input.status, reason: 'http_error', flowId } }], label + 'の画面の応答が ' + input.status);
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const readAudit: FlowAudit = { event: 'read_bump', outcome: 'ok', detail: { opt: key, flowId, ...AUDIT_SHOP_HIDDEN } };

  if (key === 'shop_boost') {
    const p = parseGoNowPage(input.body);
    if (p.problems.length > 0 || !p.ctk) {
      return finish(ctx, { remaining: p.remaining, readAt, pressed: false, outcome: 'error: unparseable' },
        [{ event: 'read_bump', outcome: 'failed', detail: { opt: key, reason: 'unparseable', problems: p.problems.slice(0, 4).join(' / '), flowId } }], 'ご案内状況の画面を読めなかった: ' + p.problems.join(' / '));
    }
    if ((p.remaining ?? 0) <= 0) {
      return finish(ctx, { remaining: p.remaining, readAt, pressed: false, outcome: 'no_remaining' },
        [readAudit, ...(manual ? [{ event: 'push_bump', outcome: 'stopped', detail: { opt: key, reason: 'no_quota', manual, flowId } } as FlowAudit] : [])], '集客ブーストの残りが0回なので押さなかった');
    }
    const r = buildGoNowBoostRequest(cookie, p.ctk, p.fields);
    return {
      kind: 'next', audits: [readAudit],
      next: { purpose: 'esutama_opt_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: { ...ctx, cookie, esutamaOptBefore: { remaining: p.remaining, castId: null, castName: null, lastAt: null } } },
      note: 'ご案内状況の画面を読めた（残り ' + p.remaining + '）→ 「◎今すぐご案内可」で表示する',
    };
  }

  if (key === 'cast_appeal') {
    const p = parseCastAppealPage(input.body, now);
    if (p.remaining === null || !p.ctk) {
      return finish(ctx, { remaining: p.remaining, readAt, pressed: false, outcome: 'error: unparseable' },
        [{ event: 'read_bump', outcome: 'failed', detail: { opt: key, reason: 'unparseable', problems: p.problems.slice(0, 4).join(' / '), flowId } }], 'セラピストアピールの画面を読めなかった: ' + p.problems.join(' / '));
    }
    if (p.remaining <= 0) {
      return finish(ctx, { remaining: 0, readAt, pressed: false, outcome: 'no_remaining' },
        [readAudit, ...(manual ? [{ event: 'push_bump', outcome: 'stopped', detail: { opt: key, reason: 'no_quota', manual, flowId } } as FlowAudit] : [])], 'セラピストアピールの残りが0回なので押さなかった');
    }
    const pick = pickCastToAppeal(p.rows, now);
    if (!pick) {
      return finish(ctx, { remaining: p.remaining, readAt, pressed: false, outcome: 'no_cast' },
        [readAudit, ...(manual ? [{ event: 'push_bump', outcome: 'stopped', detail: { opt: key, reason: 'no_cast_in_shift', manual, flowId } } as FlowAudit] : [])], 'いま出勤時間内のセラピストがいないので押さなかった');
    }
    const r = buildCastAppealRequest(cookie, p.ctk, pick.castId);
    return {
      kind: 'next', audits: [readAudit],
      next: { purpose: 'esutama_opt_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: { ...ctx, cookie, esutamaOptBefore: { remaining: p.remaining, castId: pick.castId, castName: pick.name, lastAt: pick.lastAt } } },
      note: 'セラピストアピールの画面を読めた（残り ' + p.remaining + '）→ ' + pick.name + 'さんをアピールする',
    };
  }

  // ── 求人ワンクリックアピール（求人情報 → お仕事体験談。残りがある行だけ） ──
  const rows = ESUTAMA_JOB_APPEAL_ROWS.map((k) => ({ k, r: parseEsutamaAppealRow(input.body, k, now) }));
  const ctkV = readEsutamaCsrf(input.body);
  if (rows.every((x) => x.r === null) || !ctkV) {
    return finish(ctx, { remaining: null, readAt, pressed: false, outcome: 'error: unparseable' },
      [{ event: 'read_bump', outcome: 'failed', detail: { opt: key, reason: 'unparseable', flowId } }], '求人ワンクリックアピールの画面を読めなかった');
  }
  const minRemaining = (xs: typeof rows) => {
    const v = xs.map((x) => x.r?.remaining).filter((n): n is number => typeof n === 'number');
    return v.length ? Math.max(...v) : null;
  };
  const todo = rows.filter((x) => (x.r?.remaining ?? 0) > 0);
  if (todo.length === 0) {
    return finish(ctx, { remaining: 0, readAt, pressed: false, outcome: 'no_remaining' },
      [readAudit, ...(manual ? [{ event: 'push_bump', outcome: 'stopped', detail: { opt: key, reason: 'no_quota', manual, flowId } } as FlowAudit] : [])], '求人ワンクリックアピールの残りが0回なので押さなかった');
  }
  const first = todo[0];
  const r = buildJobAppealRequest(cookie, ctkV, first.k);
  return {
    kind: 'next', audits: [readAudit],
    next: {
      purpose: 'esutama_opt_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '',
      context: {
        ...ctx, cookie, esutamaOptRow: first.k, esutamaOptQueue: todo.slice(1).map((x) => x.k), esutamaOptDone: [],
        esutamaOptBefore: { remaining: first.r?.remaining ?? null, castId: null, castName: null, lastAt: first.r?.lastAt ?? null },
      },
    },
    note: '求人ワンクリックアピールの画面を読めた（残り ' + minRemaining(rows) + '）→ ' + (ESUTAMA_JOB_APPEAL_LABEL[first.k] ?? first.k) + 'をアピールする',
  };
}

/** ③' 読み直した（求人ワンクリックアピール）→ 押せたか・次の行 */
function afterJobVerify(input: Input, ctx: RelayFlowContext, now: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const key = keyOf(ctx);
  const manual = ctx.esutamaOpt?.force === true;
  const readAt = now.toISOString();
  const row = ctx.esutamaOptRow ?? '';
  const before = ctx.esutamaOptBefore ?? { remaining: null, castId: null, castName: null, lastAt: null };
  const done = [...(ctx.esutamaOptDone ?? [])];
  if (input.status !== 200) {
    return finish(ctx, { remaining: before.remaining, readAt, pressed: done.length > 0, outcome: done.length ? 'ok: ' + done.join('・') : 'error: verify_unreadable', lastAt: done.length ? readAt : null },
      [{ event: 'push_bump', outcome: done.length ? 'ok' : 'failed', detail: { opt: key, reason: 'verify_unreadable', done: done.join('・'), manual, flowId } }], 'アピールのあと画面を読み直せなかった');
  }
  const a = parseEsutamaAppealRow(input.body, row, now);
  const ok = !!a && ((before.remaining !== null && a.remaining !== null && a.remaining < before.remaining)
    || (!!a.lastAt && (!before.lastAt || Date.parse(a.lastAt) > Date.parse(before.lastAt))));
  if (ok) done.push(ESUTAMA_JOB_APPEAL_LABEL[row] ?? row);
  const queue = [...(ctx.esutamaOptQueue ?? [])];
  const ctk = readEsutamaCsrf(input.body);
  while (queue.length > 0 && ctk) {
    const nextRow = queue.shift() as string;
    const nb = parseEsutamaAppealRow(input.body, nextRow, now);
    if (!nb || (nb.remaining ?? 0) <= 0) continue;
    const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
    const r = buildJobAppealRequest(cookie, ctk, nextRow);
    return {
      kind: 'next', audits: [],
      next: {
        purpose: 'esutama_opt_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '',
        context: { ...ctx, cookie, esutamaOptRow: nextRow, esutamaOptQueue: queue, esutamaOptDone: done, esutamaOptBefore: { remaining: nb.remaining, castId: null, castName: null, lastAt: nb.lastAt } },
      },
      note: (ESUTAMA_JOB_APPEAL_LABEL[nextRow] ?? nextRow) + 'も続けてアピールする（残り ' + nb.remaining + '）',
    };
  }
  const rems = ESUTAMA_JOB_APPEAL_ROWS.map((k) => parseEsutamaAppealRow(input.body, k, now)?.remaining).filter((n): n is number => typeof n === 'number');
  const remaining = rems.length ? Math.max(...rems) : (a?.remaining ?? null);
  if (done.length > 0) {
    return finish(ctx, { remaining, readAt, pressed: true, outcome: 'ok: ' + done.join('・'), lastAt: readAt },
      [{ event: 'push_bump', outcome: 'ok', detail: { opt: key, done: done.join('・'), remaining, manual, flowId } }], done.join('・') + 'をアピールできた');
  }
  return finish(ctx, { remaining, readAt, pressed: false, outcome: 'error: not_accepted' },
    [{ event: 'push_bump', outcome: 'failed', detail: { opt: key, reason: 'not_accepted', remaining, manual, flowId } }], 'アピールを送ったが、残り回数も最終アピールも変わらなかった');
}

/** ② 押した */
export function afterEsutamaOptSet(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const key = keyOf(ctx);
  const manual = ctx.esutamaOpt?.force === true;
  const now = nowArg ?? new Date();
  const readAt = now.toISOString();
  const before = ctx.esutamaOptBefore ?? { remaining: null, castId: null, castName: null, lastAt: null };
  if (backToLogin(input) || input.status >= 400) {
    return finish(ctx, { remaining: before.remaining, readAt, pressed: false, outcome: 'error: http ' + input.status },
      [{ event: 'push_bump', outcome: 'failed', detail: { opt: key, httpStatus: input.status, reason: backToLogin(input) ? 'back_to_login' : 'http_error', manual, flowId } }], ESUTAMA_OPT_LABEL[key] + 'を押せなかった（' + input.status + '）');
  }
  if (key === 'shop_boost') {
    if (goNowBoostAccepted(input.body)) {
      const remaining = before.remaining === null ? null : Math.max(0, before.remaining - 1);
      return finish(ctx, { remaining, readAt, pressed: true, outcome: 'ok', lastAt: readAt },
        [{ event: 'push_bump', outcome: 'ok', detail: { opt: key, remaining, manual, flowId } }], '「◎今すぐご案内可」で表示できた（残り ' + remaining + '）');
    }
    return finish(ctx, { remaining: before.remaining, readAt, pressed: false, outcome: 'error: not_accepted' },
      [{ event: 'push_bump', outcome: 'failed', detail: { opt: key, reason: 'not_accepted', head: String(input.body ?? '').slice(0, 60), manual, flowId } }], '集客ブーストの応答が OK ではなかった');
  }
  // ★ セラピストアピールは応答の形を見ていないので、読み直して決める
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const r = buildEsutamaOptPageRequest(cookie, key);
  return {
    kind: 'next', audits: [],
    next: { purpose: 'esutama_opt_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } },
    note: ESUTAMA_OPT_LABEL[key] + 'を送った。★ 成否は読み直して確かめる',
  };
}

/** ③ 読み直した（セラピストアピール） */
export function afterEsutamaOptVerify(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const key = keyOf(ctx);
  const manual = ctx.esutamaOpt?.force === true;
  const now = nowArg ?? new Date();
  const readAt = now.toISOString();
  if (key === 'job_appeal') return afterJobVerify(input, ctx, now);
  const before = ctx.esutamaOptBefore ?? { remaining: null, castId: null, castName: null, lastAt: null };
  const p = input.status === 200 ? parseCastAppealPage(input.body, now) : null;
  if (!p || p.remaining === null) {
    return finish(ctx, { remaining: before.remaining, readAt, pressed: false, outcome: 'error: verify_unreadable' },
      [{ event: 'push_bump', outcome: 'failed', detail: { opt: key, httpStatus: input.status, reason: 'verify_unreadable', manual, flowId } }], 'アピールのあと画面を読み直せなかった（押せたか分からない）');
  }
  // ★ 残りが0回になるとボタンが消えて行も読めないので、残りが減ったかを先に見る
  const row = p.rows.find((x) => x.castId === before.castId);
  const pressed = (before.remaining !== null && p.remaining < before.remaining)
    || (!!row?.lastAt && (!before.lastAt || Date.parse(row.lastAt) > Date.parse(before.lastAt)));
  if (pressed) {
    return finish(ctx, { remaining: p.remaining, readAt, pressed: true, outcome: 'ok: ' + (before.castName ?? before.castId), lastAt: readAt },
      [{ event: 'push_bump', outcome: 'ok', detail: { opt: key, cast: before.castName ?? '', remaining: p.remaining, manual, flowId } }], (before.castName ?? '') + 'さんをアピールできた（残り ' + p.remaining + '）');
  }
  return finish(ctx, { remaining: p.remaining, readAt, pressed: false, outcome: 'error: not_accepted' },
    [{ event: 'push_bump', outcome: 'failed', detail: { opt: key, reason: 'not_accepted', remaining: p.remaining, manual, flowId } }], 'アピールを送ったが、残り回数も最終アピールも変わらなかった');
}
