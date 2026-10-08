// エステ魂の「集客ワンクリックアピール」（店舗情報）を押す流れ（第1314便・2026-10-08）。
//
// ★★ 段: esutama_login_page → esutama_login → esutama_appeal_read（画面: 残り回数・最終アピール・ctk）
//          →（押すなら）esutama_appeal_set（POST /admin_post/single_appeal_exec）→ esutama_appeal_verify（読み直す）→ 終わり
//   ★ intent は駅ちかの上位表示と同じ bump_auto（周）／ bump_push（コネックエフで店舗様が押した）。
//   ★ esutama_appeal_set だけが相手の回数を1つ減らす（送り直さない・lib/relayRetry.ts）。
//   ★★ 押せたかは応答ではなく【読み直し】で決める（残り回数が減った／最終アピールが新しくなった）。
//   ★ 記録は駅ちかと同じ read_bump（読んだだけ・たたむ）／push_bump（押した・押せなかった）。周が押さずに終わった回は黙る。

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { AUDIT_SHOP_HIDDEN } from './mediaAudit';
import { shouldBumpNow } from './ekichikaBump';
import {
  parseEsutamaAppealPage, esutamaAppealUsable, esutamaAppealPressed,
  buildEsutamaAppealPageRequest, buildEsutamaAppealPostRequest, ESUTAMA_APPEAL_DAILY,
} from './esutamaAppeal';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

function backToLogin(input: Input): boolean {
  if (input.status >= 300 && input.status < 400) return String(input.headers['location'] ?? '').includes('/login');
  return false;
}

function looksLikeLoginPage(body: string): boolean {
  return /post\/login_shop|name=["']login_id["']|ログインID/.test(String(body ?? '')) && !/l-appeal_limit_num/.test(String(body ?? ''));
}

/** ログインできたあとの最初の段（esutamaFlow.afterEsutamaLogin から呼ぶ） */
export function buildEsutamaAppealReadStep(cookie: string, ctx: RelayFlowContext) {
  const r = buildEsutamaAppealPageRequest(cookie);
  return { purpose: 'esutama_appeal_read' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie, esutamaCsrf: undefined } };
}

/** ① 画面を読んだ → 押すかを決める */
export function afterEsutamaAppealRead(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  if (backToLogin(input)) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした（ログイン画面へ戻されました）。メールアドレス・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'back_to_login', flowId } }],
      'アピールの画面がログイン画面へ戻された',
    );
  }
  if (input.status !== 200) {
    return stop([{ event: 'read_bump', outcome: 'failed', detail: { httpStatus: input.status, reason: 'http_error', flowId } }], 'アピールの画面の応答が ' + input.status + ' だった');
  }
  const now = nowArg ?? new Date();
  const page = parseEsutamaAppealPage(input.body, now);
  if (!esutamaAppealUsable(page)) {
    if (looksLikeLoginPage(input.body)) {
      return stop(
        [{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした（ログイン画面が返りました）。メールアドレス・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'login_page', flowId } }],
        'アピールの画面の代わりにログイン画面が返った',
      );
    }
    return stop(
      [{ event: 'read_bump', outcome: 'failed', detail: { reason: 'unparseable', problems: page.problems.slice(0, 4).join(' / '), flowId } }],
      'アピールの画面を読めなかった: ' + page.problems.join(' / '),
    );
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const readAt = now.toISOString();
  const state = { remaining: page.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: page.lastAt, readAt, pressed: false };
  const audits: FlowAudit[] = [
    { event: 'login', outcome: 'ok', detail: { flowId } },
    { event: 'read_bump', outcome: 'ok', detail: { remaining: page.remaining, quota: ESUTAMA_APPEAL_DAILY, flowId, ...AUDIT_SHOP_HIDDEN } },
  ];
  const decision = ctx.bumpForce === true
    ? ((page.remaining ?? 0) > 0 ? { bump: true, reason: 'ok' as const } : { bump: false, reason: 'no_quota' as const })
    : shouldBumpNow({
      now,
      setting: ctx.bumpSetting ?? { enabled: false, startMin: 0, endMin: 0, intervalMin: 0 },
      state: { lastAt: page.lastAt, remaining: page.remaining, readAt, autoAt: null },
      atRead: true,
    });
  if (!decision.bump) {
    const extra: FlowAudit[] = ctx.bumpForce === true
      ? [{ event: 'push_bump', outcome: 'stopped', detail: { reason: decision.reason, remaining: page.remaining, manual: true, flowId } }]
      : [];
    return { kind: 'done', audits: [...audits, ...extra], note: 'アピールは押さなかった（' + decision.reason + '）', ekichikaBump: state };
  }
  const p = buildEsutamaAppealPostRequest(cookie, String(page.ctk));
  return {
    kind: 'next',
    next: {
      purpose: 'esutama_appeal_set', method: p.method, url: p.url, headers: p.headers, body: p.body ?? '',
      context: { ...ctx, cookie, bumpBefore: { remaining: page.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: page.lastAt } },
    },
    audits,
    note: 'アピールの画面を読めた（残り ' + page.remaining + '）→ 店舗情報をアピールする',
  };
}

/** ② 押した → 読み直して確かめる（★ 応答では決めない） */
export function afterEsutamaAppealSet(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const manual = ctx.bumpForce === true;
  if (backToLogin(input)) {
    return stop([{ event: 'push_bump', outcome: 'failed', detail: { httpStatus: input.status, reason: 'back_to_login', manual, flowId } }], 'アピールを押したらログイン画面へ戻された');
  }
  if (input.status >= 400) {
    return {
      kind: 'done',
      audits: [{ event: 'push_bump', outcome: 'failed', detail: { httpStatus: input.status, reason: 'http_error', manual, flowId } }],
      note: 'アピールの応答が ' + input.status + ' だった',
      ekichikaBump: { ...(ctx.bumpBefore ?? { remaining: null, quota: ESUTAMA_APPEAL_DAILY, lastAt: null }), readAt: new Date().toISOString(), pressed: false },
    };
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const r = buildEsutamaAppealPageRequest(cookie);
  return {
    kind: 'next',
    next: { purpose: 'esutama_appeal_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } },
    audits: [],
    note: 'アピールを送った。★ 成否は読み直して確かめる（応答の先頭: ' + String(input.body ?? '').slice(0, 40).replace(/\s+/g, ' ') + '）',
  };
}

/** ③ 読み直した → 押せたか */
export function afterEsutamaAppealVerify(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const manual = ctx.bumpForce === true;
  const before = ctx.bumpBefore ?? { remaining: null, quota: ESUTAMA_APPEAL_DAILY, lastAt: null };
  const now = nowArg ?? new Date();
  const readAt = now.toISOString();
  const page = input.status === 200 ? parseEsutamaAppealPage(input.body, now) : null;
  if (!page || page.remaining === null) {
    // ★ 読み直せなかった。★ 押せたかどうか分からない（＝押し直さない。次の周が読み直す）
    return {
      kind: 'done',
      audits: [{ event: 'push_bump', outcome: 'failed', detail: { httpStatus: input.status, reason: 'verify_unreadable', manual, flowId } }],
      note: 'アピールのあと画面を読み直せなかった（押せたか分からない）',
      ekichikaBump: { remaining: before.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: before.lastAt, readAt, pressed: false },
    };
  }
  const pressed = esutamaAppealPressed(before, page);
  if (pressed) {
    return {
      kind: 'done',
      audits: [{ event: 'push_bump', outcome: 'ok', detail: { remaining: page.remaining, quota: ESUTAMA_APPEAL_DAILY, manual, flowId } }],
      note: '店舗情報をアピールできた（残り ' + page.remaining + '）',
      ekichikaBump: { remaining: page.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: page.lastAt ?? readAt, readAt, pressed: true },
    };
  }
  return {
    kind: 'done',
    audits: [{ event: 'push_bump', outcome: 'failed', detail: { reason: 'not_accepted', remaining: page.remaining, manual, flowId } }],
    note: 'アピールを送ったが、残り回数も最終アピールも変わらなかった',
    ekichikaBump: { remaining: page.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: page.lastAt, readAt, pressed: false },
  };
}
