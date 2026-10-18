// ★ 第1557便（2026-10-18）: コネックエフのセラピストの並びを駅ちか・エステ魂へ送る流れ（intent='sort_push'）。決めごとは lib/mediaSort.ts。
//
// ★★ 駅ちか  : login → read_girls（今の並び・トークン）→ girls_sort（並び替え更新）→ read_girls（読み直して照合）→ 終わり
// ★★ エステ魂: login → esutama_sort_read（今の並び・ctk）→ esutama_sort_save（保存する）→ esutama_sort_read（照合）→ 終わり
//   ★ 書き換える段は girls_sort / esutama_sort_save だけ（送り直さない・lib/relayRetry.ts）。
//   ★ 送れたかは応答ではなく【読み直した並び】で決める。
//   ★ 並びがもう同じなら送らない（相手に用の無い書き込みをしない）。
import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { RELAY_USER_AGENT } from './relayUserAgent';
import type { EkichikaGirlsPage } from './ekichikaGirlsParse';
import {
  planSiteOrder, orderFollowsWant, buildEkichikaSortBody,
  parseEsutamaCastSort, buildEsutamaCastSortPageRequest, buildEsutamaCastSortSaveRequest,
} from './mediaSort';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

const SITE_NAME = { ekichika: '駅ちか', esutama: 'エステ魂' } as const;
const EKICHIKA_GIRLS_URL = 'https://ranking-deli.jp/admin/girls/';

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

function wantOf(ctx: RelayFlowContext): string[] {
  return Array.isArray(ctx.sortWant) ? ctx.sortWant.map(String).filter((s) => /^\d{1,12}$/.test(s)) : [];
}

/** 読み直したあとの記録（照合） */
function verifyOutcome(site: 'ekichika' | 'esutama', ids: string[], ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const want = wantOf(ctx);
  const ok = orderFollowsWant(ids, want);
  return {
    kind: 'done',
    audits: [{
      event: 'push_sort', outcome: ok ? 'ok' : 'failed',
      summary: ok
        ? SITE_NAME[site] + 'のセラピストの並び順を、コネックエフと同じにしました（' + String(ctx.sortMatched ?? 0) + '名）'
        : SITE_NAME[site] + 'の並び順を送りましたが、読み直すとコネックエフの並びになっていませんでした（時間をおいてもう一度お試しください）',
      detail: { people: ids.length, matched: ctx.sortMatched ?? null, verified: ok, flowId },
    }],
    note: ok ? '並び順を送り、読み直して揃っていることを確かめた' : '並び順を送ったが、読み直すと揃っていない',
  };
}

// ────────────────────────── 駅ちか ──────────────────────────

/** 女の子一覧を読んだあと（1回目: 送る／2回目: 照合） */
export function sortAfterEkichikaGirls(page: EkichikaGirlsPage, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const ids = page.rows.map((r) => String(r.castId));
  if (ctx.sortStage === 'verify') return verifyOutcome('ekichika', ids, ctx);

  const want = wantOf(ctx);
  const plan = planSiteOrder(ids, want);
  const audits: FlowAudit[] = [{ event: 'login', outcome: 'ok', detail: { flowId } }];
  if (plan.matched === 0) {
    return { kind: 'done', audits: [...audits, { event: 'push_sort', outcome: 'stopped', summary: '駅ちかと結び付いているセラピストがいないため、並び順は送りませんでした', detail: { reason: 'no_match', people: ids.length, flowId } }], note: '結び付いている方がいない' };
  }
  if (!plan.changed) {
    return { kind: 'done', audits: [...audits, { event: 'push_sort', outcome: 'ok', summary: '駅ちかの並び順は、すでにコネックエフと同じでした', detail: { reason: 'already', people: ids.length, matched: plan.matched, flowId } }], note: 'もう同じ並びなので送らない' };
  }
  const csrf = page.csrfToken;
  const action = page.formAction && /^https:\/\/ranking-deli\.jp\/admin\/girls\/?$/.test(page.formAction) ? page.formAction : EKICHIKA_GIRLS_URL;
  if (!csrf) {
    return stop([...audits, { event: 'push_sort', outcome: 'failed', summary: '駅ちかの女の子一覧を読めませんでした（画面の作りが変わった可能性があります）', detail: { reason: 'no_csrf', flowId } }], '女の子一覧に fuel_csrf_token が無い');
  }
  return {
    kind: 'next',
    next: {
      purpose: 'girls_sort',
      method: 'POST',
      url: action,
      headers: {
        'user-agent': RELAY_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://ranking-deli.jp',
        referer: EKICHIKA_GIRLS_URL,
        cookie: ctx.cookie ?? '',
      },
      body: buildEkichikaSortBody(csrf, plan.order),
      context: { ...ctx, sortMatched: plan.matched },
    },
    audits,
    note: '女の子一覧を読めた（' + ids.length + '名）→ 並び替え更新を送る',
  };
}

/** 並び替え更新を送ったあと → 一覧を読み直す */
export function afterEkichikaGirlsSort(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const loc = String(input.headers['location'] ?? '');
  if ((input.status >= 300 && input.status < 400 && loc.includes('/admin/login')) || input.status >= 400) {
    return stop([{ event: 'push_sort', outcome: 'failed', summary: '駅ちかへ並び順を送れませんでした', detail: { httpStatus: input.status, reason: input.status >= 400 ? 'http_error' : 'back_to_login', flowId } }], '並び替え更新の応答が ' + input.status);
  }
  const cookie = mergeCookies(ctx.cookie ?? '', input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie || '';
  return {
    kind: 'next',
    next: {
      purpose: 'read_girls',
      method: 'GET',
      url: EKICHIKA_GIRLS_URL,
      headers: {
        'user-agent': RELAY_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
        referer: EKICHIKA_GIRLS_URL,
        cookie,
      },
      body: '',
      context: { ...ctx, cookie, sortStage: 'verify' },
    },
    audits: [],
    note: '並び替え更新を送った → 読み直して確かめる',
  };
}

// ────────────────────────── エステ魂 ──────────────────────────

export function buildEsutamaSortReadStep(cookie: string, ctx: RelayFlowContext) {
  const r = buildEsutamaCastSortPageRequest(cookie);
  return { purpose: 'esutama_sort_read' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie, esutamaCsrf: undefined } };
}

export function afterEsutamaSortRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  if (input.status >= 300 && input.status < 400 && String(input.headers['location'] ?? '').includes('/login')) {
    return stop([{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした（ログイン画面へ戻されました）', detail: { httpStatus: input.status, reason: 'back_to_login', flowId } }], '表示順の画面がログイン画面へ戻された');
  }
  if (input.status !== 200) {
    return stop([{ event: 'push_sort', outcome: 'failed', summary: 'エステ魂のセラピストの表示順の画面を開けませんでした', detail: { httpStatus: input.status, reason: 'http_error', flowId } }], '表示順の画面の応答が ' + input.status);
  }
  const page = parseEsutamaCastSort(input.body);
  if (page.castIds.length === 0 || page.problems.some((p) => !p.startsWith('ctk'))) {
    return stop([{ event: 'push_sort', outcome: 'failed', summary: 'エステ魂のセラピストの表示順を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { reason: 'unparseable', problems: page.problems.slice(0, 3).join(' / '), flowId } }], '表示順を読めなかった: ' + page.problems.join(' / '));
  }
  if (ctx.sortStage === 'verify') return verifyOutcome('esutama', page.castIds, ctx);

  const want = wantOf(ctx);
  const plan = planSiteOrder(page.castIds, want);
  const audits: FlowAudit[] = [{ event: 'login', outcome: 'ok', detail: { flowId } }];
  if (plan.matched === 0) {
    return { kind: 'done', audits: [...audits, { event: 'push_sort', outcome: 'stopped', summary: 'エステ魂と結び付いているセラピストがいないため、並び順は送りませんでした', detail: { reason: 'no_match', people: page.castIds.length, flowId } }], note: '結び付いている方がいない' };
  }
  if (!plan.changed) {
    return { kind: 'done', audits: [...audits, { event: 'push_sort', outcome: 'ok', summary: 'エステ魂の並び順は、すでにコネックエフと同じでした', detail: { reason: 'already', people: page.castIds.length, matched: plan.matched, flowId } }], note: 'もう同じ並びなので送らない' };
  }
  if (!page.ctk) {
    return stop([...audits, { event: 'push_sort', outcome: 'failed', summary: 'エステ魂の表示順の画面を読めませんでした（画面の作りが変わった可能性があります）', detail: { reason: 'no_ctk', flowId } }], '表示順の画面に ctk が無い');
  }
  const cookie = mergeCookies(ctx.cookie ?? '', input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie || '';
  const req = buildEsutamaCastSortSaveRequest(cookie, page.ctk, plan.order);
  return {
    kind: 'next',
    next: { purpose: 'esutama_sort_save', method: req.method, url: req.url, headers: req.headers, body: req.body, context: { ...ctx, cookie, sortMatched: plan.matched } },
    audits,
    note: '表示順の画面を読めた（' + page.castIds.length + '名）→ 保存する',
  };
}

export function afterEsutamaSortSave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  if (input.status !== 200) {
    return stop([{ event: 'push_sort', outcome: 'failed', summary: 'エステ魂へ並び順を送れませんでした', detail: { httpStatus: input.status, reason: 'http_error', flowId } }], '表示順の保存の応答が ' + input.status);
  }
  const cookie = mergeCookies(ctx.cookie ?? '', input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie || '';
  return {
    kind: 'next',
    next: buildEsutamaSortReadStep(cookie, { ...ctx, sortStage: 'verify' }),
    audits: [],
    note: '表示順を保存した → 読み直して確かめる',
  };
}
