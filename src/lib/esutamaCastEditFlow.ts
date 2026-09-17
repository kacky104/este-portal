// ───────── ★★★ エステ魂のプロフィール更新の流れ（第430便・2026-09-17）─────────
//
//   login → esutama_edit_form（編集ページを読む）→ [apply のときだけ] esutama_edit_save（POST）
//        → esutama_edit_form（読み直して照合）→ まとめて更新なら次の人
//   ★ apply が無ければ【読んで「何が変わるか」を記録するだけ】（★ 1文字も送らない）
//   ★ 非表示の方の編集ページは入口へ突き返される → `?disabled=true` で開き直す（写真の流れ・第243便と同じ）
//   ★ 決めごとは src/lib/esutamaCastEdit.ts
//
// ★ このファイルは通信も DB も触らない。

import type { RelayFlowContext, FlowOutcome, FlowAudit, FlowNextRequest } from './relayFlow';
import { mergeCookies } from './relayJob';
import { buildEsutamaCastEditFormRequest, esutamaCastEditUrl } from './esutamaPhoto';
import {
  backToLogin, pathOf, absOf, isEsutamaHost, MAX_PHOTO_REDIRECTS, DISABLED_MARK, hasDisabledMark, bouncedToEntrance, safeCastEditUrl,
} from './esutamaPhotoFlow';
import { parseEsutamaCastEditForm, planEsutamaCastEdit, buildEsutamaCastEditBody, verifyEsutamaCastEdit } from './esutamaCastEdit';
import { RELAY_USER_AGENT } from './relayUserAgent';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

const stop = (audits: FlowAudit[], note: string): FlowOutcome => ({ kind: 'stop', audits, note });
const castIdOf = (ctx: RelayFlowContext) => String(ctx.castEditCastId ?? '').trim();
const whoOf = (ctx: RelayFlowContext) => String(ctx.castEditName ?? '').trim() || 'castId ' + castIdOf(ctx);

/** 編集ページを読む段を積む（★ 飛ばされた先を覚えていればそこ・言い切れるときだけ） */
export function buildEsutamaCastEditReadStep(cookie: string, ctx: RelayFlowContext): FlowNextRequest {
  const id = castIdOf(ctx);
  const req = buildEsutamaCastEditFormRequest(cookie, id);
  const landed = safeCastEditUrl(ctx.castEditPageUrl, id);
  return { purpose: 'esutama_edit_form', method: 'GET', url: landed ?? req.url, headers: req.headers, body: '', context: { ...ctx, cookie, castEditHops: 0 } };
}

/** ★ 1人ぶん終わったら（done/stop）、まとめて更新の次の人へ。★ ログイン切れは全体を止める */
function finish(ctx: RelayFlowContext, cookie: string, out: FlowOutcome): FlowOutcome {
  const queue = ctx.castEditQueue ?? [];
  if ((out.kind !== 'done' && out.kind !== 'stop') || queue.length === 0) return out;
  if (out.audits.some((a) => a.event === 'login' && a.outcome === 'failed')) return out;
  const [head, ...rest] = queue;
  if (!/^\d{1,12}$/.test(String(head.castId))) return { ...out, note: out.note + '。★ 次の人の番号が不正なため、まとめて更新をここで終えます' };
  const nctx: RelayFlowContext = {
    ...ctx, cookie,
    castEditCastId: String(head.castId), castEditName: head.name, castEditValues: head.values, castEditTherapistId: head.therapistId,
    castEditQueue: rest, castEditStage: undefined, castEditPlan: undefined, castEditPageUrl: undefined, castEditHops: 0, castEditOpenedAs: undefined,
  };
  return { kind: 'next', audits: out.audits, note: out.note + '。★ 続けて ' + head.name + 'さん（残り' + rest.length + '名）', next: buildEsutamaCastEditReadStep(cookie, nctx) };
}

export function afterEsutamaEditForm(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const castId = castIdOf(ctx);
  const who = whoOf(ctx);
  const stage = ctx.castEditStage;
  if (backToLogin(input)) {
    return stop([{ event: 'login', outcome: 'failed', summary: 'エステ魂のセッションが切れました', detail: { castId, httpStatus: input.status, reason: 'back_to_login', stage: stage ?? 'plan', flowId } }], '編集ページがログイン画面へ戻された');
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
  if (!/^\d{1,12}$/.test(castId)) {
    return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'stopped', summary: '更新する方のエステ魂の番号が無いため、何もしませんでした', detail: { reason: 'no_cast_id', flowId } }], '相手の番号が無い'));
  }
  const pageUrl = safeCastEditUrl(ctx.castEditPageUrl, castId) ?? esutamaCastEditUrl(castId);

  // ── 飛ばされたら追う（★ 同じ方の編集ページのときだけ・2回まで）──
  if (input.status >= 300 && input.status < 400) {
    const abs = absOf(pageUrl, String(input.headers['location'] ?? ''));
    const hops = Number(ctx.castEditHops ?? 0);
    const req = buildEsutamaCastEditFormRequest(cookie, castId);
    if (bouncedToEntrance(abs) && !hasDisabledMark(pageUrl) && hops < MAX_PHOTO_REDIRECTS) {
      const url = esutamaCastEditUrl(castId) + DISABLED_MARK;
      return { kind: 'next', audits: [], note: '編集ページの入口へ突き返された。★ 非表示の方とみて開き直します', next: { purpose: 'esutama_edit_form', method: 'GET', url, headers: req.headers, body: '', context: { ...ctx, cookie, castEditHops: hops + 1, castEditPageUrl: url, castEditOpenedAs: 'disabled' } } };
    }
    const sameCast = abs !== '' && isEsutamaHost(abs) && new RegExp('/admin/cast_edit/' + castId + '(?![0-9])').test(abs);
    if (sameCast && hops < MAX_PHOTO_REDIRECTS) {
      return { kind: 'next', audits: [], note: '編集ページが飛ばされた（' + (pathOf(abs) ?? '?') + '）。★ 同じ方なので追います', next: { purpose: 'esutama_edit_form', method: 'GET', url: abs, headers: req.headers, body: '', context: { ...ctx, cookie, castEditHops: hops + 1, castEditPageUrl: abs, castEditOpenedAs: hasDisabledMark(abs) ? 'disabled' : (ctx.castEditOpenedAs ?? 'followed') } } };
    }
    return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'failed', summary: who + 'さんのエステ魂の編集ページが別の場所へ飛ばされました', detail: { castId, httpStatus: input.status, reason: 'redirected', toPath: pathOf(abs) ?? null, hops, flowId } }], '編集ページが ' + input.status + ' で飛ばされた'));
  }
  if (input.status !== 200) {
    return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'failed', summary: who + 'さんのエステ魂の編集ページを開けませんでした', detail: { castId, httpStatus: input.status, reason: 'http_error', flowId } }], '編集ページの応答が ' + input.status));
  }
  const form = parseEsutamaCastEditForm(input.body, pageUrl);
  if (form.fields.length === 0 || form.warnings.length > 0) {
    return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'failed', summary: who + 'さんのエステ魂の編集ページを読み取れませんでした（画面の作りが変わった可能性があります）', detail: { castId, reason: 'parse_failed', note: (form.warnings[0] ?? '欄が無い').slice(0, 100), flowId } }], '編集フォームを読めなかった'));
  }
  if (String(form.castIdHidden ?? '') !== castId) {
    return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'stopped', summary: who + 'さんのエステ魂の編集ページが別の方のものだったため、止めました', detail: { castId, got: form.castIdHidden, reason: 'cast_mismatch', flowId } }], '読んだ cast_id が違う'));
  }

  // ── 照合 ──
  if (stage === 'verify') {
    const plan = ctx.castEditPlan;
    if (!plan) return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'failed', summary: '照合に要る情報が失われました', detail: { castId, reason: 'no_plan', flowId } }], '文脈に計画が無い'));
    const r = verifyEsutamaCastEdit(form, plan);
    if (r.ng.length > 0) {
      return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'failed', summary: who + 'さんのエステ魂のプロフィールで、反映されていない欄がありました（' + r.ng.join('・').slice(0, 80) + '）', detail: { castId, ok: r.ok, ng: r.ng.join('・').slice(0, 110), hint: (r.hints[0] ?? '').slice(0, 110), saveStatus: ctx.castEditSaveStatus ?? null, openedAs: ctx.castEditOpenedAs ?? 'normal', flowId } }], '照合で外れた: ' + r.ng.join('・')));
    }
    return finish(ctx, cookie, { kind: 'done', audits: [{ event: 'edit_girl', outcome: 'ok', summary: who + 'さんのエステ魂のプロフィールを更新しました（' + plan.changes.map((c) => c.label).join('・').slice(0, 80) + '）', detail: { castId, changes: plan.changes.length, labels: plan.changes.map((c) => c.label).join('・').slice(0, 110), openedAs: ctx.castEditOpenedAs ?? 'normal', flowId } }], note: '照合 ok（' + r.ok + '欄）' });
  }

  // ── 1回目：何が変わるか ──
  const values = ctx.castEditValues;
  if (!values) return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'stopped', summary: '送る内容が無いため、何もしませんでした', detail: { castId, reason: 'no_values', flowId } }], '送る内容が無い'));
  const plan = planEsutamaCastEdit(form, values);
  const skippedNote = plan.skipped.length > 0 ? '。送らない欄: ' + plan.skipped.join('・') : '';
  if (plan.changes.length === 0) {
    return finish(ctx, cookie, { kind: 'done', audits: [{ event: 'edit_girl', outcome: 'ok', summary: who + 'さんのエステ魂のプロフィールは、変わるところがありませんでした（そのままです）' + skippedNote.slice(0, 100), detail: { castId, changes: 0, skipped: plan.skipped.length, skippedLabels: plan.skipped.join('・').slice(0, 110), flowId } }], note: '変わる欄が無い' + skippedNote });
  }
  if (ctx.castEditApply !== true) {
    return finish(ctx, cookie, { kind: 'done', audits: [{ event: 'edit_girl', outcome: 'stopped', summary: '【試し打ち】' + who + 'さん（エステ魂）：' + plan.changes.length + '欄が変わります（' + plan.changes.map((c) => c.label).join('・').slice(0, 80) + '）', detail: { castId, changes: plan.changes.length, skipped: plan.skipped.length, dryRun: true, labels: plan.changes.map((c) => c.label).join('・').slice(0, 110), skippedLabels: plan.skipped.join('・').slice(0, 110), flowId } }], note: '試し打ち（送っていない）' + skippedNote });
  }
  let body: string;
  try {
    body = buildEsutamaCastEditBody(form, castId, plan);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'stopped', summary: who + 'さんのエステ魂のプロフィール更新を止めました（' + why.slice(0, 60) + '）', detail: { castId, reason: 'blocked', note: why.slice(0, 100), flowId } }], '組み立てが止めた: ' + why));
  }
  const saveUrl = safeCastEditUrl(ctx.castEditPageUrl, castId) ?? esutamaCastEditUrl(castId);
  return {
    kind: 'next',
    audits: [],
    note: who + 'さんのエステ魂のプロフィールを送ります（' + plan.changes.map((c) => c.label).join('・') + '）' + skippedNote,
    next: {
      purpose: 'esutama_edit_save', method: 'POST', url: saveUrl,
      headers: {
        'user-agent': RELAY_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://estama.jp',
        referer: saveUrl,
        cookie,
      },
      body,
      context: { ...ctx, cookie, castEditStage: 'verify', castEditPlan: { pairs: plan.pairs, changes: plan.changes, skipped: plan.skipped } },
    },
  };
}

export function afterEsutamaEditSave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const castId = castIdOf(ctx);
  if (backToLogin(input)) {
    return stop([{ event: 'login', outcome: 'failed', summary: 'エステ魂のセッションが切れました（更新できたか分かりません）', detail: { castId, httpStatus: input.status, reason: 'back_to_login', flowId } }], '保存の応答がログイン画面へ戻された');
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
  if (input.status >= 400) {
    return finish(ctx, cookie, stop([{ event: 'edit_girl', outcome: 'failed', summary: whoOf(ctx) + 'さんのエステ魂のプロフィール更新で想定外の応答がありました', detail: { castId, httpStatus: input.status, reason: 'http_error', flowId } }], '保存の応答が ' + input.status));
  }
  return { kind: 'next', audits: [], note: '保存を送った（応答 ' + input.status + '）。★ 成否は読み直して確かめる', next: buildEsutamaCastEditReadStep(cookie, { ...ctx, castEditSaveStatus: input.status }) };
}
