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
import { relayFileUrl } from './relayMultipart';
import {
  parseArticleImageIds,
  buildArticleImageUpload,
  buildArticleImageCropFields,
  parseArticleImageJson,
  encodeFields,
  EKICHIKA_ARTICLE_IMAGE_URL,
  EKICHIKA_ARTICLE_CROP_URL,
} from './ekichikaArticleImage';
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
 * ①②（ajax）のヘッダ。★ 相手の JS が送っていたものに合わせる（2026-09-05 実測）。
 *   ★ X-Requested-With が無いと ajax として扱われないことがある。★ 実測どおりに送る。
 */
function ajaxHeaders(cookie: string, slot: number): Record<string, string> {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'application/json, text/javascript, */*; q=0.01',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    'x-requested-with': 'XMLHttpRequest',
    origin: 'https://ranking-deli.jp',
    referer: ekichikaArticleEditUrl(slot),
    cookie,
  };
}

/**
 * ★★★ 一覧を読む段を積む（第156便）。
 *   ★ 編集ページより【先】に読む。★ その枠に記事があるか・公開ページに出るかは一覧にしか無い。
 * ★ 枠が文脈に入っていなければ null。
 */
export function buildArticleListStep(ctx: RelayFlowContext): FlowNextRequest | null {
  // ★★ 枠を1つ書き換えにいくときは、どの枠かが決まっていなければ進めない。
  //   ★ ただし「枠の状態を読むだけ」（第158便）は**枠を指定しない**。★ 5枠ぜんぶを見に行く
  if (!isArticleSlot(ctx.articleSlot) && ctx.intent !== 'article_slots') return null;
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
  // ★★ 「読むだけ」は枠を指定しない。★ それ以外は、どの枠かが決まっていなければ進めない
  const readOnly = ctx.intent === 'article_slots';
  if (!readOnly && !isArticleSlot(slot)) return stop([], '書き換える枠が文脈に入っていない');

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

  // ★★★ ここから先は【読めた事実】をかならず持って返す（第158便）。
  //   ★ 止まる場合でも rows を落とさない。★ 落とすと画面は「まだ読んでいない」ままになり、
  //     店舗様は同じところでもう一度つまずく。

  // ★★★ 「読むだけ」のとき（第158便→第160便で1段のばした）。
  //   ★ 一覧には「選べる女の子」が入っていない。★ 編集ページにしか無い。
  //   → ★ 記事のある枠を1つだけ **GET で** 開いて、選択肢を拾って終わる。
  //   ★★ 読むだけなのは変わらない。★ 1文字も書かない（POST を積まない）。
  if (readOnly) {
    // ★ 記事のある枠を1つ。★ 無ければ開かない（★ 開いても選択肢が読めるとは限らないし、用も無い）
    const openable = rows.find((r) => r.hasArticle) ?? null;
    if (openable === null) {
      return {
        kind: 'article_slots', rows, audits,
        note: '新着情報の枠の状態を読み取った（' + rows.length + '枠）。★ 記事のある枠が無いので編集ページは開かない',
      };
    }
    return {
      kind: 'article_slots', rows, audits,
      note: '新着情報の枠の状態を読み取った（' + rows.length + '枠）。★ ' + openable.label + ' を開いて選べる人を拾う',
      next: {
        ...(buildArticleReadStep({ ...ctx, cookie, articleSlot: openable.slot }) as FlowNextRequest),
        context: { ...ctx, cookie, articleSlot: openable.slot, articleWhere: openable.label },
      },
    };
  }

  // ★ 型を閉じるためだけ。★ 上で弾いているのでここへは来ない（★ それでも黙って通さない）
  if (!isArticleSlot(slot)) {
    return { kind: 'article_slots', rows, audits, note: '書き換える枠が文脈に入っていない' };
  }

  const row = findArticleRow(rows, slot);
  if (row === null) {
    return {
      kind: 'article_slots', rows,
      audits: [...audits, { event: 'read_article_list', outcome: 'failed', summary: '', detail: { slot, reason: 'slot_not_listed', flowId } }],
      note: '指定した枠が一覧に見当たらない',
    };
  }

  // ★★★ 第163便（2026-09-05）: 記事が無い枠でも【新しく作れる】ようになった。
  //   ★ 駅ちかの「新規」の画面は編集ページとまったく同じで、id が空なだけ（実測）。
  //   ★★ だから、ここで止めない。★ 編集ページを読みにいけば、id が空のページが返る。
  //   ★ 以前はここで no_article として止めていた（★ 第156便）。★ その必要が無くなった。

  return {
    kind: 'article_slots',
    rows,
    audits,
    note: row.label + ' を読みにいく'
      + (row.hasArticle ? '' : '（★ この枠は空なので新しく作る）')
      + (row.visible === false ? '（★ この枠はいま非表示）' : ''),
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

  // ★★★ 「読むだけ」はここで終わり（第160便）。★ 選べる人を持って返す。
  //   ★ 送る内容は組み立てない（★ そもそも文脈にタイトルも本文も入っていない）。
  //   ★★ 1文字も書いていない。★ ここまで GET が3回だけ。
  if (ctx.intent === 'article_slots') {
    return {
      kind: 'article_slots',
      girls: page.girls,
      audits,
      note: where + ' の編集ページから、選べる人を ' + page.girls.length + '人 読み取った',
    };
  }

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

  // ────────────────────────── ★★★ 画像を先に上げる（第162便）──────────────────────────
  //
  // ★★ 記事の保存より【前】に、①上げる → ②切る を済ませる。
  //   ★ 保存に入れる g_image1 / g_image1s は、①②が返した識別子だから。
  // ★★★ **ctx.articleImgS が入っていたら、もう上げ終わっている。**
  //   ★ ②のあとにこのページを読み直すので、印が無いと永久に上げ続ける。
  const wantUpload = ctx.articleImage === 'upload' && !!ctx.articleFile && !ctx.articleImgS;

  // ★★★ 画像を送る設定なのに、在処も識別子も無い。★ ここで止める。
  //   ★ このまま保存へ進むと img_flg=0 で識別子が空になり、**いまの画像が消える**。
  //   ★★ 組み立て側でも弾いているが、理由が店舗様に伝わる形で先に止める。
  if (ctx.intent === 'article_push' && ctx.articleImage === 'upload' && !ctx.articleFile && !ctx.articleImgS) {
    return stop(
      [...audits, {
        event: 'push_article_image', outcome: 'failed', summary: '',
        detail: { slot, where, reason: 'no_file', flowId },
      }],
      '送る画像が文脈に入っていません（★ このまま進むと、いまの画像が消えます）',
    );
  }

  if (ctx.intent === 'article_push' && wantUpload) {
    const ids = parseArticleImageIds(input.body);
    if (ids.problems.length > 0) {
      // ★ 読めていないのに送らない（★ 第145便の反省）。★ 理由を残して止める
      return stop(
        [...audits, {
          event: 'push_article_image', outcome: 'failed', summary: '',
          detail: { slot, where, reason: 'ids_unreadable', flowId },
        }],
        '編集ページから画像を送るのに要る値を読めなかった: ' + ids.problems.join(' / '),
      );
    }
    const file = ctx.articleFile as NonNullable<RelayFlowContext['articleFile']>;
    let multipart;
    try {
      multipart = buildArticleImageUpload(ids, {
        url: relayFileUrl(file.bucket, file.path),
        filename: file.filename,
        contentType: file.contentType,
      });
    } catch (e) {
      return stop(
        [...audits, {
          event: 'push_article_image', outcome: 'failed', summary: '',
          detail: { slot, where, reason: 'build_failed', flowId },
        }],
        '画像を送るものを組み立てられなかった: ' + (e as Error).message,
      );
    }
    return {
      kind: 'next',
      audits,
      note: where + ' へ出す画像を先に上げる',
      next: {
        purpose: 'article_image',
        method: 'POST',
        url: EKICHIKA_ARTICLE_IMAGE_URL,
        headers: ajaxHeaders(cookie, slot),
        body: '',
        multipart,
        // ★ ①②で使うので、読んだ値を持ち回す
        context: { ...ctx, cookie, articleWhere: where, articleCsrf: ids.csrfToken, articleShopId: ids.shopId },
      },
    };
  }

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
        // ★★★ 上げたばかりの識別子を渡す（第162便）。★ 読んだページの古い値では上げた画像が使われない
        ...(ctx.articleImgB && ctx.articleImgS
          ? { uploaded: { imgB: ctx.articleImgB, imgS: ctx.articleImgS } }
          : {}),
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

// ────────────────────────── ★★★ 画像①：上げた（第162便）──────────────────────────

/**
 * ①article_image.json の応答。
 *
 * ★★ 「読めなかった」と「相手が断った」を分ける（`problems` / `err`）。
 * ★ ここでは【まだ記事は1文字も変わっていない】。★ 画像を相手の置き場に上げただけ。
 */
export function afterArticleImage(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const slot = ctx.articleSlot;
  if (!isArticleSlot(slot)) return stop([], '書き換える枠が文脈に入っていない');
  const where = String(ctx.articleWhere ?? articleSlotLabel(slot));

  // ★★★ 何を送ったかを記録に残す（第164便）。
  //   ★ 断られたとき「そもそも何を送ったのか」が分からないと、直す場所が決まらない。
  //   ★★ 種類は**中身から判定したもの**（拡張子ではない）。★ 寸法も実寸。
  //   ★ 在処（URL）は入れない。★ 秘密落としに引っかかるうえ、追うのに要らない
  const f = ctx.articleFile;
  const sent: Record<string, string | number> = f
    ? { imageType: String(f.contentType), imageW: Number(f.width), imageH: Number(f.height) }
    : {};

  if (input.status >= 300) {
    return stop(
      [{ event: 'push_article_image', outcome: 'failed', summary: '', detail: { slot, where, ...sent, httpStatus: input.status, reason: 'http_error', flowId } }],
      '画像を上げる応答が ' + input.status + ' だった',
    );
  }

  const r = parseArticleImageJson(input.body);
  if (r.err) {
    // ★★★ 相手が断った。★ こちらの読み取りの問題ではない。
    //   ★★ **相手が何と言ったかを記録に残す**（第164便）。
    //     ★ 2026-09-05 の実弾で refused になったが、理由を残していなかったため何も分からなかった。
    //     ★ 「静かに失敗させない」は、理由を残して初めて守れる。
    return stop(
      [{
        event: 'push_article_image', outcome: 'failed', summary: '',
        detail: { slot, where, ...sent, reason: 'refused', providerError: r.err.slice(0, 200), flowId },
      }],
      '駅ちかが画像を受け取らなかった: ' + r.err.slice(0, 200),
    );
  }
  if (r.problems.length > 0) {
    return stop(
      [{
        event: 'push_article_image', outcome: 'failed', summary: '',
        // ★ 何が読めなかったかも残す（★ 応答そのものは入れない。★ 何が入っているか分からないため）
        detail: { slot, where, ...sent, reason: 'parse_failed', missing: r.problems.join(' / ').slice(0, 200), bodyLength: input.body.length, flowId },
      }],
      '画像を上げた応答を読めなかった: ' + r.problems.join(' / '),
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const file = ctx.articleFile;
  // ★ 実寸が無ければ切り抜きの物差しが決まらない。★ 決め打ちしない
  if (!file || !Number.isFinite(file.width) || !Number.isFinite(file.height) || file.width <= 0 || file.height <= 0) {
    return stop(
      [{ event: 'push_article_image', outcome: 'failed', summary: '', detail: { slot, where, ...sent, reason: 'no_size', flowId } }],
      '画像の実寸が文脈に入っていないので切り抜けない',
    );
  }

  const ids = { csrfToken: String(ctx.articleCsrf ?? ''), shopId: String(ctx.articleShopId ?? ''), problems: [] as string[] };
  let fields;
  try {
    // ★★★ 切り抜きは【画像ぜんぶ】。★ こちらで先に整えた画像を上げているので、切らない。
    //   ★ 物差しは実寸（sh_w/sh_h に実寸を入れる＝写真の②と同じ理屈・第107便）。
    //   ★★ 記事で確かめたわけではない。★ 実弾の1枚目で目で見て確かめる。
    fields = buildArticleImageCropFields(
      ids,
      { imgB: r.imgB, srcUrl: r.src },
      { x: 0, y: 0, w: file.width, h: file.height },
      { w: file.width, h: file.height },
    );
  } catch (e) {
    return stop(
      [{ event: 'push_article_image', outcome: 'failed', summary: '', detail: { slot, where, ...sent, reason: 'crop_build_failed', flowId } }],
      '切り抜きを組み立てられなかった: ' + (e as Error).message,
    );
  }

  return {
    kind: 'next',
    audits: [{ event: 'push_article_image', outcome: 'ok', summary: '', detail: { slot, where, ...sent, flowId } }],
    note: '画像を上げた。★ 次は切り抜き（記事はまだ変えていない）',
    next: {
      purpose: 'article_crop',
      method: 'POST',
      url: EKICHIKA_ARTICLE_CROP_URL,
      headers: { ...ajaxHeaders(cookie, slot), 'content-type': 'application/x-www-form-urlencoded' },
      body: encodeFields(fields),
      context: { ...ctx, cookie, articleImgB: r.imgB },
    },
  };
}

// ────────────────────────── ★★★ 画像②：切った（第162便）──────────────────────────

/**
 * ②article_crop.json の応答。
 * ★ ここまで来ても【記事はまだ変わっていない】。★ 次に編集ページを読み直して、保存へ進む。
 */
export function afterArticleCrop(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const slot = ctx.articleSlot;
  if (!isArticleSlot(slot)) return stop([], '書き換える枠が文脈に入っていない');
  const where = String(ctx.articleWhere ?? articleSlotLabel(slot));

  if (input.status >= 300) {
    return stop(
      [{ event: 'push_article_image', outcome: 'failed', summary: '', detail: { slot, where, httpStatus: input.status, reason: 'crop_http_error', flowId } }],
      '切り抜きの応答が ' + input.status + ' だった',
    );
  }

  const r = parseArticleImageJson(input.body);
  if (r.err) {
    // ★★★ 相手の言葉を残す（第164便）。★ 理由が無ければ直せない
    return stop(
      [{
        event: 'push_article_image', outcome: 'failed', summary: '',
        detail: { slot, where, reason: 'crop_refused', providerError: r.err.slice(0, 200), flowId },
      }],
      '駅ちかが切り抜きを受け取らなかった: ' + r.err.slice(0, 200),
    );
  }
  // ★★★ ②の要は img_s。★ これが無ければ記事に付けられない
  if (!/^\d{8,20}$/.test(r.imgS)) {
    return stop(
      [{ event: 'push_article_image', outcome: 'failed', summary: '', detail: { slot, where, reason: 'no_img_s', flowId } }],
      '切り抜いた画像の識別子（img_s）が返らなかった',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  // ★ ①で返った img_b を正とする。★ ②の応答にも入っているが、食い違ったら①を信じる
  const imgB = String(ctx.articleImgB ?? r.imgB);

  return {
    kind: 'next',
    audits: [],
    note: '切り抜いた。★ 編集ページを読み直して保存へ進む',
    next: {
      // ★★★ 編集ページを読み直す。★ そのとき articleImgS が入っているので、二度は上げない
      ...(buildArticleReadStep({ ...ctx, cookie }) as FlowNextRequest),
      context: { ...ctx, cookie, articleImgB: imgB, articleImgS: r.imgS },
    },
  };
}
