// エステ魂の「集客ワンクリックアピール」を押す流れ（第1314便・2026-10-08。第1798便で店舗情報のあとクーポン・体験談も続けて押す）。
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
  parseEsutamaAppealPage, esutamaAppealUsable, esutamaAppealPressed, parseEsutamaAppealRow,
  buildEsutamaAppealPageRequest, buildEsutamaAppealPostRequest, ESUTAMA_APPEAL_DAILY,
  ESUTAMA_APPEAL_ROW, ESUTAMA_APPEAL_ROWS, ESUTAMA_APPEAL_ROW_LABEL,
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


/** ★ 第1930便: 画面の3行ぶんの残り・最終アピール（行ごとの記録に書く） */
function readAllRows(html: string, now: Date, results: Record<string, { ok: boolean }> = {}) {
  return ESUTAMA_APPEAL_ROWS.map((row) => {
    const r = parseEsutamaAppealRow(html, row, now);
    return { row, remaining: r?.remaining ?? null, lastAt: r?.lastAt ?? null, pressed: results[row]?.ok === true };
  });
}

/** ★ 第1930便: 行ごとの設定で押すとき（ctx.esutamaAppealOnly）。残りのある行だけを順に押す */
function nextOnlyRow(html: string, now: Date, queue: string[]): { row: string; before: { remaining: number | null; lastAt: string | null }; rest: string[] } | null {
  const q = [...queue];
  while (q.length > 0) {
    const row = q.shift() as string;
    const b = parseEsutamaAppealRow(html, row, now);
    if (b && (b.remaining ?? 0) > 0) return { row, before: { remaining: b.remaining, lastAt: b.lastAt }, rest: q };
  }
  return null;
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
  // ★ 第1930便: 行ごとの設定（周が押す行を決めた・店舗様が行の「いま1回」を押した）。★ 店舗情報での判断はしない
  if (Array.isArray(ctx.esutamaAppealOnly) && ctx.esutamaAppealOnly.length > 0) {
    const first = nextOnlyRow(input.body, now, ctx.esutamaAppealOnly);
    if (!first) {
      const extra: FlowAudit[] = ctx.bumpForce === true
        ? [{ event: 'push_bump', outcome: 'stopped', detail: { reason: 'no_quota', manual: true, rows: ctx.esutamaAppealOnly.map((k) => ESUTAMA_APPEAL_ROW_LABEL[k] ?? k).join('・'), flowId } }]
        : [];
      return { kind: 'done', audits: [...audits, ...extra], note: 'アピールする行の残りがなかった', esutamaAppealRows: { readAt, rows: readAllRows(input.body, now) } };
    }
    const p1 = buildEsutamaAppealPostRequest(cookie, String(page.ctk), first.row);
    return {
      kind: 'next',
      next: {
        purpose: 'esutama_appeal_set', method: p1.method, url: p1.url, headers: p1.headers, body: p1.body ?? '',
        context: { ...ctx, cookie, esutamaAppealRow: first.row, esutamaAppealQueue: first.rest, esutamaAppealRowBefore: first.before, esutamaAppealResults: {} },
      },
      audits,
      note: (ESUTAMA_APPEAL_ROW_LABEL[first.row] ?? first.row) + 'をアピールする（残り ' + first.before.remaining + '）',
    };
  }
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
  const p = buildEsutamaAppealPostRequest(cookie, String(page.ctk), ESUTAMA_APPEAL_ROW);
  // ★ 第1798便: 店舗情報のあとに続けて押す行（クーポン・体験談）。★ 残りが1回以上ある行だけ
  const queue = ESUTAMA_APPEAL_ROWS.filter((k) => k !== ESUTAMA_APPEAL_ROW)
    .filter((k) => (parseEsutamaAppealRow(input.body, k, now)?.remaining ?? 0) > 0);
  return {
    kind: 'next',
    next: {
      purpose: 'esutama_appeal_set', method: p.method, url: p.url, headers: p.headers, body: p.body ?? '',
      context: {
        ...ctx, cookie, bumpBefore: { remaining: page.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: page.lastAt },
        esutamaAppealRow: ESUTAMA_APPEAL_ROW, esutamaAppealQueue: queue, esutamaAppealExtra: [], esutamaAppealShop: undefined, esutamaAppealRowBefore: undefined,
      },
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
  if (input.status >= 400 && Array.isArray(ctx.esutamaAppealOnly) && ctx.esutamaAppealOnly.length > 0) {
    // ★ 第1930便: 行ごとのときは、行ごとの表には書かない（読めていないので）。次の周が読み直す
    return {
      kind: 'done',
      audits: [{ event: 'push_bump', outcome: 'failed', detail: { httpStatus: input.status, reason: 'http_error', manual, rows: ESUTAMA_APPEAL_ROW_LABEL[ctx.esutamaAppealRow ?? ''] ?? '', flowId } }],
      note: 'アピールの応答が ' + input.status + ' だった',
    };
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

/** ③ 読み直した → 押せたか。★ 第1798便: 店舗情報が押せたら、残りのある行（クーポン・体験談）を続けて押す */
export function afterEsutamaAppealVerify(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const manual = ctx.bumpForce === true;
  const before = ctx.bumpBefore ?? { remaining: null, quota: ESUTAMA_APPEAL_DAILY, lastAt: null };
  const now = nowArg ?? new Date();
  const readAt = now.toISOString();
  const row = ctx.esutamaAppealRow ?? ESUTAMA_APPEAL_ROW;
  const extra = [...(ctx.esutamaAppealExtra ?? [])];
  const page = input.status === 200 ? parseEsutamaAppealPage(input.body, now) : null;

  // ── ★ 第1930便: 行ごとの設定で押しているとき（店舗情報を特別に扱わない） ──
  if (Array.isArray(ctx.esutamaAppealOnly) && ctx.esutamaAppealOnly.length > 0) {
    const results = { ...(ctx.esutamaAppealResults ?? {}) };
    const b = ctx.esutamaAppealRowBefore ?? { remaining: null, lastAt: null };
    const a = page ? parseEsutamaAppealRow(input.body, row, now) : null;
    const ok = !!a && ((b.remaining !== null && a.remaining !== null && a.remaining < b.remaining)
      || (!!a.lastAt && (!b.lastAt || Date.parse(a.lastAt) > Date.parse(b.lastAt))));
    results[row] = { ok, remaining: a?.remaining ?? b.remaining, lastAt: a?.lastAt ?? b.lastAt };
    if (page && page.ctk) {
      const nx = nextOnlyRow(input.body, now, ctx.esutamaAppealQueue ?? []);
      if (nx) {
        const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
        const p = buildEsutamaAppealPostRequest(cookie, page.ctk, nx.row);
        return {
          kind: 'next',
          next: {
            purpose: 'esutama_appeal_set', method: p.method, url: p.url, headers: p.headers, body: p.body ?? '',
            context: { ...ctx, cookie, esutamaAppealRow: nx.row, esutamaAppealQueue: nx.rest, esutamaAppealRowBefore: nx.before, esutamaAppealResults: results },
          },
          audits: [],
          note: (ESUTAMA_APPEAL_ROW_LABEL[nx.row] ?? nx.row) + 'も続けてアピールする（残り ' + nx.before.remaining + '）',
        };
      }
    }
    const okRows = Object.entries(results).filter(([, v]) => v.ok).map(([k]) => ESUTAMA_APPEAL_ROW_LABEL[k] ?? k);
    const ngRows = Object.entries(results).filter(([, v]) => !v.ok).map(([k]) => ESUTAMA_APPEAL_ROW_LABEL[k] ?? k);
    const rowsState = page ? readAllRows(input.body, now, results)
      : ESUTAMA_APPEAL_ROWS.map((k) => ({ row: k, remaining: results[k]?.remaining ?? null, lastAt: results[k]?.lastAt ?? null, pressed: results[k]?.ok === true }));
    return {
      kind: 'done',
      audits: okRows.length > 0
        ? [{ event: 'push_bump', outcome: 'ok', detail: { manual, flowId, rows: okRows.join('・'), ...(ngRows.length ? { notAccepted: ngRows.join('・') } : {}) } }]
        : [{ event: 'push_bump', outcome: 'failed', detail: { reason: page ? 'not_accepted' : 'verify_unreadable', manual, flowId, rows: ngRows.join('・') } }],
      note: okRows.length > 0 ? okRows.join('・') + 'をアピールできた' : 'アピールを送ったが、押せたか確かめられなかった',
      esutamaAppealRows: { readAt, rows: rowsState },
    };
  }

  // ── 店舗情報の結果 ──
  let shop = ctx.esutamaAppealShop;
  if (row === ESUTAMA_APPEAL_ROW) {
    if (!page || page.remaining === null) {
      // ★ 読み直せなかった。★ 押せたかどうか分からない（＝押し直さない。次の周が読み直す）
      return {
        kind: 'done',
        audits: [{ event: 'push_bump', outcome: 'failed', detail: { httpStatus: input.status, reason: 'verify_unreadable', manual, flowId } }],
        note: 'アピールのあと画面を読み直せなかった（押せたか分からない）',
        ekichikaBump: { remaining: before.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: before.lastAt, readAt, pressed: false },
      };
    }
    shop = { ok: esutamaAppealPressed(before, page), remaining: page.remaining, lastAt: page.lastAt };
  } else if (page) {
    // ── クーポン・体験談の結果（★ 読み直しで決める） ──
    const b = ctx.esutamaAppealRowBefore ?? { remaining: null, lastAt: null };
    const a = parseEsutamaAppealRow(input.body, row, now);
    const ok = !!a && ((b.remaining !== null && a.remaining !== null && a.remaining < b.remaining)
      || (!!a.lastAt && (!b.lastAt || Date.parse(a.lastAt) > Date.parse(b.lastAt))));
    if (ok) extra.push(ESUTAMA_APPEAL_ROW_LABEL[row] ?? row);
    if (page.remaining !== null && shop) shop = { ...shop, remaining: page.remaining, lastAt: page.lastAt ?? shop.lastAt };
  }
  const shopRes = shop ?? { ok: false, remaining: before.remaining, lastAt: before.lastAt };

  // ── 続けて押す行（★ 店舗情報が押せたときだけ・ctk が読めたときだけ） ──
  if (shopRes.ok && page && page.ctk) {
    const queue = [...(ctx.esutamaAppealQueue ?? [])];
    while (queue.length > 0) {
      const nextRow = queue.shift() as string;
      const nb = parseEsutamaAppealRow(input.body, nextRow, now);
      if (!nb || (nb.remaining ?? 0) <= 0) continue;
      const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
      const p = buildEsutamaAppealPostRequest(cookie, page.ctk, nextRow);
      return {
        kind: 'next',
        next: {
          purpose: 'esutama_appeal_set', method: p.method, url: p.url, headers: p.headers, body: p.body ?? '',
          context: { ...ctx, cookie, esutamaAppealRow: nextRow, esutamaAppealQueue: queue, esutamaAppealRowBefore: nb, esutamaAppealShop: shopRes, esutamaAppealExtra: extra },
        },
        audits: [],
        note: (ESUTAMA_APPEAL_ROW_LABEL[nextRow] ?? nextRow) + 'も続けてアピールする（残り ' + nb.remaining + '）',
      };
    }
  }

  if (shopRes.ok) {
    return {
      kind: 'done',
      audits: [{ event: 'push_bump', outcome: 'ok', detail: { remaining: shopRes.remaining, quota: ESUTAMA_APPEAL_DAILY, manual, flowId, ...(extra.length ? { also: extra.join('・') } : {}) } }],
      note: '店舗情報' + (extra.length ? '・' + extra.join('・') : '') + 'をアピールできた（残り ' + shopRes.remaining + '）',
      ekichikaBump: { remaining: shopRes.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: shopRes.lastAt ?? readAt, readAt, pressed: true },
    };
  }
  return {
    kind: 'done',
    audits: [{ event: 'push_bump', outcome: 'failed', detail: { reason: 'not_accepted', remaining: shopRes.remaining, manual, flowId } }],
    note: 'アピールを送ったが、残り回数も最終アピールも変わらなかった',
    ekichikaBump: { remaining: shopRes.remaining, quota: ESUTAMA_APPEAL_DAILY, lastAt: shopRes.lastAt, readAt, pressed: false },
  };
}
