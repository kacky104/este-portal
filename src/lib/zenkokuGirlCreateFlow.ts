// 全国エステランキングへセラピストを1人 登録する段（第1865便・2026-11-10）。★ 要求は lib/zenkokuGirlCreate.ts
//
//   login →（intent='girl_create' と ctx.zenkokuCreate）
//     zenkoku_create_list   GET  一覧 … 同じ名前の方がもう居れば登録しない（mediaFound＝結ぶのは呼び出し側）
//     zenkoku_create_form   GET  新規追加の画面 … hidden（user_id 等）とカップの選択肢
//     zenkoku_create_save   POST 新規追加 … ★ 相手に人が1人増える（送り直さない）
//     zenkoku_create_find   GET  一覧 … 前に居なかった・同じ名前の方の番号を見つける（mediaCreated＝結ぶのは呼び出し側）
//     zenkoku_create_detail GET  編集ページ … 空いている写真の枠
//     zenkoku_create_photo  POST 写真1枚（multipart）… ★ 送り直さない。枠の数ぶん繰り返す
//     zenkoku_create_detail GET  編集ページ … 写真が入ったかを確かめて終わり
//   ★ 記録は event='create_girl'。

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { buildZenkokuGirlsRequest } from './zenkokuRequests';
import { parseZenkokuGirlList } from './zenkokuParse';
import { relayFileUrl } from './relayMultipart';
import {
  readZenkokuNewForm, buildZenkokuNewFormGet, buildZenkokuCreateSave, buildZenkokuDetailGet,
  zenkokuFreePhotoSlots, buildZenkokuPhotoUpload, normZenkokuName, ZENKOKU_PHOTO_MAX,
} from './zenkokuGirlCreate';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };
const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
const loggedOut = (input: Input) => (input.status >= 300 && input.status < 400 && /\/login\/?(\?|$)/.test(locationOf(input)))
  || (input.status === 200 && /<form[^>]+action=["'][^"']*\/login\/?["']/i.test(input.body) && !/data-girl-id=|name=["']nickname["']/.test(input.body));

function stop(ctx: RelayFlowContext, summary: string, reason: string, note: string, extra: Record<string, string | number | null> = {}): FlowOutcome {
  return { kind: 'stop', audits: [{ event: 'create_girl', outcome: 'failed', summary, detail: { reason, therapistId: ctx.zenkokuCreate?.therapistId ?? null, flowId: ctx.flowId, ...extra } }], note };
}
function loginStop(ctx: RelayFlowContext, input: Input, stage: string): FlowOutcome {
  return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした。ログイン名・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage, flowId: ctx.flowId } }], note: stage + ' でログイン画面に戻された' };
}
const nameOf = (ctx: RelayFlowContext) => String(ctx.zenkokuCreate?.values.nickname ?? '');

export function zenkokuGirlCreateFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  const r = buildZenkokuGirlsRequest(cookie);
  return { kind: 'next', next: { purpose: 'zenkoku_create_list', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: '全国エステランキングにログインした → 登録の前に一覧を読む（同じ名前の方がもう居ないか）' };
}

export function afterZenkokuCreateList(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'create_list');
  const c = ctx.zenkokuCreate;
  if (!c) return stop(ctx, '登録する方の情報がありませんでした', 'no_values', '文脈に登録の中身が無い');
  const rows = parseZenkokuGirlList(input.body).rows;
  if (input.status >= 400 || rows.length === 0) return stop(ctx, '全国エステランキングのセラピスト一覧を読み取れませんでした（登録はしていません）', 'list_unreadable', '一覧を読めなかった', { httpStatus: input.status });
  const same = rows.filter((r) => normZenkokuName(r.name) === normZenkokuName(c.values.nickname));
  if (same.length === 1) {
    return {
      kind: 'done', audits: [], note: '同じ名前の方がもう居た（登録しない・結ぶだけ）',
      mediaFound: { therapistId: c.therapistId, castId: same[0].gid, name: c.values.nickname, mediaName: same[0].name },
    };
  }
  if (same.length > 1) return stop(ctx, nameOf(ctx) + 'さんと同じ名前の方が全国エステランキングに' + same.length + '人いるため、登録しませんでした', 'duplicate_name', '同じ名前が複数');
  const r = buildZenkokuNewFormGet(cookie);
  return { kind: 'next', next: { purpose: 'zenkoku_create_form', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie, zenkokuCreate: { ...c, before: rows.map((x) => x.gid) } } }, audits: [], note: '一覧に同じ名前は居なかった（' + rows.length + '名）→ 新規追加の画面を読む' };
}

export function afterZenkokuCreateForm(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'create_form');
  const c = ctx.zenkokuCreate!;
  const form = input.status < 400 ? readZenkokuNewForm(input.body) : null;
  if (!form) return stop(ctx, '全国エステランキングの新規追加の画面を読み取れませんでした（登録はしていません）', 'form_unreadable', '新規追加のフォームが無い', { httpStatus: input.status });
  let r;
  try { r = buildZenkokuCreateSave(cookie, form, c.values); } catch (e) { return stop(ctx, nameOf(ctx) + 'さんを登録できませんでした（' + (e as Error).message + '）', 'bad_values', '組めなかった'); }
  return { kind: 'next', next: { purpose: 'zenkoku_create_save', method: r.method, url: r.url, headers: r.headers, body: r.body, context: { ...ctx, cookie } }, audits: [], note: nameOf(ctx) + 'さんを全国エステランキングに登録する' };
}

export function afterZenkokuCreateSave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'create_save');
  if (input.status >= 400) return stop(ctx, nameOf(ctx) + 'さんを全国エステランキングに登録できませんでした（応答 ' + input.status + '）', 'http_error', '保存の応答が ' + input.status, { httpStatus: input.status });
  const r = buildZenkokuGirlsRequest(cookie);
  return { kind: 'next', next: { purpose: 'zenkoku_create_find', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: '登録を送った（' + input.status + '）→ 一覧で番号を探す' };
}

function photoStep(ctx: RelayFlowContext, cookie: string, note: string, audits: FlowAudit[] = []): FlowOutcome {
  const c = ctx.zenkokuCreate!;
  const at = c.photoAt ?? 0;
  const slots = c.slots ?? [];
  const photo = c.photos[at];
  const slot = slots[at];
  if (!photo || slot === undefined) {
    const r = buildZenkokuDetailGet(cookie, c.gid!);
    return { kind: 'next', next: { purpose: 'zenkoku_create_detail', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie, zenkokuCreate: { ...c, verify: true } } }, audits, note: note + ' → 編集ページで写真を確かめる' };
  }
  let req;
  try { req = buildZenkokuPhotoUpload(cookie, c.gid!, slot, relayFileUrl(photo.bucket, photo.path, 'jpeg')); }
  catch (e) { return { kind: 'done', audits: [...audits, { event: 'create_girl', outcome: 'ok', summary: nameOf(ctx) + 'さんを全国エステランキングに登録しました（写真は送れませんでした: ' + (e as Error).message.slice(0, 40) + '）', detail: { castId: c.gid ?? null, therapistId: c.therapistId, flowId: ctx.flowId } }], note: '写真を組めなかった' }; }
  return { kind: 'next', next: { purpose: 'zenkoku_create_photo', method: req.method, url: req.url, headers: req.headers, body: '', multipart: req.multipart, context: { ...ctx, cookie, zenkokuCreate: { ...c, photoAt: at + 1 } } }, audits, note: note + ' → 写真' + (at + 1) + '枚目を枠' + slot + 'へ' };
}

export function afterZenkokuCreateFind(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'create_find');
  const c = ctx.zenkokuCreate!;
  const rows = parseZenkokuGirlList(input.body).rows;
  const before = new Set(c.before ?? []);
  const hit = rows.filter((r) => !before.has(r.gid) && normZenkokuName(r.name) === normZenkokuName(c.values.nickname));
  if (hit.length !== 1) {
    return stop(ctx, nameOf(ctx) + 'さんの登録を送りましたが、全国エステランキングの一覧で見つけられませんでした（全国の画面をご確認ください）', 'not_found_after', '登録後に一覧で見つからない', { found: hit.length });
  }
  const gid = hit[0].gid;
  const created = { therapistId: c.therapistId, castId: gid, name: c.values.nickname };
  if (c.photos.length === 0) {
    return { kind: 'done', mediaCreated: created, audits: [{ event: 'create_girl', outcome: 'ok', summary: nameOf(ctx) + 'さんを全国エステランキングに登録しました（写真は無し）', detail: { castId: gid, therapistId: c.therapistId, flowId: ctx.flowId } }], note: '登録できた（番号 ' + gid + '）' };
  }
  const r = buildZenkokuDetailGet(cookie, gid);
  return { kind: 'next', mediaCreated: created, next: { purpose: 'zenkoku_create_detail', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie, zenkokuCreate: { ...c, gid } } }, audits: [], note: '登録できた（番号 ' + gid + '）→ 編集ページで写真の枠を読む' };
}

export function afterZenkokuCreateDetail(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'create_detail');
  const c = ctx.zenkokuCreate!;
  const free = input.status < 400 ? zenkokuFreePhotoSlots(input.body) : [];
  if (c.verify) {
    const sent = (c.slots ?? []).slice(0, c.photoAt ?? 0);
    const ok = sent.filter((s) => !free.includes(s)).length;
    return { kind: 'done', audits: [{ event: 'create_girl', outcome: 'ok', summary: nameOf(ctx) + 'さんを全国エステランキングに登録しました（写真 ' + ok + '／' + sent.length + '枚）', detail: { castId: c.gid ?? null, therapistId: c.therapistId, photos: ok, flowId: ctx.flowId } }], note: '写真を確かめた（' + ok + '／' + sent.length + '）' };
  }
  if (free.length === 0) {
    return { kind: 'done', audits: [{ event: 'create_girl', outcome: 'ok', summary: nameOf(ctx) + 'さんを全国エステランキングに登録しました（写真の枠が見つからず、写真は送っていません）', detail: { castId: c.gid ?? null, therapistId: c.therapistId, flowId: ctx.flowId } }], note: '写真の枠が無い' };
  }
  const slots = free.slice(0, Math.min(ZENKOKU_PHOTO_MAX, c.photos.length));
  return photoStep({ ...ctx, zenkokuCreate: { ...c, slots, photoAt: 0 } }, cookie, '写真の枠 ' + free.join('・') + ' が空いていた');
}

export function afterZenkokuCreatePhoto(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'create_photo');
  const audits: FlowAudit[] = input.status >= 400
    ? [{ event: 'create_girl', outcome: 'failed', summary: nameOf(ctx) + 'さんの写真' + (ctx.zenkokuCreate?.photoAt ?? 0) + '枚目を全国エステランキングへ送れませんでした（応答 ' + input.status + '）', detail: { castId: ctx.zenkokuCreate?.gid ?? null, httpStatus: input.status, reason: 'photo_http_error', flowId: ctx.flowId } }]
    : [];
  return photoStep(ctx, cookie, '写真を送った（' + input.status + '）', audits);
}
