// ───────── ★★★ エステ魂へ写真を送る流れ（第243便・2026-09-10）─────────
//
// ★★★★★ 2段構え（設計メモ §25-1・実測）。★ ①だけでは写真は付かない。
//
//   login
//     → esutama_photo_form（その人の編集ページを読む。★ 枠の状態と ctk を取る）
//     → esutama_photo_tmp （★ 空き枠へ multipart。★ 応答から /temp/… を拾う）
//     → esutama_photo_form（★ もう一度読む。★ 新しい ctk と 65部品を取り直す）
//     → esutama_photo_save（★ 読んだ65部品 ＋ cast_icon_<枠>-imgupload を足して保存）
//     → esutama_photo_form（★ 読み直して「その枠が saved になったか」を照合）
//
// ★★★ なぜ仮置きのあとに**もう一度読む**のか
//   仮置きの hidden は **JavaScript が画面に差し込んでいるだけ**で、サーバは覚えていない。
//   ★ 実測（2026-09-10 11:30）: 仮置きのあと F5 すると写真は消えた。
//   → だから読み直しても hidden は付いてこない。★ **こちらが持ち回して足す。**
//   ★ 読み直す理由は **新しい ctk と、触っていない65部品**を取るため。
//
// ★★★ 判定は【読み直しての照合】（第46便 §35）。★ 書き込みの応答では判定しない。
//   ★ 2026-09-09 の駅ちかで、応答を見て「届いた」と思い込み、実際は入っていなかった。
//
// ★★★★ 空き枠にだけ送る（駅ちかの写真・第107便と同じ決め）。
//   ★ 店舗様がご自分で入れた写真を、こちらの都合で上書きしない。
//
// ★ このファイルは通信も DB も触らない。★ 画像そのものも運ばない（第106便・案B）。

import type { RelayFlowContext, FlowOutcome, FlowAudit, FlowNextRequest } from './relayFlow';
import { mergeCookies } from './relayJob';
import { parseEsutamaCastForm } from './esutamaParse';
import { relayFileUrl } from './relayMultipart';
import {
  parseEsutamaPhotoSlots,
  firstEmptyEsutamaPhotoSlot,
  buildEsutamaPhotoUploadRequest,
  readEsutamaTmpPhoto,
  describeEsutamaPhotoResponse,
  buildEsutamaCastEditFormRequest,
  buildEsutamaCastPhotoSaveRequest,
  esutamaCastEditUrl,
  ESUTAMA_PHOTO_FIT,
} from './esutamaPhoto';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

/** ★ ログイン画面へ戻されたか。★ 判定はゆるく、止めるためだけに使う */
function backToLogin(input: Input): boolean {
  const loc = String(input.headers['location'] ?? '');
  if (loc.includes('/login')) return true;
  const b = String(input.body ?? '');
  return /name\s*=\s*["']?(?:login_id|shop_id)/i.test(b) && /name\s*=\s*["']?password/i.test(b);
}

/**
 * ★★ URL からパスとクエリだけ取る（★ 監査の見張りは値が `http(s)://` で始まると落とす・第236便）。
 *   ★ ここは relayFlow から借りない（★ 借りると読み込みが循環する）。
 */
function pathOf(url: string): string | null {
  const u = String(url ?? '').trim();
  if (!u) return null;
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]+(\/[^\s]*)?$/.exec(u);
  return ((m ? (m[1] ?? '/') : u)).slice(0, 110);
}

/** ★ 相対の行き先を絶対へ（★ 分からない形はそのまま返す） */
function absOf(base: string, loc: string): string {
  const l = String(loc ?? '').trim();
  if (!l) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(l)) return l;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]+)/.exec(base);
  if (!m) return l;
  return l.startsWith('/') ? m[1] + l : m[1] + '/' + l;
}

/** ★ 行き先がエステ魂か */
function isEsutamaHost(url: string): boolean {
  const h = /^https?:\/\/([^/?#]+)/.exec(String(url ?? ''))?.[1]?.toLowerCase() ?? null;
  return h === 'estama.jp' || h === 'www.estama.jp';
}

/**
 * ★★★★ 飛ばされたときに追ってよい回数。
 *   ★ 実測（2026-09-10 12:26）: **非表示のセラピストの編集ページは 307 で飛ばされる**
 *     （★ ブラウザでは `?disabled=true` が付いた URL になっていた）。
 *   ★★ 飛び先を決め打ちせず**追う**。★ ただし **同じ人の編集ページのときだけ**・2回まで。
 */
const MAX_PHOTO_REDIRECTS = 2;

/**
 * ★★★★★ 「この URL は **その人の編集ページ** だと言い切れるか」。
 *   ★ 言い切れないものは **null**（★ 呼ぶ側は決め打ちの URL に戻す）。
 *   ★ ホストがエステ魂で、パスに `/admin/cast_edit/<その castId>` が入っていること。
 *   ★★ ここを緩めると、飛ばされた先へ **別人の設定を保存しに行く** ── 絶対に緩めない。
 */
/**
 * ★★★★★ 非表示の方の編集ページを開くための印（2026-09-10 12:45 実測）。
 *   ★ これが無いと `/admin/cast_edit/` の入口へ突き返される（＝ 番号が落ちた 307）。
 *   ★ ブラウザが実際に開けていたのは `.../cast_edit/<castId>/?disabled=true`。
 */
const DISABLED_MARK = '?disabled=true';

/** ★ その住所は既に「非表示の見え方」か */
function hasDisabledMark(url: string): boolean {
  return /[?&]disabled=true(?:&|$)/.test(String(url ?? ''));
}

/**
 * ★★★★ 「cast_edit の入口へ突き返された」か（★ 番号が落ちている飛び先）。
 *   ★ これが出たら、その人が **非表示**だという合図。★ 別の場所へ飛ばされたのとは分けて扱う。
 */
function bouncedToEntrance(url: string): boolean {
  if (!isEsutamaHost(url)) return false;
  const p = (pathOf(url) ?? '').split('?')[0];
  return p === '/admin/cast_edit/' || p === '/admin/cast_edit';
}

function safeCastEditUrl(url: string | null | undefined, castId: string): string | null {
  const u = String(url ?? '').trim();
  if (!u || !castId) return null;
  if (!isEsutamaHost(u)) return null;
  return new RegExp('/admin/cast_edit/' + castId + '(?![0-9])').test(u) ? u : null;
}

/**
 * ★★ 編集ページを **どう開いたか**（第243便d・記録のためだけ）。
 *   'normal'   … ふつうの住所でそのまま開けた
 *   'disabled' … ★ 入口へ突き返されたので `?disabled=true` で開き直した（＝ 非表示の方）
 *   'followed' … ★ 同じ方の別の住所へ飛ばされたので追いかけた
 * ★ これが記録に無いと、次に同じことが起きたとき「なぜ通ったのか」が分からなくなる。
 */
function openedAs(ctx: RelayFlowContext): 'normal' | 'disabled' | 'followed' {
  return ctx.castPhotoOpenedAs ?? 'normal';
}

/** ★ 送る相手（エステ魂の cast_id）。★ 空なら何もしない */
function castIdOf(ctx: RelayFlowContext): string {
  return String(ctx.castPhotoCastId ?? '').trim();
}

/**
 * ★★★ 編集ページを読む段を積む。
 * @param stage 次に何をするために読むのか。★ undefined＝枠を選ぶため（1回目）
 */
export function buildEsutamaPhotoReadStep(
  cookie: string,
  ctx: RelayFlowContext,
  stage?: 'save' | 'verify',
): FlowNextRequest {
  const id = castIdOf(ctx);
  const req = buildEsutamaCastEditFormRequest(cookie, id);
  // ★★ 一度飛ばされた先を覚えていれば、そこを直接読む（★ 毎回1往復むだにしない）。
  //   ★ ただし **その人の編集ページだと言い切れるときだけ**。★ 違えば決め打ちに戻す
  const landed = safeCastEditUrl(ctx.castPhotoPageUrl, id);
  return {
    purpose: 'esutama_photo_form',
    method: 'GET',
    url: landed ?? req.url,
    headers: req.headers,
    body: '',
    // ★★ 追いかけた回数は **読むたびに 0 に戻す**（第243便b）。
    //   ★ この流れでは編集ページを3回読む。★ 数えっぱなしだと3回目が追えなくなる。
    context: { ...ctx, cookie, castPhotoHops: 0, ...(stage ? { castPhotoStage: stage } : {}) },
  };
}

/**
 * ★★★ 編集ページを読み終えたとき。★ 段によって3つに分かれる。
 *   （1回目）    … 枠を選んで、仮置きへ送る形を組み立てる
 *   'save'      … 65部品と新しい ctk を取り直し、写真の組を足して保存する
 *   'verify'    … その枠が **saved** になったかを照合して終わる
 */
export function afterEsutamaPhotoForm(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const castId = castIdOf(ctx);
  const stage = ctx.castPhotoStage;

  if (backToLogin(input)) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂のセッションが切れました', detail: { castId, httpStatus: input.status, reason: 'back_to_login', stage: stage ?? 'pick', flowId } }],
      '編集ページがログイン画面へ戻された（段: ' + (stage ?? 'pick') + '）',
    );
  }
  if (!castId) {
    return stop(
      [{ event: 'push_photo', outcome: 'stopped', summary: '写真を送る相手が指定されていないため、何もしませんでした', detail: { reason: 'no_cast_id', flowId } }],
      '送る相手（castId）が文脈に入っていない',
    );
  }

  // ★ この HTML を取ってきた URL。★ 飛ばされた先を覚えていればそれ（★ 言い切れるときだけ）
  const pageUrl = safeCastEditUrl(ctx.castPhotoPageUrl, castId) ?? esutamaCastEditUrl(castId);

  // ★★★★★ 飛ばされたら【追う】（第243便の追い足し・2026-09-10 12:26 実測）。
  //   ★ 非表示のセラピストの編集ページは **307** で飛ばされる
  //     （★ ブラウザでは `?disabled=true` が付いた URL になっていた）。
  //   ★★ 飛び先を決め打ちしない。★ ただし追うのは **同じ人の編集ページのときだけ**。
  //     ★ ホストがエステ魂で、パスにその castId が入っていること。★ 2回まで。
  //   ★★★ それ以外へ飛ばされたら **追わずに止める**（★ どこへでも付いていかない）。
  const cookieNow = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  if (input.status >= 300 && input.status < 400) {
    const abs = absOf(pageUrl, String(input.headers['location'] ?? ''));
    const hops = Number(ctx.castPhotoHops ?? 0);
    const sameCast = abs !== '' && isEsutamaHost(abs)
      && new RegExp('/admin/cast_edit/' + castId + '(?![0-9])').test(abs);
    // ★★★★★ 入口へ突き返されたとき ＝ **非表示の方**（2026-09-10 12:45 実測）。
    //   ★ 送った先 `/admin/cast_edit/955513/` → 飛び先 `/admin/cast_edit/`（★ 番号が落ちている）。
    //   ★ ブラウザが開けていたのは `/admin/cast_edit/955513/?disabled=true`。
    //   → エステ魂は **非表示の人を「ふつうの住所」では開かせない**。
    //
    //   ★★★ ここで組み立てる住所は **こちらが持っている castId から作る**。
    //     ★ 飛び先の文字は使わない（★ 別人へ連れて行かれないため）。★ 足すのは印だけ。
    if (bouncedToEntrance(abs) && !hasDisabledMark(pageUrl) && hops < MAX_PHOTO_REDIRECTS) {
      const url = esutamaCastEditUrl(castId) + DISABLED_MARK;
      const req = buildEsutamaCastEditFormRequest(cookieNow, castId);
      return {
        kind: 'next',
        audits: [],
        note: '編集ページの入口へ突き返された。★ 非表示の方とみて、同じ方の「非表示の見え方」で開き直します',
        next: {
          purpose: 'esutama_photo_form',
          method: 'GET', url, headers: req.headers, body: '',
          // ★★ どう開いたかを覚える。★ 記録に残すため（★ 「開き直した」が見えないと後で分からない）
          context: {
            ...ctx, cookie: cookieNow, castPhotoHops: hops + 1,
            castPhotoPageUrl: url, castPhotoOpenedAs: 'disabled',
          },
        },
      };
    }
    if (sameCast && hops < MAX_PHOTO_REDIRECTS) {
      const req = buildEsutamaCastEditFormRequest(cookieNow, castId);
      return {
        kind: 'next',
        audits: [],
        note: '編集ページが飛ばされた（' + (pathOf(abs) ?? '?') + '）。★ 同じ方の編集ページなので追います',
        next: {
          purpose: 'esutama_photo_form',
          method: 'GET', url: abs, headers: req.headers, body: '',
          // ★★ 飛び先を覚える。★ 保存もここへ送る（★ ブラウザと同じ場所へ返す）
          context: {
            ...ctx, cookie: cookieNow, castPhotoHops: hops + 1,
            castPhotoPageUrl: abs,
            // ★ 既に「非表示の見え方」で開いていたなら、その事実を消さない
            castPhotoOpenedAs: hasDisabledMark(abs) ? 'disabled' : (ctx.castPhotoOpenedAs ?? 'followed'),
          },
        },
      };
    }
    return stop(
      [{
        event: 'read_photo_page', outcome: 'failed',
        summary: 'エステ魂の編集ページが別の場所へ飛ばされました',
        detail: {
          castId, httpStatus: input.status,
          // ★ 「非表示の見え方」でも突き返されたのか、それとも別の場所へ飛ばされたのかを分けて残す
          reason: bouncedToEntrance(abs) ? 'bounced_even_disabled' : 'redirected',
          toPath: pathOf(abs) ?? null, hops, stage: stage ?? 'pick', flowId,
        },
      }],
      '編集ページが ' + input.status + ' で飛ばされた（' + (pathOf(abs) ?? '行き先なし') + '）',
    );
  }
  if (input.status !== 200) {
    return stop(
      [{ event: 'read_photo_page', outcome: 'failed', summary: 'エステ魂の編集ページを開けませんでした', detail: { castId, httpStatus: input.status, reason: 'http_error', stage: stage ?? 'pick', flowId } }],
      '編集ページの応答が ' + input.status + ' だった',
    );
  }

  const photo = parseEsutamaPhotoSlots(input.body, pageUrl);
  if (photo.warnings.length > 0) {
    return stop(
      [{ event: 'read_photo_page', outcome: 'failed', summary: 'エステ魂の写真の枠を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { castId, reason: 'parse_failed', note: photo.warnings[0].slice(0, 100), stage: stage ?? 'pick', flowId } }],
      '写真の枠を読めなかった: ' + photo.warnings.join(' / '),
    );
  }

  const cookie = cookieNow;

  // ────────── ③ 照合（★ ここで初めて成否が決まる） ──────────
  if (stage === 'verify') {
    const slot = Number(ctx.castPhotoSlot ?? 0);
    const hit = photo.slots.find((s) => s.slot === slot) ?? null;
    if (!hit) {
      return stop(
        [{ event: 'push_photo', outcome: 'failed', summary: '写真を送った枠が読み直しで見つかりませんでした', detail: { castId, slot, reason: 'slot_missing', flowId } }],
        '照合で枠 ' + slot + ' が見つからない',
      );
    }
    if (hit.state !== 'saved') {
      return stop(
        [{
          event: 'push_photo', outcome: 'failed',
          summary: 'エステ魂に写真を送りましたが、枠' + slot + 'に入っていませんでした',
          // ★★ 保存の応答の番号と行き先も残す（★ 次に外したとき、もう一発使わずに分かるように）
          detail: {
            castId, slot, reason: 'not_saved', state: hit.state, note: ctx.castPhotoNote ?? null,
            saveStatus: ctx.castPhotoSaveStatus ?? null, saveTo: ctx.castPhotoSaveTo ?? null,
            openedAs: openedAs(ctx), flowId,
          },
        }],
        '照合で枠 ' + slot + ' が saved になっていない（' + hit.state + '）',
      );
    }
    return {
      kind: 'done',
      audits: [{
        event: 'push_photo', outcome: 'ok',
        summary: 'エステ魂の枠' + slot + 'に写真を登録しました',
        detail: { castId, slot, openedAs: openedAs(ctx), flowId },
      }],
      note: '写真を確認した（castId ' + castId + '・枠 ' + slot + '）',
    };
  }

  // ── 65部品と ctk（★ どちらの段でも要る）──
  const form = parseEsutamaCastForm(input.body, pageUrl);
  if (form.fields.length === 0 || form.warnings.length > 0) {
    return stop(
      [{ event: 'read_photo_page', outcome: 'failed', summary: 'エステ魂の編集フォームを読み取れませんでした（画面の作りが変わった可能性があります）', detail: { castId, reason: 'form_parse_failed', note: form.warnings[0] ?? null, stage: stage ?? 'pick', flowId } }],
      '編集フォームを読めなかった: ' + (form.warnings[0] ?? '欄が1つも無い'),
    );
  }

  // ────────── ② 保存（★ 仮置きの組を足して本紐づけする） ──────────
  if (stage === 'save') {
    const tmp = ctx.castPhotoTmp;
    if (!tmp) {
      return stop(
        [{ event: 'push_photo', outcome: 'failed', summary: '仮置きの情報が失われたため、保存しませんでした', detail: { castId, reason: 'no_tmp', flowId } }],
        '文脈に仮置きの組が無い',
      );
    }
    let req;
    try {
      req = buildEsutamaCastPhotoSaveRequest(cookie, form, castId, [tmp]);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return stop(
        [{ event: 'push_photo', outcome: 'stopped', summary: '写真の保存を止めました（' + why + '）', detail: { castId, slot: tmp.slot, reason: 'blocked', note: why, flowId } }],
        '組み立てが止めた: ' + why,
      );
    }
    // ★★★ 保存は【読んだページと同じ場所】へ返す（第243便b）。
    //   ★ 非表示の方の編集ページは `?disabled=true` へ飛ばされる（307）。
    //     ★ 決め打ちの URL へ POST すると、また飛ばされて **保存されない**。
    //   ★★ 飛び先だと言い切れないものは使わない（safeCastEditUrl が null を返す）。
    const saveUrl = safeCastEditUrl(ctx.castPhotoPageUrl, castId) ?? req.url;
    return {
      kind: 'next',
      audits: [],
      note: '枠' + tmp.slot + 'の写真を保存します（★ 読んだ' + form.fields.length + '部品はそのまま返す）'
        + (saveUrl === req.url ? '' : '。★ 読んだページと同じ場所へ返します'),
      next: {
        purpose: 'esutama_photo_save',
        method: req.method, url: saveUrl, headers: req.headers, body: req.body,
        context: { ...ctx, cookie },
      },
    };
  }

  // ────────── ① 枠を選んで仮置きへ送る ──────────
  const file = ctx.castPhotoFile;
  if (!file) {
    return stop(
      [{ event: 'push_photo', outcome: 'stopped', summary: '送る写真が指定されていないため、何もしませんでした', detail: { castId, reason: 'no_file', flowId } }],
      '送る写真が文脈に入っていない',
    );
  }

  // ★★★★ 枠は【画面から決める】。★ 数字を決め打ちしない
  const wanted = Number(ctx.castPhotoSlotWanted ?? 0);
  const slot = Number.isInteger(wanted) && wanted > 0 ? wanted : firstEmptyEsutamaPhotoSlot(photo);
  if (!slot) {
    return {
      kind: 'done',
      audits: [{
        event: 'push_photo', outcome: 'stopped',
        summary: 'エステ魂の写真の枠がすべて埋まっているため、送りませんでした',
        detail: { castId, reason: 'no_empty_slot', slots: photo.slots.length, flowId },
      }],
      note: '空き枠が無い（' + photo.slots.map((s) => s.slot + ':' + s.state).join(' ') + '）',
    };
  }

  // ★ ファイル名はこちらで決める（★ 呼び出し側の文字をそのまま相手に見せない）
  const filename = 'cast_' + castId + '_' + String(slot) + '.jpg';
  // ★★★★ 寸法は取りに来た口で合わせてもらう（第241便）。★ 相手のブラウザと同じ形（§25-7）
  let fileUrl = '';
  try {
    fileUrl = relayFileUrl(file.bucket, file.path, {
      fit: 'cover', w: ESUTAMA_PHOTO_FIT.width, h: ESUTAMA_PHOTO_FIT.height, pos: 'lefttop',
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return stop(
      [{ event: 'push_photo', outcome: 'stopped', summary: '写真の取り出し先を組めませんでした（' + why + '）', detail: { castId, slot, reason: 'bad_file', note: why, flowId } }],
      '取り出し先を組めなかった: ' + why,
    );
  }

  let req;
  try {
    req = buildEsutamaPhotoUploadRequest(cookie, photo, {
      slot,
      ctk: String(form.ctk ?? ''),
      fileUrl,
      filename,
      contentType: 'image/jpeg',
      ...(ctx.castPhotoReplace === true ? { replace: true } : {}),
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return stop(
      [{ event: 'push_photo', outcome: 'stopped', summary: '写真の送信を止めました（' + why + '）', detail: { castId, slot, reason: 'blocked', note: why, flowId } }],
      '組み立てが止めた: ' + why,
    );
  }

  return {
    kind: 'next',
    // ★★ どう開いたかを必ず残す（第243便d）。★ 「開き直した」が記録から消えると、次に分からなくなる
    audits: [{
      event: 'read_photo_page', outcome: 'ok',
      detail: { castId, slot, openedAs: openedAs(ctx), hops: Number(ctx.castPhotoHops ?? 0), flowId },
    }],
    note: '枠' + slot + '（' + (photo.slots.find((s) => s.slot === slot)?.state ?? '?') + '）へ写真を送ります。★ まだ本紐づけはしていません',
    next: {
      purpose: 'esutama_photo_tmp',
      method: req.method, url: req.url, headers: req.headers, body: '',
      multipart: req.multipart,
      context: { ...ctx, cookie, castPhotoSlot: slot },
    },
  };
}

/**
 * ★★★ 仮置きの応答。★ ここで `/temp/…` の1組を拾う。
 *   ★★ 拾えなければ **先へ進まない**（★ 拾えないまま保存しても、写真は付かない）。
 */
export function afterEsutamaPhotoTmp(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const castId = castIdOf(ctx);
  const slot = Number(ctx.castPhotoSlot ?? 0);

  if (backToLogin(input)) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂のセッションが切れました（写真は付いていません）', detail: { castId, slot, httpStatus: input.status, reason: 'back_to_login', flowId } }],
      '仮置きの応答がログイン画面へ戻された',
    );
  }
  const diag = describeEsutamaPhotoResponse(input.status, input.body);
  if (input.status >= 400) {
    return stop(
      [{ event: 'push_photo', outcome: 'failed', summary: 'エステ魂へ写真を送れませんでした', detail: { castId, slot, httpStatus: input.status, reason: 'http_error', response: diag, flowId } }],
      '仮置きの応答が ' + input.status + ' だった',
    );
  }

  const tmp = readEsutamaTmpPhoto(input.body);
  if (!tmp) {
    // ★★★ 相手が受け取っていない。★ ここで止める（★ 進んでも写真は付かない）
    return stop(
      [{ event: 'push_photo', outcome: 'failed', summary: 'エステ魂が写真を受け取りませんでした', detail: { castId, slot, reason: 'no_tmp', response: diag, flowId } }],
      '仮置きの応答から /temp/… を拾えなかった（' + diag + '）',
    );
  }
  if (tmp.slot !== slot) {
    // ★★★★ 送ったつもりの枠と違う。★ 別の枠を保存しに行かない
    return stop(
      [{ event: 'push_photo', outcome: 'failed', summary: 'エステ魂が別の枠に受け取ったため、保存しませんでした', detail: { castId, slot, gotSlot: tmp.slot, reason: 'slot_mismatch', response: diag, flowId } }],
      '送った枠 ' + slot + ' と応答の枠 ' + tmp.slot + ' が違う',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  return {
    kind: 'next',
    audits: [],
    note: '仮置きに上がった（枠' + slot + '）。★ 保存しないと付かないので、編集フォームを読み直します',
    next: buildEsutamaPhotoReadStep(cookie, { ...ctx, castPhotoTmp: tmp, castPhotoNote: diag }, 'save'),
  };
}

/**
 * ★★ 保存の応答。★ ここでは成否を判定しない（第46便 §35）。
 *   ★ もう一度読み直して、その枠が **saved** になったかを照合する。
 */
export function afterEsutamaPhotoSave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const castId = castIdOf(ctx);
  const slot = Number(ctx.castPhotoSlot ?? 0);

  if (backToLogin(input)) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: 'エステ魂のセッションが切れました（写真が付いたか分かりません）', detail: { castId, slot, httpStatus: input.status, reason: 'back_to_login', flowId } }],
      '保存の応答がログイン画面へ戻された',
    );
  }
  if (input.status >= 400) {
    return stop(
      [{ event: 'push_photo', outcome: 'failed', summary: 'エステ魂の保存で想定外の応答がありました', detail: { castId, slot, httpStatus: input.status, reason: 'http_error', flowId } }],
      '保存の応答が ' + input.status + ' だった',
    );
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  // ★★ 保存の応答の番号と行き先を控える。★ **判定には使わない**（判定は読み直しての照合）。
  //   ★ 照合で外れたときの手がかりとして記録に残すためだけ（第236便の作法）
  const to = pathOf(absOf(esutamaCastEditUrl(castId), String(input.headers['location'] ?? '')));
  return {
    kind: 'next',
    audits: [],
    note: '保存を送った（応答 ' + input.status + '）。★ 成否は読み直して確かめる（応答では判定しない）',
    next: buildEsutamaPhotoReadStep(
      cookie,
      { ...ctx, castPhotoSaveStatus: input.status, ...(to ? { castPhotoSaveTo: to } : {}) },
      'verify',
    ),
  };
}
