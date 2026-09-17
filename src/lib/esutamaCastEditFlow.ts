// ───────── ★★★ エステ魂のプロフィール更新の流れ（第430便・2026-09-17）─────────
//
//   login → esutama_edit_form（編集ページを読む）→ [apply のときだけ] esutama_edit_save（POST）
//        → esutama_edit_form（読み直して照合）→ まとめて更新なら次の人
//   ★ apply が無ければ【読んで「何が変わるか」を記録するだけ】（★ 1文字も送らない）
//   ★ 非表示の方の編集ページは入口へ突き返される → `?disabled=true` で開き直す（写真の流れ・第243便と同じ）
//   ★ 決めごとは src/lib/esutamaCastEdit.ts
//
// ★ このファイルは通信も DB も触らない。

import type { RelayFlowContext, FlowOutcome, FlowAudit, FlowNextRequest, PhotoSynced } from './relayFlow';
import { mergeCookies } from './relayJob';
import { buildEsutamaCastEditFormRequest, esutamaCastEditUrl, parseEsutamaPhotoSlots } from './esutamaPhoto';
import {
  backToLogin, pathOf, absOf, isEsutamaHost, MAX_PHOTO_REDIRECTS, DISABLED_MARK, hasDisabledMark, bouncedToEntrance, safeCastEditUrl,
  buildEsutamaPhotoReadStep,
} from './esutamaPhotoFlow';
import { parseEsutamaCastEditForm, planEsutamaCastEdit, buildEsutamaCastEditBody, verifyEsutamaCastEdit, buildEsutamaPhotoDeleteBody } from './esutamaCastEdit';
import { planEsutamaPhotoSync, readEsutamaDeleteCols, ESUTAMA_SYNC_MAX } from './esutamaPhotoSync';
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

/**
 * ★ 1人ぶんのプロフィールが終わったら（done/stop）:
 *   ① 送る（apply）とき・写真の材料があるとき → 写真を合わせる段へ（★ 第434便）
 *   ② それ以外 → まとめて更新の次の人へ
 */
function finish(ctx: RelayFlowContext, cookie: string, out: FlowOutcome): FlowOutcome {
  if ((out.kind === 'done' || out.kind === 'stop') && ctx.castEditInPhoto !== true && ctx.castEditApply === true && ctx.castEditPhotos
    && !out.audits.some((a) => a.event === 'login' && a.outcome === 'failed')) {
    const nctx: RelayFlowContext = { ...ctx, cookie, castEditInPhoto: true, castEditStage: 'photo', castEditPlan: undefined };
    return { kind: 'next', audits: out.audits, note: out.note + '。★ 続けて写真を確かめます', next: buildEsutamaCastEditReadStep(cookie, nctx) };
  }
  return continueCastEditQueue(ctx, cookie, out);
}

/** ★ まとめて更新の次の人へ（★ ログイン切れは全体を止める）。★ 写真の段の終わりからも呼ばれる（relayFlow.advanceFlow） */
export function continueCastEditQueue(ctx: RelayFlowContext, cookie: string, out: FlowOutcome): FlowOutcome {
  const queue = ctx.castEditQueue ?? [];
  if ((out.kind !== 'done' && out.kind !== 'stop') || queue.length === 0) return out;
  if (out.audits.some((a) => a.event === 'login' && a.outcome === 'failed')) return out;
  const [head, ...rest] = queue;
  if (!/^\d{1,12}$/.test(String(head.castId))) return { ...out, note: out.note + '。★ 次の人の番号が不正なため、まとめて更新をここで終えます' };
  const nctx: RelayFlowContext = {
    ...ctx, cookie,
    castEditCastId: String(head.castId), castEditName: head.name, castEditValues: head.values, castEditTherapistId: head.therapistId,
    castEditPhotos: head.photos, castEditInPhoto: undefined, castEditPhotoPlan: undefined,
    castEditQueue: rest, castEditStage: undefined, castEditPlan: undefined, castEditPageUrl: undefined, castEditHops: 0, castEditOpenedAs: undefined,
    castPhotoCastId: undefined, castPhotoTherapistId: undefined, castPhotoFile: undefined, castPhotoQueue: undefined, castPhotoStage: undefined,
    castPhotoSlot: undefined, castPhotoTmp: undefined, castPhotoPageUrl: undefined, castPhotoHops: undefined, castPhotoOpenedAs: undefined,
  };
  const synced = 'photoSynced' in out && out.photoSynced && out.photoSynced.length > 0 ? { photoSynced: out.photoSynced } : {};
  return { kind: 'next', audits: out.audits, note: out.note + '。★ 続けて ' + head.name + 'さん（残り' + rest.length + '名）', next: buildEsutamaCastEditReadStep(cookie, nctx), ...synced };
}

/** ★★ 第434便: 写真を足す段へ（★ 第243便の5段を1枚ずつ。★ 照合が通るたびに記録を返す・esutamaPhotoFlow） */
function startEsutamaAdds(ctx: RelayFlowContext, cookie: string, addFrom: number, audits: FlowAudit[], synced: PhotoSynced[]): FlowOutcome {
  const files = (ctx.castEditPhotos?.want ?? []).slice(addFrom, ESUTAMA_SYNC_MAX);
  const withSynced = synced.length > 0 ? { photoSynced: synced } : {};
  if (files.length === 0) {
    return { kind: 'done', audits, note: '写真を合わせ終えた（足す写真なし）', ...withSynced };
  }
  const [head, ...rest] = files;
  const pctx: RelayFlowContext = {
    ...ctx, cookie,
    castPhotoCastId: castIdOf(ctx), castPhotoTherapistId: ctx.castEditTherapistId,
    castPhotoFile: head, castPhotoQueue: rest,
    castPhotoStage: undefined, castPhotoSlot: undefined, castPhotoTmp: undefined,
    castPhotoPageUrl: ctx.castEditPageUrl, castPhotoOpenedAs: ctx.castEditOpenedAs,
  };
  return { kind: 'next', audits, note: '写真を' + files.length + '枚足します', next: buildEsutamaPhotoReadStep(cookie, pctx), ...withSynced };
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

  // ── ★★ 第434便: 写真を合わせる ──
  if (stage === 'photo' || stage === 'photo_deleted') {
    const photos = ctx.castEditPhotos;
    const tid = Number(ctx.castEditTherapistId ?? 0);
    if (!photos || !(tid > 0)) return { kind: 'done', audits: [], note: '写真の材料が無い' };
    const page = parseEsutamaPhotoSlots(input.body, pageUrl);
    if (page.warnings.length > 0) {
      return stop([{ event: 'push_photo', outcome: 'failed', summary: who + 'さんのエステ魂の写真の枠を読み取れませんでした', detail: { castId, reason: 'parse_failed', note: page.warnings[0].slice(0, 100), flowId } }], '写真の枠を読めなかった');
    }
    const want = photos.want.map((f) => f.bucket + '/' + f.path);
    if (stage === 'photo_deleted') {
      const plan0 = ctx.castEditPhotoPlan;
      const filled = page.slots.filter((x) => x.state === 'saved').map((x) => x.slot).sort((a, b) => a - b);
      if (!plan0 || filled.length !== plan0.keep || filled.some((n, i) => n !== i + 1)) {
        return stop([{ event: 'push_photo', outcome: 'failed', summary: who + 'さんのエステ魂の写真を消したあと、枠が思った形になっていませんでした（残りの写真は送っていません）', detail: { castId, reason: 'delete_mismatch', keep: plan0?.keep ?? null, after: filled.join(',') || null, flowId } }], '消したあとの照合で外れた');
      }
      const removed: PhotoSynced[] = plan0.deleteSlots.map((n) => ({ therapistId: tid, imageSlot: n, sourceUrl: null }));
      const delAudit: FlowAudit = { event: 'push_photo', outcome: 'ok', summary: who + 'さんのエステ魂の画像' + plan0.deleteSlots.join('・') + 'を消しました（★ 読み直して確かめました）', detail: { castId, removed: plan0.deleteSlots.join(','), flowId } };
      return startEsutamaAdds({ ...ctx, castEditPhotoPlan: undefined }, cookie, plan0.addFrom, [delAudit], removed);
    }
    const sp = planEsutamaPhotoSync({ slots: page.slots, want, had: photos.had, allowRemove: photos.allowRemove });
    if (sp.kind === 'noop') return { kind: 'done', audits: [], note: '写真は変わるところなし' };
    if (sp.kind === 'kept') {
      return { kind: 'done', audits: [{ event: 'push_photo', outcome: 'ok', summary: who + 'さんのエステ魂の画像' + sp.slots.join('・') + 'はコネックエフから送っていない写真のため、写真は合わせませんでした（エステ魂の画面で消すと、次の更新で合わせます）', detail: { castId, reason: 'not_ours', slots: sp.slots.join(','), flowId } }], note: '記録の無い写真があるので触らない' };
    }
    if (sp.kind === 'blocked_remove') {
      return { kind: 'done', audits: [{ event: 'push_photo', outcome: 'ok', summary: who + 'さんのエステ魂の写真は消さずに残しました（画像' + sp.slots.join('・') + '）', detail: { castId, reason: 'remove_not_allowed', slots: sp.slots.join(','), flowId } }], note: '消す許可が無い' };
    }
    if (sp.kind === 'not_packed') {
      return stop([{ event: 'push_photo', outcome: 'stopped', summary: who + 'さんのエステ魂の写真が想定と違う並びだったため、写真は合わせませんでした', detail: { castId, reason: 'not_packed', note: sp.detail.slice(0, 100), flowId } }], sp.detail);
    }
    if (sp.deleteSlots.length > 0) {
      const colsMap = readEsutamaDeleteCols(input.body);
      const cols = sp.deleteSlots.map((n) => colsMap[n]);
      let body: string;
      try {
        if (cols.some((c) => !c)) throw new Error('消すボタンが画面に見つからない枠がある（' + sp.deleteSlots.filter((n) => !colsMap[n]).join(',') + '）');
        body = buildEsutamaPhotoDeleteBody(form, castId, cols as string[]);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        return stop([{ event: 'push_photo', outcome: 'stopped', summary: who + 'さんのエステ魂の写真を消す操作を止めました（' + why.slice(0, 60) + '）', detail: { castId, reason: 'blocked', note: why.slice(0, 100), flowId } }], '組み立てが止めた: ' + why);
      }
      const saveUrl = safeCastEditUrl(ctx.castEditPageUrl, castId) ?? esutamaCastEditUrl(castId);
      return {
        kind: 'next', audits: [],
        note: '画像' + sp.deleteSlots.join('・') + 'を消します（そのあと' + sp.addCount + '枚を足す）',
        next: {
          purpose: 'esutama_edit_save', method: 'POST', url: saveUrl,
          headers: { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', 'content-type': 'application/x-www-form-urlencoded', origin: 'https://estama.jp', referer: saveUrl, cookie },
          body,
          context: { ...ctx, cookie, castEditStage: 'photo_deleted', castEditPhotoPlan: { keep: sp.keep, deleteSlots: sp.deleteSlots, addFrom: sp.addFrom } },
        },
      };
    }
    return startEsutamaAdds(ctx, cookie, sp.addFrom, [], []);
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
