// エステ魂の「即セラ」をONにする段（第143便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ 段の並び
//   esutama_sokusera_token   POST create_shop_token       → login_token
//   esutama_sokusera_proxy   GET  /login/shop_token/<t>   → ★ 307。★ 中身は空
//   esutama_sokusera_page    GET  /tamathera/sokuthera/   → ★★ 本人確認＋状態＋呼びかけ
//   esutama_sokusera_start   POST /tamathera/sokuthera/ajax_start
//   esutama_sokusera_verify  GET  /tamathera/sokuthera/   → ★★★ 読み返して確かめる
//   esutama_sokusera_end     GET  /login/end_proxy/       → ★ 必ず通る
//
// ★★★ 写メ日記との違いが2つある
//   ① **読み返して確かめられる**（★ 同じページに ON/OFF が書いてある）
//      → 「送った」と「効いた」を混ぜない。★ 相手のJSONの形に頼らない。
//   ② **OFFは打たない**（★ 60分で相手が勝手に切る。★ 業界の風習として誰も手動OFFしない）
//
// ★★★ 本人確認は【設定ページ】で行う（★ 写メ日記と同じ。第135便の形）。
//   ★ 代理ログインの応答は 307 で中身が空。★ そこでは何も確かめられない。

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import {
  parseEsutamaShopToken, isProxyLoggedInAs, parseProxyLoggedInName,
} from './esutamaTherapistParse';
import { parseSokuseraPage, decideSokuseraStart, sokuseraStartBody } from './esutamaSokuseraParse';
import {
  buildEsutamaCreateShopTokenRequest, buildEsutamaProxyLoginRequest,
  buildEsutamaSokuseraPageRequest, buildEsutamaSokuseraStartRequest, buildEsutamaEndProxyRequest,
} from './esutamaRequests';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

/** ★★★ 代理ログイン中に止めるときは、まず end_proxy を積む。★ 本人のセッションを残さない */
function stopViaEndProxy(ctx: RelayFlowContext, audits: FlowAudit[], note: string): FlowOutcome {
  if (!ctx.esutamaProxyOpen) return stop(audits, note);
  const r = buildEsutamaEndProxyRequest(ctx.cookie);
  return {
    kind: 'next',
    next: {
      purpose: 'esutama_sokusera_end' as const,
      method: r.method, url: r.url, headers: r.headers, body: '',
      context: { ...ctx, esutamaSokuseraStopNote: note },
    },
    audits,
    note: '止めます（' + note + '）。★ 先に代理ログインを終えます',
  };
}

/** ① 代理ログイン用トークンの応答。★ ここから本人のセッションへ入る */
export function afterEsutamaSokuseraToken(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const r = parseEsutamaShopToken(input.body);
  const audits: FlowAudit[] = [{
    event: 'diary_proxy_token',
    outcome: r.ok ? 'ok' : 'failed',
    // ★★ token も login_url も入れない。★ 期限だけ
    detail: { status: input.status, castId: ctx.esutamaSokuseraCastId ?? null, expiresAt: r.ok ? r.expiresAt : null, use: 'sokusera' },
  }];
  if (!r.ok) return stop(audits, '代理ログインの発行を断られました（' + r.error + '）');
  let req;
  try { req = buildEsutamaProxyLoginRequest(cookie, r.token); }
  catch { return stop(audits, '代理ログインのURLを組み立てられませんでした'); }
  return {
    kind: 'next',
    next: {
      purpose: 'esutama_sokusera_proxy', method: req.method, url: req.url, headers: req.headers, body: '',
      context: { ...ctx, cookie, esutamaProxyOpen: true },
    },
    audits,
    note: '代理ログインへ入ります（' + (ctx.esutamaSokuseraCastName ?? '') + 'さん）',
  };
}

/**
 * ② 代理ログインの応答。
 * ★★ ここでは【何も主張しない】。★ 応答は 307 で中身が空（第135便の実測）。
 *   ★ 本人確認は次の段（設定ページ）で行う。
 */
export function afterEsutamaSokuseraProxy(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const next = { ...ctx, cookie, esutamaProxyOpen: true };
  if (input.status < 200 || input.status >= 400) {
    return stopViaEndProxy(next, [{
      event: 'diary_proxy_login', outcome: 'failed',
      detail: { status: input.status, castId: ctx.esutamaSokuseraCastId ?? null, matched: false, loggedInAs: null, use: 'sokusera' },
    }], '代理ログインに入れませんでした（' + input.status + '）');
  }
  const r = buildEsutamaSokuseraPageRequest(cookie);
  return {
    kind: 'next',
    next: { purpose: 'esutama_sokusera_page', method: r.method, url: r.url, headers: r.headers, body: '', context: next },
    audits: [],
    note: '代理ログインの応答は ' + input.status + ' でした。★ 本人確認は設定ページで行います',
  };
}

/**
 * ③ 即セラの設定ページ。★★★ ここが要。
 *   ・本人確認（★ 別の人のアカウントを触らない）
 *   ・いまの状態（ON/OFF）
 *   ・ひとこと呼びかけ（★ 読めなければ打たない）
 */
export function afterEsutamaSokuseraPage(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const name = String(ctx.esutamaSokuseraCastName ?? '');
  const matched = isProxyLoggedInAs(input.body, name);
  const loggedInAs = parseProxyLoggedInName(input.body);
  const page = parseSokuseraPage(input.body);
  const next = { ...ctx, cookie };

  const audits: FlowAudit[] = [{
    event: 'diary_proxy_login',
    outcome: matched ? 'ok' : 'failed',
    detail: { status: input.status, castId: ctx.esutamaSokuseraCastId ?? null, name, matched, loggedInAs, use: 'sokusera' },
  }];

  if (input.status < 200 || input.status >= 400) {
    return stopViaEndProxy(next, audits, '即セラの設定ページを読めませんでした（' + input.status + '）');
  }
  // ★★★ 最後の砦。★ 別の人のアカウントを触らない
  if (!matched) {
    return stopViaEndProxy(next, audits, loggedInAs === null
      ? '設定ページに「ログイン中です」の表示が見つかりませんでした（' + name + 'さんとして入れていません）'
      : '設定ページに出ていたのは【' + loggedInAs + '】さんでした（頼んだのは ' + name + 'さん）');
  }

  const v = decideSokuseraStart(page);
  audits.push({
    event: 'read_sokusera', outcome: 'ok',
    detail: { status: page.status, hasMessage: page.message !== null, willStart: v.send, use: 'sokusera' },
  });
  // ★★ 打たない理由は【全部】ここで出る。★ すでにON・読めない・呼びかけが無い
  if (!v.send) return stopViaEndProxy(next, audits, v.note);

  const r = buildEsutamaSokuseraStartRequest(cookie, sokuseraStartBody(v.message));
  return {
    kind: 'next',
    next: {
      purpose: 'esutama_sokusera_start', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '',
      // ★ 送った呼びかけを持ち回る（★ 読み返しで消えていないか見る）
      context: { ...next, esutamaSokuseraSentMessage: v.message },
    },
    audits,
    note: name + 'さんの即セラをONにします',
  };
}

/**
 * ④ ONの応答。
 * ★★★ ここでは【成否を決めない】。★ 相手のJSONの形を知らない。
 *   → **次の段で読み返して確かめる。** ★ これができるのが即セラの強み。
 */
export function afterEsutamaSokuseraStart(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const next = { ...ctx, cookie };
  const audits: FlowAudit[] = [{
    event: 'push_sokusera',
    // ★ 通信そのものの成否だけ。★ 「ONになったか」は読み返しで決める
    outcome: input.status >= 200 && input.status < 400 ? 'ok' : 'failed',
    summary: '',
    detail: {
      status: input.status, castId: ctx.esutamaSokuseraCastId ?? null,
      name: ctx.esutamaSokuseraCastName ?? null, bodyLength: String(input.body ?? '').length,
    },
  }];
  if (input.status < 200 || input.status >= 400) {
    return stopViaEndProxy(next, audits, '即セラをONにできませんでした（' + input.status + '）');
  }
  const r = buildEsutamaSokuseraPageRequest(cookie);
  return {
    kind: 'next',
    next: { purpose: 'esutama_sokusera_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: next },
    audits,
    note: '送りました。★ ONになったかを読み返して確かめます',
  };
}

/**
 * ⑤ ★★★ 読み返し。★ ここで初めて「効いた」と言える。
 *   ★ 呼びかけが消えていないかも見る（★ 2026-09-04 に空送信で消した事故がある）。
 */
export function afterEsutamaSokuseraVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const page = parseSokuseraPage(input.body);
  const sent = ctx.esutamaSokuseraSentMessage ?? null;
  // ★ 送った呼びかけが残っているか。★ 送っていない（null）なら見ない
  const messageKept = sent === null ? null : page.message === sent;
  const on = page.status === 'on';
  const audits: FlowAudit[] = [{
    event: 'verify_sokusera',
    // ★★ 'unknown'（読めなかった）を ok にしない。★ 分からないことを成功と書かない
    outcome: on ? 'ok' : page.status === 'off' ? 'failed' : 'stopped',
    detail: { status: input.status, sokusera: page.status, messageKept, castId: ctx.esutamaSokuseraCastId ?? null },
  }];
  const next = { ...ctx, cookie, esutamaSokuseraOn: on };
  const note = on
    ? (ctx.esutamaSokuseraCastName ?? '') + 'さんの即セラがONになりました'
      + (messageKept === false ? '。★★ ただし、ひとこと呼びかけが変わっています' : '')
    : page.status === 'off'
      ? '★ 送りましたが、即セラはOFFのままでした'
      : '★ 送りましたが、即セラの状態を読み取れませんでした';
  // ★★★ どの結果でも end_proxy を通す。★ 本人のセッションを残さない
  const r = buildEsutamaEndProxyRequest(cookie);
  return {
    kind: 'next',
    next: {
      purpose: 'esutama_sokusera_end', method: r.method, url: r.url, headers: r.headers, body: '',
      context: { ...next, ...(on ? {} : { esutamaSokuseraStopNote: note }) },
    },
    audits,
    note: note + '。代理ログインを終えます',
  };
}

/** ⑥ 代理ログインを終えた。★ ここで流れが終わる */
export function afterEsutamaSokuseraEnd(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const ended = input.status >= 200 && input.status < 400;
  const audits: FlowAudit[] = [{ event: 'diary_proxy_end', outcome: ended ? 'ok' : 'failed', detail: { status: input.status, use: 'sokusera' } }];
  if (!ended) {
    return stop(audits, '★ 代理ログインを終えられませんでした（' + input.status + '）。★ 店舗様の画面で「代理ログイン終了」をお願いします');
  }
  const note = ctx.esutamaSokuseraStopNote;
  if (note) return stop(audits, note + '（代理ログインは終えました）');
  return {
    kind: 'done',
    audits,
    note: (ctx.esutamaSokuseraCastName ?? '') + 'さんの即セラをONにしました',
  };
}

/** ★ token 発行の段を組む（★ 呼び出し側＝DB側が相手を決めたあとで使う） */
export function buildEsutamaSokuseraTokenStep(ctx: RelayFlowContext, castId: string, ctk: string) {
  const r = buildEsutamaCreateShopTokenRequest(ctx.cookie, castId, ctk);
  return { purpose: 'esutama_sokusera_token' as const, method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: ctx };
}
