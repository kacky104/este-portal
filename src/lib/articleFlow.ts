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
  parseEkichikaArticleList,
  findArticleRow,
  buildEkichikaArticleListRequest,
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
 * ★★★ 一覧を読む段を積む（第156便）。
 *   ★ 編集ページより【先】に読む。★ その枠に記事があるか・公開ページに出るかは一覧にしか無い。
 * ★ 枠が文脈に入っていなければ null。
 */
export function buildArticleListStep(ctx: RelayFlowContext): FlowNextRequest | null {
  if (!isArticleSlot(ctx.articleSlot)) return null;
  const r = buildEkichikaArticleListRequest(ctx.cookie, RELAY_USER_AGENT);
  return { purpose: 'article_list', method: 'GET', url: r.url, headers: r.headers, body: '', context: ctx };
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

// ────────────────────────── ① 一覧を読んだ（第156便） ──────────────────────────

/**
 * ★★★ ここで確かめること（2026-09-05 に実弾を撃って分かった）
 *   ・その枠に **記事があるか**（無ければ上書きできない。新規の道はまだ無い）
 *   ・その枠が **公開ページに出るか**（★ 非表示なら、送っても出ない）
 *   ・相手の言葉の **カテゴリー名**（★ 記録に「駅ちかの新人速報」と書くため）
 */
export function afterArticleList(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const slot = ctx.articleSlot;
  if (!isArticleSlot(slot)) return stop([], '書き換える枠が文脈に入っていない');

  if (redirectedToLogin(input)) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'back_to_login', flowId } }],
      'ニュースの一覧がログイン画面へ戻された＝ログインできていない',
    );
  }
  if (input.status >= 300) {
    return stop(
      [{ event: 'read_article_list', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'http_error', flowId } }],
      '一覧の応答が ' + input.status + ' だった',
    );
  }

  const rows = parseEkichikaArticleList(input.body);
  if (rows.length === 0) {
    // ★ 「読めなかった」と「無かった」を混ぜない。★ 5枠あるはずのものが0件＝読めなかった
    return stop(
      [{ event: 'read_article_list', outcome: 'failed', summary: '', detail: { reason: 'parse_failed', flowId } }],
      '一覧から枠を1つも読み取れなかった（画面の作りが変わった可能性）',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const audits: FlowAudit[] = [
    // ★ ここで初めて「ログインできた」と言える（★ 読めた＝入れた）
    { event: 'login', outcome: 'ok', summary: '', detail: { flowId } },
    {
      event: 'read_article_list', outcome: 'ok', summary: '',
      detail: {
        slots: rows.length,
        // ★ いくつの枠が公開ページに出ているか（★ 店舗様への案内に使う）
        shown: rows.filter((r) => r.visible === true).length,
        empty: rows.filter((r) => !r.hasArticle).length,
        flowId,
      },
    },
  ];

  const row = findArticleRow(rows, slot);
  if (row === null) {
    return stop(
      [...audits, { event: 'read_article_list', outcome: 'failed', summary: '', detail: { slot, reason: 'slot_not_listed', flowId } }],
      '指定した枠が一覧に見当たらない',
    );
  }

  // ★★★ 記事が無い枠は上書きできない。★ 新規の道はまだ無い（★ 黙って進めない）
  if (!row.hasArticle) {
    return stop(
      [...audits, {
        event: 'plan_article', outcome: 'stopped', summary: '',
        detail: { slot, where: row.label, reason: 'no_article', flowId },
      }],
      row.label + ' にはまだ記事がありません（新しく作る道はまだありません）',
    );
  }

  return {
    kind: 'next',
    audits,
    note: row.label + ' を読みにいく' + (row.visible === false ? '（★ この枠はいま非表示）' : ''),
    next: {
      ...(buildArticleReadStep({ ...ctx, cookie }) as FlowNextRequest),
      // ★ 相手の言葉と、公開状態を持ち回す。★ 分からなければ入れない
      context: {
        ...ctx,
        cookie,
        articleWhere: row.label,
        ...(row.visible === true || row.visible === false ? { articleVisible: row.visible } : {}),
      },
    },
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

  // ★★ ログインできたことは【一覧の段】で記録済み（第156便）。★ 二重に出さない
  const where = String(ctx.articleWhere ?? articleSlotLabel(slot));
  const audits: FlowAudit[] = [
    { event: 'read_article', outcome: 'ok', summary: '', detail: { slot, where, articleId: page.id, girls: page.girlIds.length, flowId } },
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
        detail: { slot, where, reason: 'invalid_content', flowId },
      }],
      '送る内容が駅ちかの決まりに合わない: ' + (t.ok ? b.message : t.message),
    );
  }

  const planAudit: FlowAudit = {
    event: 'plan_article',
    outcome: 'ok',
    summary: '',
    detail: { slot, where, titleLength: title.length, flowId },
  };

  // ★★★ 試し打ちはここで終わり。★ 1文字も書いていない
  if (ctx.intent === 'article_dryrun') {
    return {
      kind: 'done',
      audits: [...audits, planAudit],
      note: '試し打ち: ' + where + ' へ出す内容を組み立てた（送っていない）'
        + (ctx.articleVisible === false ? '。★ この枠はいま非表示なので、送っても公開ページには出ない' : ''),
    };
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
      [...audits, { event: 'plan_article', outcome: 'failed', summary: '', detail: { slot, where, reason: 'build_failed', flowId } }],
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

  const where = String(ctx.articleWhere ?? articleSlotLabel(slot));
  if (input.status >= 400) {
    return stop(
      [{ event: 'push_article', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'http_error', slot, where, flowId } }],
      '書き込みの応答が ' + input.status + ' だった',
    );
  }
  const location = String(input.headers['location'] ?? '');
  if (input.status >= 300 && input.status < 400 && /\/admin\/login/i.test(location)) {
    return stop(
      [{ event: 'push_article', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'back_to_login', slot, where, flowId } }],
      '書き込み中にログイン画面へ戻された',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);

  // ★★★ ここで「載りました」と言わない。★ 次の段（読み直し）だけが知っている。
  return {
    kind: 'next',
    audits: [{ event: 'push_article', outcome: 'ok', summary: '', detail: { httpStatus: input.status, slot, where, flowId } }],
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
  const where = String(ctx.articleWhere ?? articleSlotLabel(slot));
  /**
   * ★★★ 非表示の枠か（第156便）。★ 送れて・管理画面に入っていても、**公開ページには出ない。**
   *   ★ 2026-09-05 に実弾で分かった。★ 「載った」と書いてしまわないための旗。
   */
  const hidden = ctx.articleVisible === false;

  if (redirectedToLogin(input) || input.status >= 300) {
    return stop(
      [{ event: 'verify_article', outcome: 'failed', summary: '', detail: { httpStatus: input.status, reason: 'read_failed', slot, where, flowId } }],
      '読み返しの応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaArticlePage(input.body, slot);
  if (page === null) {
    return stop(
      [{ event: 'verify_article', outcome: 'failed', summary: '', detail: { reason: 'parse_failed', slot, where, flowId } }],
      '読み返しの編集ページを読み取れなかった',
    );
  }

  // ★★★ 送ったタイトルが入っているか。★ ここで初めて「載った」と言える
  if (sent.length === 0) {
    return stop(
      [{ event: 'verify_article', outcome: 'failed', summary: '', detail: { reason: 'no_sent_title', slot, where, flowId } }],
      '送ったタイトルが文脈に無いので確かめられない',
    );
  }
  if (page.title.trim() !== sent.trim()) {
    // ★ 「載っていない」と言い切らない。★ 別の誰かが後から書き換えた可能性もある
    return {
      kind: 'done',
      audits: [{
        event: 'verify_article', outcome: 'stopped', summary: '',
        detail: { reason: 'title_mismatch', slot, where, flowId },
      }],
      note: '読み返したが、いま載っているタイトルが送ったものと違う（別の更新が入った可能性）',
    };
  }

  return {
    kind: 'done',
    // ★★★ hidden を必ず載せる。★ 文言が「載りました」と「公開ページには出ていません」で割れる
    audits: [{ event: 'verify_article', outcome: 'ok', summary: '', detail: { slot, where, hidden, flowId } }],
    note: hidden
      ? where + ' に反映したが、この枠はいま非表示なので公開ページには出ていない'
      : where + ' に載ったことを確かめた',
  };
}
