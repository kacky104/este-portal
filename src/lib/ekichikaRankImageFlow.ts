// 駅ちかの「店舗メイン／ランキング」の入れ替えの段（第1846便・2026-11-09）。★ 判断と要求は lib/ekichikaRankImage.ts（純粋関数）
//
//   login →（ctx.ekichikaRankImage があると）
//     ekirank_read   GET  /admin/girls/                         … 2つの枠と女の子一覧（名前 → 番号・いま置かれている子）
//     ekirank_set    POST /admin/ajaxgirlinforegist/create.json … ★ 相手を書き換える要求（店舗メイン→ランキングの順に最大2回・送り直さない）
//     ekirank_verify GET  /admin/girls/                         … 置いた子になったか
//   ★ 結果は outcome.ekichikaRankImage に入れて返す。表（conecf_ekichika_rankimgs）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { parseEkichikaGirls } from './ekichikaGirlsParse';
import {
  buildRankImageGirlsGet, buildRankImageSet, looksLikeRankImagePage, readRankImageCurrent, normRankName,
  RANKIMG_LABEL, EKICHIKA_GIRLS_ADMIN_URL, type RankImageTarget,
} from './ekichikaRankImage';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };
type Step = { target: RankImageTarget; id: string; old: string; name: string };
const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
/** ★ relayFlow.ts の looksLikeEkichikaLoginPage と同じ判定（循環 import を避けて写した） */
function looksLikeEkichikaLoginPage(html: string): boolean {
  const h = String(html ?? '');
  if (/<form[^>]+action=["']?(?:https?:\/\/ranking-deli\.jp)?\/admin\/login\/?["'\s>]/i.test(h)) return true;
  return /<title>[^<]*\|\s*ログイン\s*<\/title>/i.test(h);
}
const loggedOut = (input: Input) => (input.status >= 300 && input.status < 400 && /\/admin\/login/.test(locationOf(input))) || (input.status === 200 && looksLikeEkichikaLoginPage(input.body));

function loginStop(ctx: RelayFlowContext, input: Input, stage: string): FlowOutcome {
  return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '駅ちかにログインできませんでした。ログインID・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage, flowId: ctx.flowId } }], note: stage + ' でログイン画面に戻された' };
}
function finish(ctx: RelayFlowContext, r: { done: boolean; outcome: string }, audits: FlowAudit[], note: string): FlowOutcome {
  const m = ctx.ekichikaRankImage;
  return {
    kind: 'done', audits, note,
    ekichikaRankImage: { index: m?.index ?? 0, nextIndex: m?.nextIndex ?? 0, done: r.done, outcome: r.outcome, lastAt: r.done ? new Date().toISOString() : null },
  };
}
const pairText = (m: { main: string; ranking: string }) => [m.main ? '店舗メイン ' + m.main : '', m.ranking ? 'ランキング ' + m.ranking : ''].filter(Boolean).join('・');

/** ログインできたら、女の子一覧を読む */
export function ekichikaRankImageFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  const r = buildRankImageGirlsGet(cookie);
  return { kind: 'next', next: { purpose: 'ekirank_read', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: 'ログインの応答を受け取った → 女の子一覧（店舗メイン／ランキングの枠）を読む' };
}

function setStep(ctx: RelayFlowContext, cookie: string, plan: Step[], at: number, note: string): FlowOutcome {
  const s = plan[at];
  const r = buildRankImageSet(cookie, s.target, s.id, s.old);
  return {
    kind: 'next',
    next: { purpose: 'ekirank_set', method: r.method, url: r.url, headers: r.headers, body: r.body, context: { ...ctx, cookie, ekichikaRankImage: { ...ctx.ekichikaRankImage!, plan, step: at } } },
    audits: [], note: note + ' → ' + RANKIMG_LABEL[s.target] + 'を ' + s.name + ' さんにする',
  };
}

export function afterEkirankRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'rankimg_read');
  const m = ctx.ekichikaRankImage;
  if (!m) return finish(ctx, { done: false, outcome: 'error: 中身が無い' }, [], '文脈に入れ替えの組が無い');
  if (input.status >= 300 || !looksLikeRankImagePage(input.body)) {
    return finish(ctx, { done: false, outcome: 'error: 女の子一覧を読めなかった' }, [{ event: 'read_bump', outcome: 'failed', summary: '駅ちかの女の子一覧（店舗メイン／ランキングの枠）を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { opt: 'ekichika_rankimg', httpStatus: input.status, flowId: ctx.flowId } }], '店舗メイン／ランキングの枠が無い');
  }
  const girls = parseEkichikaGirls(input.body).rows;
  const cur = readRankImageCurrent(input.body);
  const plan: Step[] = [];
  const missing: string[] = [];
  for (const target of ['main', 'ranking'] as const) {
    const name = m[target];
    if (!name) continue;
    const hit = girls.filter((g) => normRankName(g.name) === normRankName(name));
    if (hit.length !== 1) { missing.push(name + (hit.length > 1 ? '（同じ名前が' + hit.length + '人）' : '')); continue; }
    if (hit[0].castId === (cur[target] ?? '')) continue;  // ★ もうその子が置かれている
    plan.push({ target, id: hit[0].castId, old: cur[target] ?? '', name });
  }
  if (missing.length > 0) {
    return finish(ctx, { done: false, outcome: 'error: 駅ちかにいない: ' + missing.join('・') },
      [{ event: 'push_bump', outcome: 'failed', summary: '駅ちかの店舗メイン／ランキング: ' + missing.join('・') + ' さんが駅ちかの女の子一覧に見つかりませんでした', detail: { opt: 'ekichika_rankimg', reason: 'no_girl', flowId: ctx.flowId } }], '女の子が見つからない: ' + missing.join('・'));
  }
  if (plan.length === 0) {
    return finish(ctx, { done: true, outcome: 'ok: ' + pairText(m) + '（もとから同じ）' }, [], 'もう同じ子が置かれていた（送らない）');
  }
  return setStep({ ...ctx, cookie }, cookie, plan, 0, '女の子一覧を読めた');
}

export function afterEkirankSet(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'rankimg_set');
  const m = ctx.ekichikaRankImage!;
  const plan = (m.plan ?? []) as Step[];
  const at = Number(m.step ?? 0);
  const s = plan[at];
  if (input.status >= 400 || !s) {
    return finish(ctx, { done: false, outcome: 'error: 入れ替えの応答 ' + input.status }, [{ event: 'push_bump', outcome: 'failed', summary: '駅ちかの' + (s ? RANKIMG_LABEL[s.target] : '店舗メイン／ランキング') + 'を入れ替えられませんでした（応答 ' + input.status + '）', detail: { opt: 'ekichika_rankimg', httpStatus: input.status, flowId: ctx.flowId } }], '入れ替えの応答が ' + input.status);
  }
  if (at + 1 < plan.length) return setStep({ ...ctx, cookie }, cookie, plan, at + 1, RANKIMG_LABEL[s.target] + 'を送った（' + input.status + '）');
  const r = buildRankImageGirlsGet(cookie, EKICHIKA_GIRLS_ADMIN_URL);
  return { kind: 'next', next: { purpose: 'ekirank_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: RANKIMG_LABEL[s.target] + 'を送った（' + input.status + '）→ 女の子一覧で確かめる' };
}

export function afterEkirankVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const m = ctx.ekichikaRankImage!;
  const plan = (m.plan ?? []) as Step[];
  const cur = readRankImageCurrent(input.body);
  const ok = plan.filter((s) => cur[s.target] === s.id);
  const all = ok.length === plan.length;
  // ★ 確かめられなくても「送れた」扱い（応答はエラーではなかった）。次の回は次の組へ進む
  return finish(ctx, { done: true, outcome: (all ? 'ok: ' : 'ok_unverified: ') + pairText(m) },
    [{ event: 'push_bump', outcome: 'ok', summary: '駅ちかの' + plan.map((s) => RANKIMG_LABEL[s.target] + 'を ' + s.name + ' さん').join('、') + 'にしました' + (all ? '' : '（女の子一覧ではまだ確かめられていません）'), detail: { opt: 'ekichika_rankimg', verified: all, flowId: ctx.flowId } }],
    all ? '入れ替えた（一覧で確かめた）' : '入れ替えた（一覧では確かめられなかった）');
}
