// 全国エステランキングの段（状態遷移・第1769便・2026-11-07・純粋関数）。relayFlow.ts の advanceFlow から呼ばれる。
//
// ★★★ 段の名前を 'zenkoku_…' で分けている。駅ちか・エステ魂の段には一切触れない。
//
//   zenkoku_login_page  GET  /login/                 → Cookie と隠し値3つを拾う → 【DB側】が認証情報を足してログイン POST を積む
//   zenkoku_login       POST /login/                 → 応答を読む → セラピスト一覧 GET を積む
//   zenkoku_roster      GET  /shop/image/girl/upload/all/ → 一覧を読む（読めた＝ログインできた）→ 【DB側】が結びつけと7日分の計画を文脈に入れ、1日目の GET を積む
//   zenkoku_day_read    GET  /shop/schedule/<日付>/  → その日を読む → 計画と比べる →
//                         読むだけ: 記録して次の日へ ／ 送る: 変わる日だけ保存 POST を積む
//   zenkoku_day_save    POST /shop/schedule/<日付>/  → 照合の GET を積む
//   zenkoku_day_verify  GET  /shop/schedule/<日付>/  → 送った内容と一致するか → 次の日へ
//
// ★★★ パスワードは文脈に入れない（ログイン POST を組むのは DB 側）。
// ★★★ ZENKOKU_WRITE_ENABLED が false のあいだは、work_push / work_auto でも【読むだけ】（1文字も書き換えない）。

import type { FlowAudit, FlowOutcome, RelayFlowContext, EsutamaDiffRow, EsutamaPlanSummary } from './relayFlow';
import { mergeCookies } from './relayJob';
import {
  readZenkokuLoginForm, looksLikeZenkokuLoginPage, parseZenkokuGirlList, parseZenkokuDayPage,
  planZenkokuDay, buildZenkokuDayPayload, zenkokuCellLabel, ZENKOKU_MAX_FIELDS,
} from './zenkokuParse';
import { buildZenkokuGirlsRequest, buildZenkokuDayReadRequest, buildZenkokuDaySaveRequest, ZENKOKU_LOGIN_URL } from './zenkokuRequests';

/**
 * ★★★ 全国エステランキングへ出勤を【書き込む】のを許すか。
 *   ★ 第1769便では false（読むだけの段まで）。★ 読むだけで実物と合うのを確かめてから、次の便で true にする。
 */
// ★ 第1804便（2026-11-09・カッキーさん）: 開けた。保存のフォームの中身（項目の並び・332項目＝2＋55名×6）を
//   11/10 の出勤画面で実物と照らし合わせ、buildZenkokuDayPayload と同じ形であることを確かめた（読むだけ）。
//   ★ 送るのは「フクエスから反映」にした枠だけ（work_push / work_auto）。接続テスト・試し打ちは今までどおり読むだけ。
export const ZENKOKU_WRITE_ENABLED = true;

/** 全国エステランキングへ送る日数（今日の営業日から） */
export const ZENKOKU_WINDOW_DAYS = 7;

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

function cookieOf(input: Input, ctx: RelayFlowContext): string {
  return mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
}

function headerOf(input: Input, name: string): string {
  const v = input.headers[name];
  return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
}

/** この流れで書き込んでよいか */
export function zenkokuCanWrite(ctx: RelayFlowContext): boolean {
  return ZENKOKU_WRITE_ENABLED && (ctx.intent === 'work_push' || ctx.intent === 'work_auto');
}

// ────────────────────────── ① ログイン画面 ──────────────────────────

export function afterZenkokuLoginPage(input: Input, ctx: RelayFlowContext): FlowOutcome {
  if (input.status >= 400) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '全国エステランキングのログイン画面を開けませんでした', detail: { httpStatus: input.status, reason: 'http_error', stage: 'login_page', flowId: ctx.flowId } }],
      '全国エステランキングのログイン画面が ' + input.status + ' だった',
    );
  }
  const form = readZenkokuLoginForm(input.body);
  if (!form) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '全国エステランキングのログイン画面の形が変わったため、ログインできませんでした', detail: { httpStatus: input.status, reason: 'form_missing', stage: 'login_page', flowId: ctx.flowId } }],
      'ログイン画面に隠し値（_csrfToken・_Token）が無い',
    );
  }
  return {
    kind: 'zenkoku_login_needed',
    form,
    context: { ...ctx, cookie: cookieOf(input, ctx) },
    audits: [],
    note: '全国エステランキングのログイン画面を読めた',
  };
}

// ────────────────────────── ② ログイン応答 ──────────────────────────

export function afterZenkokuLogin(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  const location = headerOf(input, 'location');
  // ★ 断られると、ログイン画面がもう一度返る（200）か、ログイン画面へ戻される
  const backToLogin = (input.status >= 300 && input.status < 400 && /\/login\/?(\?|$)/.test(location))
    || (input.status === 200 && looksLikeZenkokuLoginPage(input.body));
  if (backToLogin) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした。ログイン名・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', flowId: ctx.flowId } }],
      '全国エステランキングのログインが断られた',
    );
  }
  if (input.status >= 400) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした（応答 ' + input.status + '）', detail: { httpStatus: input.status, reason: 'http_error', flowId: ctx.flowId } }],
      '全国エステランキングのログインの応答が ' + input.status + ' だった',
    );
  }
  // ★ 本当にログインできたかは、次のセラピスト一覧が読めたかで確かめる（駅ちか・エステ魂と同じ作法）
  const r = buildZenkokuGirlsRequest(cookie);
  return {
    kind: 'next',
    next: { purpose: 'zenkoku_roster', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } },
    audits: [],
    note: '全国エステランキングのログインの応答を受けた（' + input.status + '）',
  };
}

// ────────────────────────── ③ セラピスト一覧 ──────────────────────────

export function afterZenkokuRoster(input: Input, ctx: RelayFlowContext): FlowOutcome {
  if (looksLikeZenkokuLoginPage(input.body) || (input.status >= 300 && input.status < 400 && /\/login\//.test(headerOf(input, 'location')))) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした。ログイン名・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage: 'roster', flowId: ctx.flowId } }],
      'セラピスト一覧を開いたらログイン画面だった',
    );
  }
  if (input.status >= 400) {
    return stop(
      [{ event: 'read_girls', outcome: 'failed', summary: '全国エステランキングのセラピスト一覧を開けませんでした（応答 ' + input.status + '）', detail: { httpStatus: input.status, reason: 'http_error', flowId: ctx.flowId } }],
      'セラピスト一覧が ' + input.status + ' だった',
    );
  }
  const { rows, warnings } = parseZenkokuGirlList(input.body);
  if (rows.length === 0) {
    return stop(
      [{ event: 'read_girls', outcome: 'failed', summary: '全国エステランキングのセラピスト一覧を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { httpStatus: input.status, reason: 'no_rows', flowId: ctx.flowId } }],
      'セラピスト一覧に行が無い',
    );
  }
  return {
    kind: 'zenkoku_roster',
    rows,
    warnings,
    context: { ...ctx, cookie: cookieOf(input, ctx) },
    audits: [{ event: 'login', outcome: 'ok', summary: '全国エステランキングにログインできました', detail: { flowId: ctx.flowId, roster: rows.length } }],
    note: '全国エステランキングのセラピスト ' + rows.length + '名を読めた',
  };
}

// ────────────────────────── ④ 日ごとの出勤 ──────────────────────────

function dayOf(ctx: RelayFlowContext): string | null {
  const w = ctx.zenkokuWindow ?? [];
  const i = ctx.zenkokuDayIndex ?? 0;
  return w[i] ?? null;
}

function summaryOf(ctx: RelayFlowContext): EsutamaPlanSummary {
  const diffs = ctx.zenkokuDiffs ?? [];
  return {
    window: ctx.zenkokuWindow ?? [],
    diffs,
    blocked: ctx.zenkokuBlocked ?? [],
    notes: ctx.zenkokuNotes ?? [],
    people: ctx.zenkokuPeople ?? 0,
    changed: ctx.zenkokuChanged ?? 0,
    saved: ctx.zenkokuSaved ?? 0,
    // ★ 書き込みを開けるまでは、人が押しても送れない
    // ★ 第1806便（カッキーさん）: 違いが0件でも「送れる」＝自動にできる（0件なら送るものが無いだけ）。
    //   全国エステランキングに居ない方（blocked）は止める理由にしない（その方は送らないだけ・lib 側で notes に出す）
    sendable: ZENKOKU_WRITE_ENABLED,
    fingerprint: diffs.map((d) => d.castId + ':' + d.dayIndex + ':' + d.after).sort().join('|'),
  };
}

/** 次の日へ。★ 最後の日のあとは、まとめを返して終わる */
export function nextZenkokuDay(ctx: RelayFlowContext, audits: FlowAudit[], note: string): FlowOutcome {
  const i = (ctx.zenkokuDayIndex ?? 0) + 1;
  const w = ctx.zenkokuWindow ?? [];
  if (i < w.length) {
    const r = buildZenkokuDayReadRequest(ctx.cookie, w[i]);
    return {
      kind: 'next',
      next: { purpose: 'zenkoku_day_read', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, zenkokuDayIndex: i, zenkokuExpect: undefined } },
      audits,
      note,
    };
  }
  const plan = summaryOf(ctx);
  const writing = zenkokuCanWrite(ctx);
  const summary = writing
    ? '全国エステランキングへ出勤を送りました（' + w.length + '日分・保存 ' + plan.saved + '／' + plan.changed + '件）'
    : '全国エステランキングの出勤を読みました（' + w.length + '日分・フクエスと違うところ ' + plan.diffs.length + '件）';
  return {
    kind: 'done',
    audits: [
      ...audits,
      {
        event: 'plan_work', outcome: 'ok', summary,
        detail: {
          changes: plan.diffs.length, targets: plan.people, sendable: plan.diffs.length === 0 ? true : plan.sendable,
          blocked: plan.blocked.length, held: ctx.zenkokuHeld ?? 0, writing, flowId: ctx.flowId,
        },
      },
    ],
    note: note + ' → ' + summary,
    esutamaPlan: plan,
  };
}

export function afterZenkokuDayRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const dateISO = dayOf(ctx);
  if (!dateISO) return stop([], '読む日が文脈に無い');
  const cookie = cookieOf(input, ctx);
  if (input.status >= 400) {
    return stop(
      [{ event: 'read_work', outcome: 'failed', summary: '全国エステランキングの出勤（' + dateISO + '）を開けませんでした（応答 ' + input.status + '）', detail: { httpStatus: input.status, dateISO, flowId: ctx.flowId } }],
      dateISO + ' の出勤が ' + input.status,
    );
  }
  const parsed = parseZenkokuDayPage(input.body, dateISO);
  if ('error' in parsed) {
    const login = parsed.error === 'login_page';
    return stop(
      [{
        event: login ? 'login' : 'read_work', outcome: 'failed',
        summary: login ? '全国エステランキングのログインが途中で切れました' : '全国エステランキングの出勤（' + dateISO + '）を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: { reason: parsed.error, dateISO, flowId: ctx.flowId },
      }],
      dateISO + ' の出勤を読めない: ' + parsed.error,
    );
  }
  const page = parsed.page;
  const want = ctx.zenkokuWant?.[dateISO] ?? {};
  const dayIndex = ctx.zenkokuDayIndex ?? 0;
  const auto = ctx.intent === 'work_auto';
  const plan = planZenkokuDay(page, want, { holdClears: auto && ctx.zenkokuHoldClears === true });
  const diffs: EsutamaDiffRow[] = [
    ...(ctx.zenkokuDiffs ?? []),
    ...plan.changes.map((c) => ({ castId: c.gid, name: c.name, dayIndex, before: c.before, after: c.after })),
  ];
  const notes = [...(ctx.zenkokuNotes ?? [])];
  if (plan.missing.length > 0) notes.push(dateISO + ': 出勤の画面に居ない方 ' + plan.missing.length + '名（全国エステランキングで消えた可能性）');
  const next: RelayFlowContext = {
    ...ctx, cookie, zenkokuDiffs: diffs, zenkokuNotes: notes,
    zenkokuHeld: (ctx.zenkokuHeld ?? 0) + plan.held,
  };

  if (!zenkokuCanWrite(ctx) || plan.changes.length === 0) {
    return nextZenkokuDay(next, [], dateISO + ' 読んだ（違い ' + plan.changes.length + '件）');
  }

  const payload = buildZenkokuDayPayload(page, plan.changes);
  if (payload.fields > ZENKOKU_MAX_FIELDS) {
    return nextZenkokuDay(next, [{
      event: 'write_work', outcome: 'failed',
      summary: '全国エステランキングの出勤（' + dateISO + '）は、セラピストが多すぎるため送れませんでした（' + page.rows.length + '名）',
      detail: { reason: 'too_many_fields', fields: payload.fields, dateISO, flowId: ctx.flowId },
    }], dateISO + ' は項目が多すぎて送らない');
  }
  const expect: Record<string, string> = {};
  for (const c of plan.changes) expect[c.gid] = c.after;
  const r = buildZenkokuDaySaveRequest(cookie, dateISO, payload.body);
  return {
    kind: 'next',
    next: {
      purpose: 'zenkoku_day_save', method: r.method, url: r.url, headers: r.headers, body: r.body,
      context: { ...next, zenkokuExpect: expect, zenkokuChanged: (ctx.zenkokuChanged ?? 0) + plan.changes.length },
    },
    audits: [],
    note: dateISO + ' を保存する（' + plan.changes.length + '名）',
  };
}

export function afterZenkokuDaySave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const dateISO = dayOf(ctx);
  if (!dateISO) return stop([], '保存した日が文脈に無い');
  const cookie = cookieOf(input, ctx);
  if (input.status >= 400) {
    return nextZenkokuDay({ ...ctx, cookie }, [{
      event: 'write_work', outcome: 'failed',
      summary: '全国エステランキングへ出勤（' + dateISO + '）を送れませんでした（応答 ' + input.status + '）',
      detail: { httpStatus: input.status, dateISO, flowId: ctx.flowId },
    }], dateISO + ' の保存が ' + input.status);
  }
  // ★ 応答では判定しない。★ 読み直して確かめる
  const r = buildZenkokuDayReadRequest(cookie, dateISO);
  return {
    kind: 'next',
    next: { purpose: 'zenkoku_day_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } },
    audits: [],
    note: dateISO + ' を保存した（' + input.status + '）→ 読み直す',
  };
}

export function afterZenkokuDayVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const dateISO = dayOf(ctx);
  if (!dateISO) return stop([], '照合する日が文脈に無い');
  const cookie = cookieOf(input, ctx);
  const expect = ctx.zenkokuExpect ?? {};
  const parsed = input.status < 400 ? parseZenkokuDayPage(input.body, dateISO) : { error: 'http_' + input.status };
  if ('error' in parsed) {
    return nextZenkokuDay({ ...ctx, cookie }, [{
      event: 'write_work', outcome: 'failed',
      summary: '全国エステランキングへ出勤（' + dateISO + '）を送りましたが、確かめられませんでした',
      detail: { reason: parsed.error, dateISO, flowId: ctx.flowId },
    }], dateISO + ' の照合で読めない');
  }
  const byGid = new Map(parsed.page.rows.map((r) => [r.gid, r] as const));
  const okGids: string[] = [];
  const ngNames: string[] = [];
  for (const [gid, after] of Object.entries(expect)) {
    const row = byGid.get(gid);
    if (row && zenkokuCellLabel(row) === after) okGids.push(gid);
    else ngNames.push(row?.name || gid);
  }
  const dayIndex = ctx.zenkokuDayIndex ?? 0;
  // ★ 確かめられた分は「残っている違い」から外す
  const ok = new Set(okGids);
  const diffs = (ctx.zenkokuDiffs ?? []).filter((d) => !(d.dayIndex === dayIndex && ok.has(d.castId)));
  const audit: FlowAudit = ngNames.length === 0
    ? { event: 'write_work', outcome: 'ok', summary: '全国エステランキングへ出勤（' + dateISO + '）を送りました（' + okGids.length + '名）', detail: { dateISO, saved: okGids.length, flowId: ctx.flowId } }
    : { event: 'write_work', outcome: 'failed', summary: '全国エステランキングへ出勤（' + dateISO + '）を送りましたが、反映されていない方がいます（' + ngNames.join('・').slice(0, 80) + '）', detail: { dateISO, saved: okGids.length, failed: ngNames.length, flowId: ctx.flowId } };
  return nextZenkokuDay(
    { ...ctx, cookie, zenkokuDiffs: diffs, zenkokuSaved: (ctx.zenkokuSaved ?? 0) + okGids.length },
    [audit],
    dateISO + ' 照合（一致 ' + okGids.length + '・不一致 ' + ngNames.length + '）',
  );
}

/** 最初の日の GET（DB 側が計画を入れたあとに使う） */
export function zenkokuFirstDayRequest(ctx: RelayFlowContext): { purpose: 'zenkoku_day_read'; method: 'GET'; url: string; headers: Record<string, string>; body: string } | null {
  const d = (ctx.zenkokuWindow ?? [])[0];
  if (!d) return null;
  const r = buildZenkokuDayReadRequest(ctx.cookie, d);
  return { purpose: 'zenkoku_day_read', method: 'GET', url: r.url, headers: r.headers, body: '' };
}

export { ZENKOKU_LOGIN_URL };
