// 全国エステランキング（esthe-ranking.jp）へ、コネックエフのセラピストの並び順を送る（第2026便・2026-11-16・カッキーさん・オイルクエスト様）。
//
// ★★ きっかけ: 「並び順をサイトへ送る」（第1557便）は駅ちか・エステ魂だけで、全国エステランキングの並びが変わらなかった。
//
// ★★★ 相手の画面（11/16 に画面で1名だけ動かして保存し、元に戻して確かめた）:
//   セラピスト一覧 GET  /shop/image/girl/upload/all/ … 1人1行 <tr class="girl-tr" data-girl-id="<番号>">（非公開は gi-hide）
//   保存する       POST /shop/image/girl/upload/all/（urlencoded）: ads[]=<今のおすすめの番号> ＆ sorts=<並べた番号をカンマで>
//     ★ 「並び順を保存しました」と出る。★ おすすめの変更回数が残り0回でも保存できた（おすすめを変えなければ回数は減らない）。
//
//   段: login → zenkoku_sort_read（今の並び）→ zenkoku_sort_save（保存する・送り直さない）→ zenkoku_sort_read（読み直して照合）
//   ★ 並べ方（カッキーさんの OK）: コネックエフの順に上から。全国エステランキングにだけ居る方・非公開の方は、今の順のまま後ろ。
//   ★ おすすめセラピスト（ads[]）は【読んだときのまま】送る＝変えない。★ 並びがもう同じなら送らない。
import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { planSiteOrder } from './mediaSort';
import { ZENKOKU_GIRLS_URL } from './zenkokuRequests';
import { parseZenkokuRecommendPage, buildZenkokuGetRequest, buildZenkokuSortSaveRequest, type ZenkokuRecPage } from './zenkokuOption';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };
const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie ?? '', input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie || '';
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
const stop = (audits: FlowAudit[], note: string): FlowOutcome => ({ kind: 'stop', audits, note });

/** コネックエフの並びのうち、全国エステランキングに居て公開中の方だけ（非公開の方は後ろに残す） */
export function zenkokuSortWant(page: ZenkokuRecPage, want: readonly string[]): string[] {
  const shown = new Set(page.rows.filter((r) => !r.hidden).map((r) => r.gid));
  return want.map(String).filter((g) => shown.has(g));
}

function readStep(cookie: string, ctx: RelayFlowContext) {
  const r = buildZenkokuGetRequest(cookie, ZENKOKU_GIRLS_URL);
  return { purpose: 'zenkoku_sort_read' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } };
}

/** ログインできたら、セラピスト一覧を読む */
export function zenkokuSortFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  return { kind: 'next', next: readStep(cookie, ctx), audits: [], note: '全国エステランキングにログインした → 並び順のためにセラピスト一覧を読む（★ まだ何も変えていない）' };
}

export function afterZenkokuSortRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const cookie = cookieOf(input, ctx);
  if ((input.status >= 300 && input.status < 400 && /\/login\/?(\?|$)/.test(locationOf(input))) || (input.status === 200 && /name=["']loginname["']/.test(input.body) && !/data-girl-id=/.test(input.body))) {
    return stop([{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした。ログイン名・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage: 'sort_read', flowId } }], '一覧を開いたらログイン画面だった');
  }
  const page = parseZenkokuRecommendPage(input.body);
  if (input.status >= 400 || !page.formSeen || page.rows.length === 0) {
    return stop([{ event: 'push_sort', outcome: 'failed', summary: '全国エステランキングのセラピスト一覧を読み取れませんでした（並び順は送っていません）', detail: { httpStatus: input.status, reason: 'list_unreadable', flowId } }], 'セラピスト一覧を読めなかった');
  }
  const ids = page.rows.map((r) => r.gid);
  const want = zenkokuSortWant(page, Array.isArray(ctx.sortWant) ? ctx.sortWant : []);
  const plan = planSiteOrder(ids, want);

  if (ctx.sortStage === 'verify') {
    const ok = !plan.changed;
    return {
      kind: 'done',
      audits: [{
        event: 'push_sort', outcome: ok ? 'ok' : 'failed',
        summary: ok
          ? '全国エステランキングのセラピストの並び順を、コネックエフと同じにしました（' + String(ctx.sortMatched ?? 0) + '名）'
          : '全国エステランキングへ並び順を送りましたが、読み直すとコネックエフの並びになっていませんでした（時間をおいてもう一度お試しください）',
        detail: { people: ids.length, matched: ctx.sortMatched ?? null, verified: ok, flowId },
      }],
      note: ok ? '並び順を送り、読み直して揃っていることを確かめた' : '並び順を送ったが、読み直すと揃っていない',
    };
  }

  const audits: FlowAudit[] = [{ event: 'login', outcome: 'ok', summary: '全国エステランキングにログインできました', detail: { flowId } }];
  if (plan.matched === 0) {
    return { kind: 'done', audits: [...audits, { event: 'push_sort', outcome: 'stopped', summary: '全国エステランキングと結び付いている（公開中の）セラピストがいないため、並び順は送りませんでした', detail: { reason: 'no_match', people: ids.length, flowId } }], note: '結び付いている方がいない' };
  }
  if (!plan.changed) {
    return { kind: 'done', audits: [...audits, { event: 'push_sort', outcome: 'ok', summary: '全国エステランキングの並び順は、すでにコネックエフと同じでした', detail: { reason: 'already', people: ids.length, matched: plan.matched, flowId } }], note: 'もう同じ並びなので送らない' };
  }
  // ★ 人数が変わる並びは送らない（一覧に居る全員を、1人も落とさず・増やさず送る）
  if (plan.order.length !== ids.length || new Set(plan.order).size !== ids.length) {
    return stop([...audits, { event: 'push_sort', outcome: 'failed', summary: '全国エステランキングの並び順を組み立てられませんでした（送っていません）', detail: { reason: 'order_broken', people: ids.length, flowId } }], '並びの人数が合わない');
  }
  const r = buildZenkokuSortSaveRequest(cookie, page, plan.order);
  return {
    kind: 'next',
    next: { purpose: 'zenkoku_sort_save', method: r.method, url: r.url, headers: r.headers, body: r.body, context: { ...ctx, cookie, sortMatched: plan.matched } },
    audits,
    note: 'セラピスト一覧を読めた（' + ids.length + '名）→ 並び順を保存する',
  };
}

/** 保存の応答（ふつうは一覧へ戻る）。★ 成否は読み直して確かめる */
export function afterZenkokuSortSave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  if (input.status >= 400 || (input.status >= 300 && input.status < 400 && /\/login\/?(\?|$)/.test(locationOf(input)))) {
    return stop([{ event: 'push_sort', outcome: 'failed', summary: '全国エステランキングへ並び順を送れませんでした（応答 ' + input.status + '）', detail: { httpStatus: input.status, reason: input.status >= 400 ? 'http_error' : 'back_to_login', flowId } }], '並び順の保存の応答が ' + input.status);
  }
  return { kind: 'next', next: readStep(cookieOf(input, ctx), { ...ctx, sortStage: 'verify' }), audits: [], note: '並び順を保存した → 読み直して確かめる' };
}
