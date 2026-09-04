// エステ魂の写メ日記を送る段（第130便・2026-09-04）。★ 純粋関数（禁則180）。
// relayFlow.ts の advanceFlow から呼ばれる。★ DBもネットワークも触らない。
//
// ★★★ 段の並び（2026-09-04 に実物で確かめた往復）
//   esutama_therapist_list  GET  /admin/tamathera/therapist/        → 利用中の人と ctk を読む
//                                【DB側】了承・名簿の結び・送った印を見て相手と下書きを決める
//   esutama_diary_token     POST /admin/tamathera/therapist/create_shop_token → login_token
//   esutama_diary_proxy     GET  /tamathera/login/shop_token/<t>    → ★ 名前を突き合わせる
//   esutama_diary_page      GET  /tamathera/diary/post/             → ctk を拾う
//   esutama_diary_post      POST /tamathera/diary/post/             → 送る
//   esutama_diary_end       GET  /tamathera/login/end_proxy/        → ★ 必ず通る
//
// ★★★ **日記は上書きではなく【投稿】。** ★ 二度送ると記事が2本載り、店舗側から消せない。
//   → 送った印は DB 側の責任。★ ここでは「送った」という事実を note と監査に残すだけ。
//
// ★★★ **代理ログインに入ったら、何があっても end_proxy を通す。**
//   ★ 本人のセッションを店舗のブラウザ／中継役に残さない。
//   ★ 途中で止めるときも、まず end_proxy を積む（stopProxy）。
//
// ★★★ login_token は【実質パスワード】。★ 文脈にも監査にも note にも入れない。
//   ★ 受け取ったその場で URL を組み立て、次の段へ渡したら忘れる。

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import {
  parseEsutamaProxyTherapists, parseEsutamaCtk, parseEsutamaShopToken, isProxyLoggedInAs,
} from './esutamaTherapistParse';
import { buildEsutamaDiaryPost } from './esutamaDiaryPost';
import {
  buildEsutamaCreateShopTokenRequest, buildEsutamaProxyLoginRequest,
  buildEsutamaDiaryPageRequest, buildEsutamaDiaryPostRequest, buildEsutamaEndProxyRequest,
} from './esutamaRequests';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

/**
 * ★★★ 代理ログイン中に止めるときは、**まず end_proxy を積む**。
 *   ★ ここで stop すると本人のセッションが残る。★ それだけは避ける。
 *   ★ 止めた理由は監査に残し、end_proxy の段で「止まったまま終わる」ようにする。
 */
function stopViaEndProxy(ctx: RelayFlowContext, audits: FlowAudit[], note: string): FlowOutcome {
  if (!ctx.esutamaProxyOpen) return stop(audits, note);
  return {
    kind: 'next',
    // ★ 止めた理由を運ぶ。★ end_proxy のあとで stop に落とす
    next: (() => { const r = buildEsutamaEndProxyRequest(ctx.cookie);
      return { purpose: 'esutama_diary_end' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, esutamaDiaryStopNote: note } }; })(),
    audits,
    note: '止めます（' + note + '）。★ 先に代理ログインを終えます',
  };
}

/**
 * ① 魂セラピスト一覧を読んだ。
 * ★ 誰に送るかは DB を読まないと決められないので、ここでは次を積まない。
 * ★★ dryrun はここで終わり＝**代理ログインもしない・1文字も書かない**。
 */
export function afterEsutamaTherapistList(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const okStatus = input.status >= 200 && input.status < 400;
  const audits: FlowAudit[] = [{
    event: 'read_diary_targets',
    outcome: okStatus ? 'ok' : 'failed',
    detail: { status: input.status },
  }];
  if (!okStatus) {
    return stop(audits, '魂セラピストの一覧を読めませんでした（' + input.status + '）');
  }
  const rows = parseEsutamaProxyTherapists(input.body);
  const ctk = parseEsutamaCtk(input.body);
  // ★★ 0人でも stop にしない。★ 「まだ誰も魂セラピストを始めていない」は故障ではない。
  //   ★ 理由は呼び出し側が画面に出す（3つの「送れない理由」を混ぜない・第118便④）。
  return {
    kind: 'esutama_therapists',
    rows,
    ctk,
    context: { ...ctx, cookie },
    audits,
    note: '代理ログインできる方 ' + rows.length + '名を読み取りました'
      + (ctk ? '' : '。★ ただし ctk が見つかりませんでした'),
  };
}

/**
 * ② 代理ログイン用トークンの応答。
 * ★★★ ここで初めて【本人のセッション】へ入る。★ 以降 end_proxy を必ず通す。
 */
export function afterEsutamaDiaryToken(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const r = parseEsutamaShopToken(input.body);
  const audits: FlowAudit[] = [{
    event: 'diary_proxy_token',
    outcome: r.ok ? 'ok' : 'failed',
    // ★★ token も login_url も入れない。★ 期限だけ（いつ切れるかは運用に効く）
    detail: { status: input.status, castId: ctx.esutamaDiaryCastId ?? null, expiresAt: r.ok ? r.expiresAt : null, reason: r.ok ? null : r.error },
  }];
  if (!r.ok) return stop(audits, '代理ログインの発行を断られました（' + r.error + '）');

  let req;
  try {
    req = buildEsutamaProxyLoginRequest(cookie, r.token);
  } catch {
    return stop(audits, '代理ログインのURLを組み立てられませんでした');
  }
  return {
    kind: 'next',
    // ★★★ ここから本人のセッション。★ esutamaProxyOpen を立てる＝以降は必ず end_proxy を通す
    next: { purpose: 'esutama_diary_proxy', method: req.method, url: req.url, headers: req.headers, body: '', context: { ...ctx, cookie, esutamaProxyOpen: true } },
    audits,
    note: '代理ログインへ入ります（' + (ctx.esutamaDiaryCastName ?? '') + 'さん）',
  };
}

/**
 * ③ 代理ログインに入った。
 * ★★★ **名前を突き合わせる。** ★ 別の人に入っていたら、書かずに戻る。
 *   ★ 2026-09-04 に、探す道具が「さら」を探して【さくら】を返した。★ 人違いは起こる。
 */
export function afterEsutamaDiaryProxy(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const name = String(ctx.esutamaDiaryCastName ?? '');
  const matched = isProxyLoggedInAs(input.body, name);
  const audits: FlowAudit[] = [{
    event: 'diary_proxy_login',
    outcome: input.status >= 200 && input.status < 400 && matched ? 'ok' : 'failed',
    detail: { status: input.status, castId: ctx.esutamaDiaryCastId ?? null, name, matched },
  }];
  const next = { ...ctx, cookie, esutamaProxyOpen: true };
  if (input.status < 200 || input.status >= 400) {
    return stopViaEndProxy(next, audits, '代理ログインに入れませんでした（' + input.status + '）');
  }
  if (!matched) {
    // ★★★ ここが最後の砦。★ 別の人のアカウントに日記を出さない
    return stopViaEndProxy(next, audits, '別の方のアカウントに入った可能性があります（' + name + 'さんの印が見つかりません）');
  }
  return {
    kind: 'next',
    next: (() => { const r = buildEsutamaDiaryPageRequest(cookie);
      return { purpose: 'esutama_diary_page' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: next }; })(),
    audits,
    note: name + 'さんとして入れました。投稿ページを読みます',
  };
}

/**
 * ④ 投稿ページを読んだ。★ ctk を拾って POST を組む。
 * ★★ ctk が無ければ送らない。★ 空で送ると相手が弾き、理由が分からないまま止まる。
 */
export function afterEsutamaDiaryPage(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const ctk = parseEsutamaCtk(input.body);
  const draft = ctx.esutamaDiaryDraft;
  const audits: FlowAudit[] = [{
    event: 'diary_post_page',
    outcome: !!ctk && input.status >= 200 && input.status < 400 ? 'ok' : 'failed',
    detail: { status: input.status, hasCtk: !!ctk },
  }];
  const next = { ...ctx, cookie, esutamaDiaryCtk: ctk ?? undefined };
  if (input.status < 200 || input.status >= 400) {
    return stopViaEndProxy(next, audits, '投稿ページを読めませんでした（' + input.status + '）');
  }
  if (!ctk) return stopViaEndProxy(next, audits, '投稿ページの ctk が見つかりませんでした');
  if (!draft) return stopViaEndProxy(next, audits, '送る中身がありません');

  const built = buildEsutamaDiaryPost(draft, ctk);
  // ★★★ 空の記事を本人のアカウントから出さない
  if (built.empty) return stopViaEndProxy(next, audits, '本文が空のため送りません');

  const dropped: string[] = [];
  if (built.titleDropped > 0) dropped.push('題名を' + built.titleDropped + '字');
  if (built.contentDropped > 0) dropped.push('本文を' + built.contentDropped + '字');
  // ★★ 切ったことを黙らせない。★ 監査に残す
  if (dropped.length > 0) {
    audits.push({ event: 'diary_post_clamped', outcome: 'ok', detail: { titleDropped: built.titleDropped, contentDropped: built.contentDropped } });
  }

  return {
    kind: 'next',
    next: (() => { const r = buildEsutamaDiaryPostRequest(cookie, built.fields);
      return { purpose: 'esutama_diary_post' as const, method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: next }; })(),
    audits,
    note: '写メ日記を送ります' + (dropped.length > 0 ? '（★ 上限を超えたので ' + dropped.join('・') + ' 切りました）' : ''),
  };
}

/**
 * ⑤ 投稿した。
 *
 * ★★★ ここでは【成否を決めつけない】（出勤の書き込みと同じ理由・第46便）。
 *   相手が成功時に何を返すかは未確認。★ 推測で「送れました」と書かない。
 *   → **読み返して確かめるのが本筋**だが、まずは end_proxy を通してから。
 *   ★ 呼び出し側（DB 側）が、送った印を書く前に一覧で確かめること。
 */
export function afterEsutamaDiaryPost(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const posted = input.status >= 200 && input.status < 400;
  const audits: FlowAudit[] = [{
    event: 'push_diary',
    outcome: posted ? 'ok' : 'failed',
    detail: {
      status: input.status,
      castId: ctx.esutamaDiaryCastId ?? null,
      name: ctx.esutamaDiaryCastName ?? null,
      diaryPostId: ctx.esutamaDiaryPostId ?? null,
    },
  }];
  const next = { ...ctx, cookie, esutamaDiaryPosted: posted };
  // ★★★ 成功でも失敗でも end_proxy を通す。★ 本人のセッションを残さない
  return {
    kind: 'next',
    next: (() => { const r = buildEsutamaEndProxyRequest(cookie);
      return { purpose: 'esutama_diary_end' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: next }; })(),
    audits,
    note: posted
      ? '送りました（★ 載ったかは読み返しで確かめます）。代理ログインを終えます'
      : '送れませんでした（' + input.status + '）。代理ログインを終えます',
  };
}

/**
 * ⑥ 代理ログインを終えた。★ ここで流れが終わる。
 * ★★ 途中で止めた理由があれば、それを持って stop で終わる（黙って done にしない）。
 */
export function afterEsutamaDiaryEnd(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const ended = input.status >= 200 && input.status < 400;
  const audits: FlowAudit[] = [{ event: 'diary_proxy_end', outcome: ended ? 'ok' : 'failed', detail: { status: input.status } }];
  // ★★★ 終われなかったことを黙らせない。★ 本人のセッションが残っているかもしれない
  if (!ended) {
    return stop(audits, '★ 代理ログインを終えられませんでした（' + input.status + '）。★ 店舗様の画面で「代理ログイン終了」をお願いします');
  }
  const stopNote = ctx.esutamaDiaryStopNote;
  if (stopNote) return stop(audits, stopNote + '（代理ログインは終えました）');
  return {
    kind: 'done',
    audits,
    note: ctx.esutamaDiaryPosted
      ? (ctx.esutamaDiaryCastName ?? '') + 'さんへ写メ日記を送りました'
      : '送れませんでした（代理ログインは終えました）',
  };
}

/**
 * ★ token 発行の段を組む（呼び出し側＝DB 側が相手を決めたあとで使う）。
 * ★★ ここを通ると相手にトークンが発行される（＝相手に状態を作らせる）。★ 送ると決めてから呼ぶこと。
 */
export function buildEsutamaDiaryTokenStep(ctx: RelayFlowContext, castId: string, ctk: string) {
  const r = buildEsutamaCreateShopTokenRequest(ctx.cookie, castId, ctk);
  return { purpose: 'esutama_diary_token' as const, method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: ctx };
}
