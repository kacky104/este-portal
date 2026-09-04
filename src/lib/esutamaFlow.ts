// エステ魂の段（状態遷移・第109便・純粋関数）。relayFlow.ts の advanceFlow から呼ばれる。
//
// ★★★ 段の名前を 'esutama_…' で分けている。駅ちか・エステラブの段には一切触れない。
//
//   esutama_login_page  GET /login/            → Cookie と csrf を拾う → 【DB側】が認証情報を足してログイン POST を積む
//   esutama_login       POST /post/login_shop/ → JSON を読む → 名簿 GET を積む
//   esutama_roster      GET /admin/schedule/list/ → 名簿を読む → 【DB側】がフクエスの出勤と突き合わせて計画を文脈に入れ、1人目の出勤表 GET を積む
//   esutama_work_read   GET /admin/schedule/<id>/ → 表を読む → 計画を当てる →
//                         試し打ち: 記録して次の人へ ／ 送信: 変わる人だけ保存 POST を積む
//   esutama_work_save   POST /admin/schedule/post_work_schedule/ → JSON を読む → 照合の GET を積む
//   esutama_work_verify GET /admin/schedule/<id>/ → 送った内容と一致するか → 次の人へ
//
// ★★★ パスワードは文脈に入れない。ログイン POST を組むのは DB 側（startRelayFlow と同じ場所で復号する）。
// ★★★ ここは純粋関数。DBもネットワークも触らない＝自己点検で固定できる（scripts/esutamaflow-selftest.js）。

import type { FlowAudit, FlowOutcome, RelayFlowContext, EsutamaDiffRow, EsutamaPlanSummary } from './relayFlow';
import { mergeCookies } from './relayJob';
import { readEsutamaCsrf, parseEsutamaJson, parseEsutamaRoster } from './esutamaParse';
// ★ 写メ日記の道（第133便）。★ ログインの直後に分かれる
import { buildEsutamaTherapistAdminRequest } from './esutamaRequests';
import {
  parseEsutamaWorkPage, checkEsutamaWorkPage, buildEsutamaPayload, esutamaDayLabel, addDays,
  type EsutamaWorkPage,
} from './esutamaWorkParse';
import { applyEsutamaPerson, type EsutamaPerson } from './esutamaPlan';
// ★★ 店舗様の画面に出す・出さないの物差し（第149便）。★ キー名をここで書き写さない
import { AUDIT_SHOP_HIDDEN } from './mediaAudit';
// ★★★ 営業日（朝6時始まり）の正本。★ ここで暦日を書かない（第150便）
import { businessDateJSTFrom } from './dutyStatus';
import {
  buildEsutamaRosterRequest, buildEsutamaWorkReadRequest, buildEsutamaWorkSaveRequest,
} from './esutamaRequests';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

/**
 * ★★★ 無人の自動反映（work_auto）をエステ魂で許すか。
 *   ★ 第109便では false（人が押す work_push で実弾を確かめた）。第110便で true。
 *   ★ false にすると work_auto は【試し打ちと同じ】（読んで記録するだけ。1文字も書き換えない）。★ 止めたいときの旗として残す。
 *   ★ 無人のときの守りは afterEsutamaWorkRead（その人の ○ が 0 になる書き換えは自動では送らない）。
 */
export const ESUTAMA_AUTO_WRITE_ENABLED = true;   // ★ 2026-09-02 第110便で true（実弾: 延ばす・戻す の両方が照合まで通った）

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

/** 1人ぶんの「変更の鍵」（dayIndex=送ったあと を並べ替えて連結）。★ 承認した内容と読み直した内容の突き合わせに使う */
export function esutamaPersonKey(changes: ReadonlyArray<{ dayIndex: number; after: string }>): string {
  return changes.map((c) => c.dayIndex + '=' + c.after).sort().join('|');
}

/** 計画全体の指紋（駅ちかの planFingerprint と同じ考え: 誰の・どの日を・どう変えるか だけ） */
export function esutamaFingerprint(diffs: ReadonlyArray<EsutamaDiffRow>): string {
  return diffs.map((d) => d.castId + ':' + d.dayIndex + ':' + d.after).sort().join('|');
}

/** media_work_plans.diff（[{girlId,name,dayIndex,before,after}]）から castId → 鍵 を作る */
export function esutamaApprovedFromDiff(diff: ReadonlyArray<{ girlId?: string; castId?: string; dayIndex: number; after: string }>): Record<string, string> {
  const by = new Map<string, Array<{ dayIndex: number; after: string }>>();
  for (const d of diff) {
    const id = String(d.castId ?? d.girlId ?? '');
    if (!id) continue;
    if (!by.has(id)) by.set(id, []);
    by.get(id)!.push({ dayIndex: Number(d.dayIndex), after: String(d.after) });
  }
  const out: Record<string, string> = {};
  for (const [id, cs] of by) out[id] = esutamaPersonKey(cs);
  return out;
}

function isPushing(ctx: RelayFlowContext): boolean {
  if (ctx.intent === 'work_push') return true;
  if (ctx.intent === 'work_auto') return ESUTAMA_AUTO_WRITE_ENABLED;
  return false;
}

/** ログイン切れの見分け（3xx で /login/ へ、または JSON の REDIRECT） */
function redirectedToLogin(input: Input): boolean {
  if (input.status >= 300 && input.status < 400) {
    const loc = String(input.headers['location'] ?? '');
    return loc.includes('/login');
  }
  return false;
}

// ────────────────────────── ① ログイン画面 ──────────────────────────

export function afterEsutamaLoginPage(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  if (input.status >= 400) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂のログイン画面を開けませんでした', detail: { httpStatus: input.status, reason: 'http_error', stage: 'login_page', flowId } }],
      'エステ魂のログイン画面が ' + input.status + ' だった',
    );
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const csrf = readEsutamaCsrf(input.body);
  if (csrf === null) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂のログイン画面の形が変わったため、ログインできませんでした', detail: { httpStatus: input.status, reason: 'csrf_missing', stage: 'login_page', flowId } }],
      'ログイン画面に csrf_footer が無い（画面の作りが変わった可能性）',
    );
  }
  // ★ ここでは何も記録しない（まだ成否が分からない）。★ ログイン POST は DB 側が組む（認証情報が要る）
  return {
    kind: 'esutama_login_needed',
    csrf,
    context: { ...ctx, cookie, esutamaCsrf: csrf },
    audits: [],
    note: 'エステ魂のログイン画面を読めた（csrf あり）',
  };
}

// ────────────────────────── ② ログイン応答 ──────────────────────────

export function afterEsutamaLogin(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  if (input.status >= 400) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした（応答 ' + input.status + '）', detail: { httpStatus: input.status, reason: 'http_error', flowId } }],
      'エステ魂のログインの応答が ' + input.status + ' だった',
    );
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const j = parseEsutamaJson(input.body);
  if (j.kind === 'out') {
    return stop(
      [{
        event: 'login', outcome: 'failed',
        summary: 'エステ魂にログインできませんでした。メールアドレス・パスワードをご確認ください',
        // ★ 文言そのものは入れない（何が違うかを外に出さない）。件数だけ
        detail: { httpStatus: input.status, reason: 'rejected', messages: j.messages.length, flowId },
      }],
      'エステ魂のログインが OUT（入力の不備）: ' + j.messages.length + '件',
    );
  }
  // ★★ 成功の札は REDIRECT_OK だけと決めつけない（2026-09-02 21:05 の実弾で止まった）。
  //   post.js の .send-post は OUT / REDIRECT_OK 以外を「成功→data[1] へ移動」と扱う（ログイン画面の step_3「管理画面に移動します」がそれ）。
  //   → 'ok'（['OK', …]）も成功として先へ進む。★ 本当にログインできたかは次の名簿の段で確かめる（駅ちかと同じ作法）。
  if (j.kind !== 'redirect_ok' && j.kind !== 'ok') {
    return stop(
      [{
        event: 'login', outcome: 'failed',
        summary: 'エステ魂のログインの応答を読み取れませんでした（画面の作りが変わった可能性があります）',
        // ★ 先頭100文字を残す（第107便の作法: 番号だけでは原因が絞れない）。★ 応答は JSON か HTML で、秘密は入らない
        detail: { httpStatus: input.status, reason: 'unexpected_response', kind: j.kind, bodyHead: (input.body ?? '').slice(0, 100), flowId },
      }],
      'エステ魂のログイン応答が REDIRECT_OK / OK ではない（' + j.kind + '）',
    );
  }
  if (!cookie) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした（セッションが返りませんでした）', detail: { httpStatus: input.status, reason: 'no_cookie', flowId } }],
      'エステ魂のログインで Cookie が無い',
    );
  }
  // ★★★ ここで道が分かれる（第133便）。
  //   ★ 写メ日記の用事は【出勤名簿を読まない】。★ 用の無いページを相手に読みに行かない。
  //   ★★ 「ログインできた」の確証は、日記の道では【魂セラピスト一覧が読めたこと】で取る。
  if (ctx.intent === 'diary_dryrun' || ctx.intent === 'diary_push' || ctx.intent === 'diary_auto'
      || ctx.intent === 'sokusera_push' || ctx.intent === 'sokusera_auto') {
    const t = buildEsutamaTherapistAdminRequest(cookie);
    return {
      kind: 'next',
      audits: [],
      note: 'エステ魂にログインできた。魂セラピストの一覧を読みます',
      next: { purpose: 'esutama_therapist_list', method: t.method, url: t.url, headers: t.headers, body: '', context: { ...ctx, cookie, esutamaCsrf: undefined } },
    };
  }

  const next = buildEsutamaRosterRequest(cookie);
  return {
    kind: 'next',
    audits: [],   // ★ 名簿が読めた段で「ログインできた」を記録する（確証がそこで出る）
    note: 'エステ魂にログインできた（REDIRECT_OK）',
    next: { purpose: 'esutama_roster', method: next.method, url: next.url, headers: next.headers, body: '', context: { ...ctx, cookie, esutamaCsrf: undefined } },
  };
}

// ────────────────────────── ③ 名簿 ──────────────────────────

export function afterEsutamaRoster(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  if (redirectedToLogin(input)) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした（ログイン画面へ戻されました）', detail: { httpStatus: input.status, reason: 'back_to_login', flowId } }],
      '名簿がログイン画面へ戻された＝ログインできていない',
    );
  }
  if (input.status >= 300) {
    return stop(
      [{ event: 'read_girls', outcome: 'failed', summary: 'エステ魂のセラピスト一覧を開けませんでした', detail: { httpStatus: input.status, reason: 'http_error', flowId } }],
      '名簿の応答が ' + input.status + ' だった',
    );
  }
  const parsed = parseEsutamaRoster(input.body);
  if (parsed.rows.length === 0) {
    return stop(
      [{ event: 'read_girls', outcome: 'failed', summary: 'エステ魂のセラピスト一覧を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { httpStatus: input.status, reason: 'parse_empty', flowId } }],
      '名簿を1人も読み取れなかった: ' + (parsed.warnings[0] ?? '理由不明'),
    );
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  return {
    kind: 'esutama_roster',
    rows: parsed.rows,
    warnings: parsed.warnings,
    context: { ...ctx, cookie },
    audits: [
      { event: 'login', outcome: 'ok', summary: 'エステ魂にログインしました', detail: { flowId } },
      { event: 'read_girls', outcome: 'ok', summary: 'エステ魂のセラピストを ' + parsed.rows.length + '人 読み取りました', detail: { count: parsed.rows.length, warnings: parsed.warnings.length, flowId } },
    ],
    note: 'エステ魂の名簿 ' + parsed.rows.length + '人',
  };
}

// ────────────────────────── ④ 出勤表（読む→当てる） ──────────────────────────

function currentPerson(ctx: RelayFlowContext): EsutamaPerson | null {
  const people = ctx.esutamaPeople ?? [];
  const i = ctx.esutamaIndex ?? 0;
  return people[i] ?? null;
}

/** 次の人の出勤表 GET を積む。居なければ done */
export function nextEsutamaPerson(ctx: RelayFlowContext, audits: FlowAudit[], note: string): FlowOutcome {
  const people = ctx.esutamaPeople ?? [];
  const i = (ctx.esutamaIndex ?? 0) + 1;
  if (i >= people.length) {
    const changed = ctx.esutamaChanged ?? 0;
    const saved = ctx.esutamaSaved ?? 0;
    const pushing = isPushing(ctx);
    const diffs = ctx.esutamaDiffs ?? [];
    const blocked = ctx.esutamaBlocked ?? [];
    const plan: EsutamaPlanSummary = {
      window: ctx.esutamaWindow ?? [],
      diffs,
      blocked,
      notes: ctx.esutamaNotes ?? [],
      people: people.length,
      changed,
      saved,
      // ★ 送る相手が1人でも居て、送らずに残った変更があるとき「送れる」
      sendable: people.length > 0 && diffs.length > 0,
      fingerprint: esutamaFingerprint(diffs),
    };
    return {
      kind: 'done',
      esutamaPlan: plan,
      audits: [
        ...audits,
        pushing
          ? { event: 'write_work', outcome: saved > 0 ? 'ok' : 'stopped', summary: saved > 0 ? 'エステ魂の出勤を ' + saved + '人ぶん 反映しました（' + people.length + '人を確認）' : 'エステ魂の出勤に変更はありませんでした（' + people.length + '人を確認）', detail: { people: people.length, saved, changed, flowId: ctx.flowId } }
          : { event: 'plan_work', outcome: 'stopped', summary: 'エステ魂へ送る内容を確かめました（' + people.length + '人を確認、' + changed + '人に変更があります）。まだ送っていません', detail: { people: people.length, changed, flowId: ctx.flowId } },
      ],
      note: note + ' → 全員ぶん終わり（' + people.length + '人 / 変更' + changed + ' / 保存' + saved + '）',
    };
  }
  const p = people[i];
  const next = buildEsutamaWorkReadRequest(ctx.cookie, p.castId);
  return {
    kind: 'next',
    audits,
    note: note + ' → 次の人（' + (i + 1) + '/' + people.length + '）',
    next: { purpose: 'esutama_work_read', method: next.method, url: next.url, headers: next.headers, body: '', context: { ...ctx, esutamaIndex: i, esutamaExpect: undefined } },
  };
}

function readWorkPageOrStop(input: Input, ctx: RelayFlowContext, stage: string, todayISO: string): { page: EsutamaWorkPage } | { stop: FlowOutcome } {
  const flowId = ctx.flowId;
  if (redirectedToLogin(input)) {
    return { stop: stop([{ event: 'read_work', outcome: 'failed', summary: 'エステ魂のログインが切れました', detail: { httpStatus: input.status, reason: 'back_to_login', stage, flowId } }], '出勤表がログイン画面へ戻された') };
  }
  if (input.status >= 300) {
    return { stop: stop([{ event: 'read_work', outcome: 'failed', summary: 'エステ魂の出勤表を開けませんでした', detail: { httpStatus: input.status, reason: 'http_error', stage, flowId } }], '出勤表の応答が ' + input.status + ' だった') };
  }
  const page = parseEsutamaWorkPage(input.body);
  const problems = checkEsutamaWorkPage(page);
  if (problems.length > 0) {
    return { stop: stop([{ event: 'read_work', outcome: 'failed', summary: 'エステ魂の出勤表を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { httpStatus: input.status, reason: 'parse_failed', problems: problems.length, stage, flowId } }], '出勤表が送れる形でない: ' + problems.join(' / ')) };
  }
  const person = currentPerson(ctx);
  if (person && page.castId !== person.castId) {
    return { stop: stop([{ event: 'read_work', outcome: 'failed', summary: 'エステ魂の出勤表が別の人のものでした', detail: { reason: 'cast_mismatch', stage, flowId } }], '読んだ cast_id ' + page.castId + ' が計画の ' + person.castId + ' と違う') };
  }
  if ((page.days[0]?.date ?? '') !== todayISO) {
    // ★★★ 第112便（2026-09-03）: 【何日とずれたか】を監査に残す。
    //   ★ これまでは reason だけで、相手の1日目が何日だったかが**どこにも残らなかった**。
    //     ★ note には書いていたが、note は VPS への応答に混ざって消える
    //       （relay.sh は ok:false のときしかログに書かない）。
    //   ★★ 「止めた」ことは分かるのに「何とずれたか」が分からないと、
    //     深夜の切り替わり時刻のような **相手の性質** を、何度流しても絞れない。
    //   ★ どちらもただの日付。★ 秘密でも宛先でもないので detail に入れてよい。
    return { stop: stop([{ event: 'read_work', outcome: 'failed', summary: 'エステ魂の出勤表の1日目がこちらの今日と違うため止めました', detail: { reason: 'date_shifted', mediaFirstDate: page.days[0]?.date ?? '', fukuesToday: todayISO, stage, flowId } }], '1日目 ' + (page.days[0]?.date ?? '') + ' ≠ 今日 ' + todayISO) };
  }
  return { page };
}

/**
 * エステ魂の表の1日目にあたる日（'YYYY-MM-DD'）。★ 文脈の startedAt から決める（純粋にするため）。
 *
 * ★★★ 第150便（2026-09-05）: ここは【暦日】だった。★ それが間違いだった。
 *   ★ 実測（salon_media_audit の date_shifted・第112便が残した mediaFirstDate より）:
 *
 *     09/04 00:01 / 01:01 / 02:01 / 03:01 / 04:01 / 05:01 と 09/05 00:20 の【7回とも】
 *     相手の1日目 = こちらの今日 − 1日。★ 06:01 の周は1度も落ちていない。
 *
 *   ★★ つまり **エステ魂の1日は午前6時に始まる**。★ フクエスと同じ（DAY_START_HOUR）。
 *   ★★★ しかもフクエスの `therapist_schedules.schedule_date` は元から営業日。
 *     ★ 暦日で窓を取ると、深夜0〜6時は【いま出勤中の日】を窓から落としていた。
 *     ★ 守り（1日目の照合）が止めてくれていたので、ずれた書き込みは起きていない。
 *
 *   ★ 決め方はここに書かない。正本は src/lib/dutyStatus.ts の businessDateJSTFrom。
 */
export function esutamaTodayISO(ctx: RelayFlowContext, now?: number): string {
  const t = Number.isFinite(now) ? (now as number) : Date.parse(ctx.startedAt);
  return businessDateJSTFrom(t);
}

export function afterEsutamaWorkRead(input: Input, ctx: RelayFlowContext, now?: number): FlowOutcome {
  const flowId = ctx.flowId;
  const person = currentPerson(ctx);
  if (!person) return stop([], '計画に人が居ないのに出勤表を読んだ');
  const r = readWorkPageOrStop(input, ctx, 'read', esutamaTodayISO(ctx, now));
  if ('stop' in r) return r.stop;
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const applied = applyEsutamaPerson(r.page, person);
  const d = applied.diff;
  const readAudit: FlowAudit = {
    event: 'read_work', outcome: 'ok',
    summary: 'エステ魂の出勤表を読みました（' + ((ctx.esutamaIndex ?? 0) + 1) + '人目）',
    // ★★★ 人ごとの読み取りは【こちらの作業ログ】。記録には残すが、店舗様の画面には出さない（第149便）。
    //   ★ 23人居れば23行並ぶ。★ 押したご本人が「何か動き続けている」と不安になった。
    //   ★ 何人を確認したかは、最後のまとめの1行に入っている。
    detail: { ...AUDIT_SHOP_HIDDEN, days: r.page.days.length, changes: d.changes.length, skipped: d.skipped.length, workingBefore: d.workingBefore, workingAfter: d.workingAfter, flowId },
  };
  // ★ 変わる日を1行ずつ（人の名前は出さない。castId と日付だけ）
  const lines = d.changes.map((c) => c.dateISO + ' ' + c.before + '→' + c.after);
  const skips = d.skipped.map((s) => s.dateISO + '（' + s.reason + '）');
  const changedCount = (ctx.esutamaChanged ?? 0) + (d.changed ? 1 : 0);
  // ★ 店舗の画面に出す「変わるところ」（第110便）。dayIndex は窓の添え字
  const window = ctx.esutamaWindow ?? [];
  const rows: EsutamaDiffRow[] = d.changes.map((c) => ({
    castId: d.castId, name: d.name, dayIndex: window.indexOf(c.dateISO), before: c.before, after: c.after,
  }));
  const base: RelayFlowContext = { ...ctx, cookie, esutamaChanged: changedCount, esutamaDiffs: [...(ctx.esutamaDiffs ?? []), ...rows] };

  if (!isPushing(ctx)) {
    const planAudit: FlowAudit = {
      event: 'plan_work', outcome: 'stopped',
      summary: (d.changed ? '変更 ' + d.changes.length + '日: ' + lines.join(' / ') : '変更なし') + (skips.length ? ' ／ 触らない: ' + skips.join(' ') : ''),
      // ★★ 同じ理由で隠す（第149便）。★ 変更の中身は「出勤を送る」の画面に表で出ている
      detail: { ...AUDIT_SHOP_HIDDEN, castId: d.castId, changes: d.changes.length, skipped: d.skipped.length, flowId },
    };
    return nextEsutamaPerson(base, [readAudit, planAudit], '試し打ち: ' + (d.changed ? '変更' + d.changes.length + '日' : '変更なし'));
  }
  if (!d.changed) {
    return nextEsutamaPerson(base, [readAudit], '変更なし');
  }
  // ★★★ 店舗が画面で承認した内容と同じか（第110便・人ごと）。★ 違えばその人は送らない（駅ちかの指紋と同じ守り）
  if (ctx.esutamaApproved !== undefined) {
    const want = ctx.esutamaApproved[d.castId];
    const got = esutamaPersonKey(rows);
    if (want === undefined || want !== got) {
      // ★ 送らなかったぶんは diffs に残る（画面に「送らずに残った」として出る）
      return nextEsutamaPerson(base, [readAudit, {
        event: 'write_work', outcome: 'stopped',
        summary: '内容が新しくなっていたため、この方の出勤は送りませんでした。画面を開き直して「反映内容を確認」からやり直してください',
        detail: { castId: d.castId, reason: 'plan_changed', flowId },
      }], '承認した内容と違うので送らない');
    }
  }
  // ★★★ 無人（work_auto）の守り: その人の ○ が全部消える書き換えは自動では送らない（人が見て送る）
  if (ctx.intent === 'work_auto' && d.workingBefore > 0 && d.workingAfter === 0) {
    return nextEsutamaPerson(base, [readAudit, {
      event: 'write_work', outcome: 'stopped',
      summary: 'この方の出勤がすべて無くなる内容のため、自動では送りませんでした。「出勤を送る」の画面から確認して送ってください',
      detail: { castId: d.castId, reason: 'auto_would_clear', workingBefore: d.workingBefore, flowId },
    }], '無人で全消しはしない');
  }
  // ★★ 送る。読んだ表そのもの（当てたあと）を丸ごと送る
  let fields: Array<[string, string]>;
  try {
    fields = buildEsutamaPayload(applied.page);
  } catch (e) {
    return stop([readAudit, { event: 'write_work', outcome: 'failed', summary: 'エステ魂へ送る形を組み立てられませんでした', detail: { reason: 'payload_failed', flowId } }], String((e as Error).message));
  }
  const next = buildEsutamaWorkSaveRequest(cookie, person.castId, fields);
  return {
    kind: 'next',
    audits: [readAudit],
    note: '保存を積む（変更' + d.changes.length + '日: ' + lines.join(' / ') + '）',
    next: {
      purpose: 'esutama_work_save', method: next.method, url: next.url, headers: next.headers, body: next.body ?? '',
      context: { ...base, esutamaExpect: d.changes.map((c) => ({ dateISO: c.dateISO, after: c.after })) },
    },
  };
}

// ────────────────────────── ⑤ 保存の応答 ──────────────────────────

export function afterEsutamaWorkSave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const person = currentPerson(ctx);
  if (!person) return stop([], '計画に人が居ないのに保存した');
  const j = input.status >= 400 ? null : parseEsutamaJson(input.body);
  if (!j || j.kind !== 'ok') {
    const reason = !j ? 'http_error' : j.kind === 'redirect' ? 'back_to_login' : j.kind === 'error' ? 'rejected' : 'unexpected_response';
    return stop(
      [{
        event: 'write_work', outcome: 'failed',
        summary: reason === 'back_to_login' ? 'エステ魂のログインが切れたため、保存できませんでした' : reason === 'rejected' ? 'エステ魂が保存を受け付けませんでした' : 'エステ魂の保存の応答を読み取れませんでした',
        detail: { httpStatus: input.status, reason, castId: person.castId, bodyHead: (input.body ?? '').slice(0, 100), flowId },
      }],
      '保存の応答が OK でない（' + (j ? j.kind : input.status) + '）',
    );
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const next = buildEsutamaWorkReadRequest(cookie, person.castId);
  return {
    kind: 'next',
    audits: [],   // ★ 「反映した」は照合してから言う
    note: '保存 OK → 照合を積む',
    next: { purpose: 'esutama_work_verify', method: next.method, url: next.url, headers: next.headers, body: '', context: { ...ctx, cookie } },
  };
}

// ────────────────────────── ⑥ 照合 ──────────────────────────

export function afterEsutamaWorkVerify(input: Input, ctx: RelayFlowContext, now?: number): FlowOutcome {
  const flowId = ctx.flowId;
  const person = currentPerson(ctx);
  if (!person) return stop([], '計画に人が居ないのに照合した');
  const r = readWorkPageOrStop(input, ctx, 'verify', esutamaTodayISO(ctx, now));
  if ('stop' in r) return r.stop;
  const expect = ctx.esutamaExpect ?? [];
  const mismatches: string[] = [];
  for (const e of expect) {
    const day = r.page.days.find((d) => d.date === e.dateISO);
    const got = day ? esutamaDayLabel(day) : '（日が無い）';
    if (got !== e.after) mismatches.push(e.dateISO + ' 期待 ' + e.after + ' / 実際 ' + got);
  }
  if (mismatches.length > 0) {
    // ★★ 一致しなければ、その先の人へ進まない（同じ作りで送り続けない）
    return stop(
      [{ event: 'verify_work', outcome: 'failed', summary: 'エステ魂へ送った出勤が画面に反映されていません（' + mismatches.length + '日）。この先の送信を止めました', detail: { castId: person.castId, mismatches: mismatches.length, expected: expect.length, flowId } }],
      '照合が一致しない: ' + mismatches.join(' / '),
    );
  }
  const saved = (ctx.esutamaSaved ?? 0) + 1;
  const audit: FlowAudit = {
    event: 'verify_work', outcome: 'ok',
    summary: 'エステ魂に反映されました（' + expect.map((e) => e.dateISO.slice(5) + ' ' + e.after).join(' / ') + '）',
    detail: { castId: person.castId, days: expect.length, flowId },
  };
  // ★ 送れた人の行は「残り」から外す（第110便: 画面には送らずに残ったものだけを出す）
  const rest = (ctx.esutamaDiffs ?? []).filter((r) => r.castId !== person.castId);
  return nextEsutamaPerson({ ...ctx, esutamaSaved: saved, esutamaDiffs: rest }, [audit], '照合 OK');
}

/** 計画に入れる窓（今日〜13日後）。★ 表の日数と揃える。DB 側が出勤を読むときに使う */
export function esutamaWindowDates(todayISO: string, days = 14): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(addDays(todayISO, i));
  return out;
}
