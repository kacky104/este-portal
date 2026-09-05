// 駅ちかの新着情報（ニュース）を1枠だけ書き換える段（第155便・2026-09-05）。
//
// ★ このファイルは通信もDBも触らない。★ 判断だけ。esutamaFlow.ts と同じ作法。
//
// ★★★ 流れ
//   login → article_read →（試し打ちならここで終わり）→ article_save → article_verify → 終わり
//
// ★★★ 守っていること
//   ① 記事ID・画像の識別子は **読んだページのものをそのまま使う**。★ 決め打ちしない。
//      ★ id を間違えると【別の枠を上書きする】。★ 画像を落とすと【いまの画像が消える】。
//   ② 触るのは **文脈に入っている1枠だけ**。★ 枠が無ければ進めない。
//   ③ **「送った」と「載った」を分ける**（第136便）。
//      ★ 保存の応答では「載った」と言わない。★ 読み返して、送ったタイトルが入っていて初めて言う。

import type { FlowAudit, FlowOutcome, FlowNextRequest, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { RELAY_USER_AGENT } from './relayUserAgent';
import {
  parseEkichikaArticlePage,
  buildEkichikaArticleSaveRequest,
  ekichikaArticleEditUrl,
  isArticleSlot,
  articleSlotLabel,
  checkArticleTitle,
  checkArticleBody,
} from './ekichikaArticle';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

/** ログイン画面へ戻された＝セッションが切れている */
function redirectedToLogin(input: Input): boolean {
  const loc = String(input.headers['location'] ?? '');
  if (input.status >= 300 && input.status < 400 && /\/admin\/login/i.test(loc)) return true;
  // ★ 200 でログインフォームが返ることもある
  return input.status === 200 && /name="login_id"|\/admin\/login/i.test(input.body) && !/id="article_form"/i.test(input.body);
}

function readHeaders(cookie: string, referer: string): FlowNextRequest['headers'] {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    referer,
    cookie,
  };
}

/**
 * 編集ページを読む段を積む。
 * ★ 枠が文脈に入っていなければ null（★ どこを書き換えるか決まっていないまま進めない）。
 */
export function buildArticleReadStep(ctx: RelayFlowContext): FlowNextRequest | null {
  if (!isArticleSlot(ctx.articleSlot)) return null;
  const url = ekichikaArticleEditUrl(ctx.articleSlot);
  return {
    purpose: 'article_read',
    method: 'GET',
    url,
    headers: readHeaders(ctx.cookie, 'https://ranking-deli.jp/admin/articles/'),
    body: '',
    context: ctx,
  };
}

// ────────────────────────── ① 編集ページを読んだ ──────────────────────────

export function afterArticleRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const slot = ctx.articleSlot;
  if (!isArticleSlot(slot)) return stop([], '書き換える枠が文脈に入っていない');

  if (redirectedToLogin(input)) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'back_to_login', flowId } }],
      'ニュースの編集ページがログイン画面へ戻された＝ログインできていない',
    );
  }
  if (input.status >= 300) {
    return stop(
      [{ event: 'read_article', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'http_error', slot, flowId } }],
      '編集ページの応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaArticlePage(input.body, slot);
  if (page === null) {
    // ★ 「読めなかった」と「無かった」を混ぜない。★ ここは読めなかった
    return stop(
      [{ event: 'read_article', outcome: 'failed', summary: '', detail: { reason: 'parse_failed', slot, flowId } }],
      '編集ページから記事IDを読み取れなかった（画面の作りが変わった可能性）',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);

  // ★ ここで初めて「ログインできた」と言える（★ 読めた＝入れた）
  const audits: FlowAudit[] = [
    { event: 'login', outcome: 'ok', summary: '', detail: { flowId } },
    { event: 'read_article', outcome: 'ok', summary: '', detail: { slot, articleId: page.id, girls: page.girlIds.length, flowId } },
  ];

  const title = String(ctx.articleTitle ?? '');
  const body = String(ctx.articleBody ?? '');
  const t = checkArticleTitle(title);
  const b = checkArticleBody(body);
  if (!t.ok || !b.ok) {
    // ★★ 送る前に止める。★ 断られてから気づくのではなく、こちらで気づく
    return stop(
      [...audits, {
        event: 'plan_article', outcome: 'failed', summary: '',
        detail: { slot, reason: 'invalid_content', flowId },
      }],
      '送る内容が駅ちかの決まりに合わない: ' + (t.ok ? b.message : t.message),
    );
  }

  const planAudit: FlowAudit = {
    event: 'plan_article',
    outcome: 'ok',
    summary: '',
    detail: { slot, where: articleSlotLabel(slot), titleLength: title.length, flowId },
  };

  // ★★★ 試し打ちはここで終わり。★ 1文字も書いていない
  if (ctx.intent === 'article_dryrun') {
    return { kind: 'done', audits: [...audits, planAudit], note: '試し打ち: ' + articleSlotLabel(slot) + ' へ出す内容を組み立てた（送っていない）' };
  }

  let next: { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string };
  try {
    next = buildEkichikaArticleSaveRequest(
      cookie,
      page,
      {
        title,
        body,
        ...(ctx.articleGirlId ? { girlId: ctx.articleGirlId } : {}),
        ...(ctx.articleImage ? { image: ctx.articleImage } : {}),
      },
      RELAY_USER_AGENT,
    );
  } catch (e) {
    return stop(
      [...audits, { event: 'plan_article', outcome: 'failed', summary: '', detail: { slot, reason: 'build_failed', flowId } }],
      '送るものを組み立てられなかった: ' + (e as Error).message,
    );
  }

  return {
    kind: 'next',
    audits: [...audits, planAudit],
    note: articleSlotLabel(slot) + ' を書き換えにいく',
    next: {
      purpose: 'article_save',
      method: 'POST',
      url: next.url,
      headers: next.headers,
      body: next.body ?? '',
      // ★★ 送ったタイトルを持ち回す。★ 読み返しで突き合わせるため
      context: { ...ctx, cookie, articleSentTitle: title },
    },
  };
}

// ────────────────────────── ② 保存の応答 ──────────────────────────

export function afterArticleSave(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const slot = ctx.articleSlot;
  if (!isArticleSlot(slot)) return stop([], '書き換える枠が文脈に入っていない');

  if (input.status >= 400) {
    return stop(
      [{ event: 'push_article', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'http_error', slot, flowId } }],
      '書き込みの応答が ' + input.status + ' だった',
    );
  }
  const location = String(input.headers['location'] ?? '');
  if (input.status >= 300 && input.status < 400 && /\/admin\/login/i.test(location)) {
    return stop(
      [{ event: 'push_article', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'back_to_login', slot, flowId } }],
      '書き込み中にログイン画面へ戻された',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);

  // ★★★ ここで「載りました」と言わない。★ 次の段（読み直し）だけが知っている。
  return {
    kind: 'next',
    audits: [{ event: 'push_article', outcome: 'ok', summary: '', detail: { httpStatus: input.status, slot, flowId } }],
    note: '書き込みの応答を受け取った。★ 載ったかは読み返して確かめる',
    next: {
      purpose: 'article_verify',
      method: 'GET',
      url: ekichikaArticleEditUrl(slot),
      headers: readHeaders(cookie, ekichikaArticleEditUrl(slot)),
      body: '',
      context: { ...ctx, cookie },
    },
  };
}

// ────────────────────────── ③ 読み返して確かめる ──────────────────────────

export function afterArticleVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const slot = ctx.articleSlot;
  if (!isArticleSlot(slot)) return stop([], '書き換える枠が文脈に入っていない');
  const sent = String(ctx.articleSentTitle ?? '');

  if (redirectedToLogin(input) || input.status >= 300) {
    return stop(
      [{ event: 'verify_article', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'read_failed', slot, flowId } }],
      '読み返しの応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaArticlePage(input.body, slot);
  if (page === null) {
    return stop(
      [{ event: 'verify_article', outcome: 'failed', summary: '', detail: { reason: 'parse_failed', slot, flowId } }],
      '読み返しの編集ページを読み取れなかった',
    );
  }

  // ★★★ 送ったタイトルが入っているか。★ ここで初めて「載った」と言える
  if (sent.length === 0) {
    return stop(
      [{ event: 'verify_article', outcome: 'failed', summary: '', detail: { reason: 'no_sent_title', slot, flowId } }],
      '送ったタイトルが文脈に無いので確かめられない',
    );
  }
  if (page.title.trim() !== sent.trim()) {
    // ★ 「載っていない」と言い切らない。★ 別の誰かが後から書き換えた可能性もある
    return {
      kind: 'done',
      audits: [{
        event: 'verify_article', outcome: 'stopped', summary: '',
        detail: { reason: 'title_mismatch', slot, flowId },
      }],
      note: '読み返したが、いま載っているタイトルが送ったものと違う（別の更新が入った可能性）',
    };
  }

  return {
    kind: 'done',
    audits: [{ event: 'verify_article', outcome: 'ok', summary: '', detail: { slot, where: articleSlotLabel(slot), flowId } }],
    note: articleSlotLabel(slot) + ' に載ったことを確かめた',
  };
}
