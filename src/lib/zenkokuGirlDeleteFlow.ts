// 全国エステランキング（esthe-ranking.jp）からセラピストを1人 削除する（第1864便・2026-11-09・カッキーさん・オイルクエスト様のご要望）。
//
// ★★★ 相手の画面（11/9 23:5x・読むだけで確かめた）:
//   セラピスト一覧 GET /shop/image/girl/upload/all/ … 1人1行 <tr data-girl-id="<番号>">。「削除」ボタン（.gi-dlt-btn）を押すと確認の小窓が出て、
//   そのリンク GET /shop/image/girl/upload/delete/<番号>/ で消える（駅ちかと同じく GET で消える形）。
//
//   段: login → zenkoku_del_list（居るか）→ zenkoku_girl_delete（GET・送り直さない）→ zenkoku_del_list（照合: 居なくなったか）
//   ★ 記録は駅ちか・エステ魂の削除と同じ event='delete_girl'（ok／stopped・not_listed）。コネックエフの削除の続き（girlDeleteFinish）がこれを見る。

import type { FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { buildZenkokuGirlsRequest, ZENKOKU_GIRLS_URL, ZENKOKU_ORIGIN } from './zenkokuRequests';
import { RELAY_USER_AGENT } from './relayUserAgent';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };
const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
const loggedOut = (input: Input) => (input.status >= 300 && input.status < 400 && /\/login\/?(\?|$)/.test(locationOf(input)))
  || (input.status === 200 && /<form[^>]+action=["'][^"']*\/login\/?["']/i.test(input.body) && !/data-girl-id=/.test(input.body));

/** 一覧に載っている番号（data-girl-id） */
export function zenkokuListedGirlIds(html: string): string[] {
  return [...new Set([...String(html ?? '').matchAll(/data-girl-id=["'](\d{1,12})["']/g)].map((m) => m[1]))];
}
export function buildZenkokuGirlDeleteRequest(cookie: string, gid: string): { method: 'GET'; url: string; headers: Record<string, string>; body: '' } {
  if (!cookie) throw new Error('Cookie が無いまま削除しない');
  if (!/^\d{1,12}$/.test(gid)) throw new Error('全国エステランキングの番号の形が違います（' + gid + '）');
  return {
    method: 'GET', url: ZENKOKU_ORIGIN + '/shop/image/girl/upload/delete/' + gid + '/', body: '',
    headers: { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer: ZENKOKU_GIRLS_URL, cookie },
  };
}

function loginStop(ctx: RelayFlowContext, input: Input, stage: string): FlowOutcome {
  return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした。ログイン名・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage, flowId: ctx.flowId } }], note: stage + ' でログイン画面に戻された' };
}

/** ログインできたら、セラピスト一覧を読む */
export function zenkokuGirlDeleteFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  const r = buildZenkokuGirlsRequest(cookie);
  return { kind: 'next', next: { purpose: 'zenkoku_del_list', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: '全国エステランキングにログインした → 削除のためにセラピスト一覧を読む（★ まだ何も消していない）' };
}

export function afterZenkokuDelList(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'girl_delete_list');
  const gid = String(ctx.deleteCastId ?? '');
  const ids = zenkokuListedGirlIds(input.body);
  if (input.status >= 400 || ids.length === 0) {
    return { kind: 'stop', audits: [{ event: 'delete_girl', outcome: 'failed', summary: '全国エステランキングのセラピスト一覧を読み取れませんでした（削除はしていません）', detail: { castId: gid || null, httpStatus: input.status, reason: 'list_unreadable', flowId } }], note: 'セラピスト一覧を読めなかった' };
  }
  const listed = ids.includes(gid);
  if (ctx.deleteStage === 'verify') {
    if (listed) {
      return { kind: 'stop', audits: [{ event: 'delete_girl', outcome: 'failed', summary: '全国エステランキングから削除できませんでした（番号 ' + gid + ' がまだ一覧にいます）', detail: { castId: gid, reason: 'still_listed', flowId } }], note: '削除を送ったが、まだ一覧に居た' };
    }
    return { kind: 'done', audits: [{ event: 'delete_girl', outcome: 'ok', summary: '全国エステランキングからセラピスト（番号 ' + gid + '）を削除しました', detail: { castId: gid, people: ids.length, flowId } }], note: '削除を確認した（' + ids.length + '名を読み直した）' };
  }
  if (!/^\d{1,12}$/.test(gid)) {
    return { kind: 'stop', audits: [{ event: 'delete_girl', outcome: 'stopped', summary: '削除する相手が指定されていないため、何もしませんでした', detail: { reason: 'no_cast_id', flowId } }], note: '削除する相手が文脈に無い' };
  }
  if (!listed) {
    return { kind: 'done', audits: [{ event: 'delete_girl', outcome: 'stopped', summary: '番号 ' + gid + ' は全国エステランキングの一覧に居ないため、何もしませんでした', detail: { castId: gid, people: ids.length, reason: 'not_listed', flowId } }], note: '一覧に居ないので削除しない' };
  }
  const r = buildZenkokuGirlDeleteRequest(cookie, gid);
  return {
    kind: 'next',
    next: { purpose: 'zenkoku_girl_delete', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie, deleteStage: 'verify', deleteBefore: ids.length } },
    audits: [{ event: 'login', outcome: 'ok', summary: '全国エステランキングにログインできました', detail: { flowId } }],
    note: '番号 ' + gid + ' を削除する（' + ids.length + '名の一覧を読んだ）',
  };
}

/** 削除の応答（ふつうは一覧へのリダイレクト）。★ 成否は読み直して確かめる */
export function afterZenkokuGirlDelete(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'girl_delete');
  if (input.status >= 400) {
    return { kind: 'stop', audits: [{ event: 'delete_girl', outcome: 'failed', summary: '全国エステランキングの削除で想定外の応答がありました（応答 ' + input.status + '）', detail: { castId: ctx.deleteCastId ?? null, httpStatus: input.status, reason: 'http_error', flowId: ctx.flowId } }], note: '削除の応答が ' + input.status };
  }
  const r = buildZenkokuGirlsRequest(cookie);
  return { kind: 'next', next: { purpose: 'zenkoku_del_list', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: '削除を送った（' + input.status + '）→ 一覧を読み直して確かめる' };
}
