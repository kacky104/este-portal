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
import {
  ESUTAMA_OPT_LABEL, parseGoNowPage, goNowBoostAccepted, parseCastAppealPage, pickCastToAppeal,
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

  return finish(ctx, { remaining: null, readAt, pressed: false, outcome: 'not_ready' }, [readAudit], label + 'はまだ押す仕組みができていない');
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
