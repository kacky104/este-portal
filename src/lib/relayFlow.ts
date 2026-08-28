// 駅ちかへの中継フロー・純粋関数（第41便）。
//
// ★★★ このファイルは通信もDBも触らない。「いまの応答を見て、次に何をするか」だけを決める。
//   DBへ書く・ジョブを積むのは src/app/lib/media/relayFlow.ts。
//   ★ 分けている理由は mediaAudit.ts と同じ:
//     **テストできる形にしておかないと、判断の根拠が1つも無くなる。**
//
// ★★★ この便の射程（第41便）
//   login → read_work まで。**駅ちかを一切書き換えない。**
//   だから実弾を何度流しても店舗に影響が無く、/mypage の接続テストがそのまま本番経路になる。
//   write_work / verify_work は「積む材料（フクエスの出勤→WorkChange[]）」がまだ無いので積まない。
//
// ★★★ いちばん大事な設計判断 —— ログインの成否を【ログインの応答では判定しない】
//   駅ちかのログインは CAPTCHA もトークンも無い素の POST（設計メモ §17-9）。
//   だが「302 が返ったこと」と「ログインできたこと」は別の話で、
//   失敗時の応答の形（200でフォーム再表示か、302で/admin/loginへ戻すか）は**実機で未確認**。
//   → 推測で判定を書くと、間違えたときに「ログインできたつもり」の監査ログが残る。
//   → **次の段（GET /admin/girlswork/）が読めたかどうかを、ログインの成否そのものとする。**
//     読めた ＝ ログインできた。ログイン画面が返った ＝ ログインできなかった。
//     ★ この形なら、駅ちかの失敗時の応答が何であっても判定を間違えない。
//
// ★★ 失敗しても【積み直さない】。
//   completeRelayJob の attempts は「通信が届かなかった」ための再送であって、
//   ログイン失敗の再送ではない。ID/PWが違うまま3回投げると相手のアカウントが凍る（設計メモ §17-1）。
//   → ここが 'stop' を返したら、そのフローは終わり。人が直すまで再開しない。

import { parseWorkPage, checkWorkPage, encodePayload } from './ekichikaWorkParse';
import { mergeCookies } from './relayJob';
import type { AuditDetail, MediaAuditEvent, MediaAuditOutcome } from './mediaAudit';

/** 駅ちかのログインフォーム（設計メモ §17-9・2026-08-27 実測）。 */
export const EKICHIKA_LOGIN_URL = 'https://ranking-deli.jp/admin/login';
/** 出勤管理。★ 末尾の番号なしが一覧、番号つきが更新用の action（§17-2） */
export const EKICHIKA_WORK_URL = 'https://ranking-deli.jp/admin/girlswork/';
export const EKICHIKA_ORIGIN = 'https://ranking-deli.jp';

/** relay-selftest と同じものを使う。★ 片方だけ変えない。 */
export const RELAY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** フロー文脈の版。★ 形を変えるときは上げる。走っている途中のジョブは版違いで止まる（黙って壊れない）。 */
export const RELAY_FLOW_VERSION = 1;

/**
 * このフローが何をしに来たか。
 * ★ 増やすときは advanceFlow の switch がコンパイルエラーになる（末尾の never で見張っている）。
 */
export type RelayFlowIntent = 'connect_test';

/**
 * 段と段のあいだで持ち回す状態。
 * ★★ cookie は【秘密】。この型のまま平文でDBに置かないこと（context_enc に暗号化して入れる）。
 */
export type RelayFlowContext = {
  v: number;
  /** 同じフローの段を束ねる。監査ログに出して、店舗の画面で1回の処理として読めるようにする */
  flowId: string;
  intent: RelayFlowIntent;
  /** ここまでに畳んだ Cookie（name=value; name=value）。★ 秘密 */
  cookie: string;
  /** ISO文字列。フローが長引いたときに気づくため */
  startedAt: string;
};

export type FlowAudit = {
  event: MediaAuditEvent;
  outcome: MediaAuditOutcome;
  /** 省略すると defaultAuditSummary が店舗向けの1行を組み立てる */
  summary?: string;
  detail?: AuditDetail;
};

export type FlowNextRequest = {
  purpose: 'read_work' | 'write_work' | 'verify_work';
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body: string;
  context: RelayFlowContext;
};

export type FlowOutcome =
  | { kind: 'next'; next: FlowNextRequest; audits: FlowAudit[]; note: string }
  | { kind: 'done'; audits: FlowAudit[]; note: string }
  | { kind: 'stop'; audits: FlowAudit[]; note: string };

// ────────────────────────── フローの入口（login を組み立てる） ──────────────────────────

export function newFlowContext(input: {
  flowId: string;
  intent: RelayFlowIntent;
  startedAt: string;
}): RelayFlowContext {
  return {
    v: RELAY_FLOW_VERSION,
    flowId: input.flowId,
    intent: input.intent,
    cookie: '',
    startedAt: input.startedAt,
  };
}

/**
 * ログインの POST を組み立てる。
 * ★★ 預かるのは3点（shopid / email / password）。2点だと思って作ると1つ落ちる（設計メモ §17-9）。
 * ★ submit の値は実機で未確認。空で通らなかったら、まずここを疑うこと。
 */
export function buildLoginRequest(cred: {
  shopId: string;
  loginId: string;
  password: string;
}): { method: 'POST'; url: string; headers: Record<string, string>; body: string } {
  if (!cred.shopId || !cred.loginId || !cred.password) {
    throw new Error('ログインに要る3点（shopid / email / password）のどれかが空');
  }
  const body = encodePayload([
    ['email', cred.loginId],
    ['password', cred.password],
    ['shopid', cred.shopId],
    ['submit', ''],
  ]);
  return {
    method: 'POST',
    url: EKICHIKA_LOGIN_URL,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      referer: EKICHIKA_LOGIN_URL,
      origin: EKICHIKA_ORIGIN,
    },
    body,
  };
}

/** 出勤ページを読む GET。★ 読むだけ。ここまでは何も書き換えない。 */
export function buildReadWorkRequest(cookie: string): FlowNextRequest['headers'] {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    referer: EKICHIKA_LOGIN_URL,
    cookie,
  };
}

// ────────────────────────── ログイン画面かどうか ──────────────────────────

/**
 * 返ってきたHTMLが【ログイン画面】か。
 * ★ shopid はログイン画面にしか無い（出勤ページには無い）。password と2つ揃ったときだけ真。
 *   片方だけで判定すると、将来どこかの画面に password 欄が増えたときに誤判定する。
 */
export function looksLikeEkichikaLoginPage(html: string): boolean {
  const h = String(html ?? '');
  return /name=["']?password["']?/i.test(h) && /name=["']?shopid["']?/i.test(h);
}

// ────────────────────────── 状態遷移 ──────────────────────────

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

/**
 * ★★★ 状態遷移の本体。
 * 「いま閉じたジョブの purpose と応答」から「次に積むもの・監査に残すもの」を決める。
 * ★ ここは純粋関数。DBもネットワークも触らない＝テストで固定できる。
 */
export function advanceFlow(input: {
  purpose: string;
  status: number;
  headers: Record<string, string | string[]>;
  /** 展開済みの本文。login では使わないので空でよい（2.3MBを無駄に展開しないため） */
  body: string;
  context: RelayFlowContext;
}): FlowOutcome {
  const ctx = input.context;

  if (ctx.v !== RELAY_FLOW_VERSION) {
    // ★ 版が違う＝こちらが知らない形。黙って進めない
    return stop([], 'フロー文脈の版が違うので進めない（' + ctx.v + ' / いまは ' + RELAY_FLOW_VERSION + '）');
  }

  switch (input.purpose) {
    case 'login':
      return afterLogin(input, ctx);
    case 'read_work':
      return afterReadWork(input, ctx);
    case 'write_work':
    case 'verify_work':
      // ★ 第41便では積まないので、ここへは来ない。来たら黙って進めない
      return stop([], 'この便では書き込みの段を扱わない（第42便）: ' + input.purpose);
    default:
      return stop([], '知らない段: ' + String(input.purpose));
  }
}

/**
 * ログインの応答。
 * ★★ ここでは【監査ログを書かない】。まだ成否が分からないから（このファイル冒頭）。
 *   分からないことを書かない、が第39便からの一貫した作法。
 */
function afterLogin(
  input: { status: number; headers: Record<string, string | string[]> },
  ctx: RelayFlowContext,
): FlowOutcome {
  if (input.status >= 400) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId: ctx.flowId },
        },
      ],
      'ログインの応答が ' + input.status + ' だった',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  if (!cookie) {
    // ★ これは解釈の余地なく失敗と言える。セッションが無ければ次の GET は必ずログイン画面になる
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary: '駅ちかにログインできませんでした（セッションが発行されませんでした）',
          detail: { httpStatus: input.status, reason: 'no_cookie', flowId: ctx.flowId },
        },
      ],
      'ログインの応答にセッションCookieが無かった',
    );
  }

  return {
    kind: 'next',
    next: {
      purpose: 'read_work',
      method: 'GET',
      url: EKICHIKA_WORK_URL,
      headers: buildReadWorkRequest(cookie),
      body: '',
      context: { ...ctx, cookie },
    },
    audits: [],
    note: 'ログインの応答を受け取った。★ 成否は出勤ページが読めるかどうかで判定する',
  };
}

/**
 * 出勤ページの応答。★ ここが【ログインの成否そのもの】。
 */
function afterReadWork(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [
          {
            event: 'login',
            outcome: 'failed',
            summary:
              '駅ちかにログインできませんでした（ログイン画面へ戻されました）。' +
              '店舗ID・ログインID・パスワードをご確認ください',
            detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
          },
        ],
        'ログイン後の出勤ページがログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [
        {
          event: 'read_work',
          outcome: 'failed',
          summary: '駅ちかの出勤ページを開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', flowId },
        },
      ],
      '出勤ページが想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_work',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      '出勤ページの応答が ' + input.status + ' だった',
    );
  }

  if (looksLikeEkichikaLoginPage(input.body)) {
    // ★ 302 ではなく 200 でログイン画面を返す作りだった場合。こちらでも同じ結論になる
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            '店舗ID・ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', flowId },
        },
      ],
      'ログイン後の出勤ページとしてログイン画面が返った＝ログインできていない',
    );
  }

  let page;
  try {
    page = parseWorkPage(input.body);
  } catch (e) {
    return stop(
      [
        {
          event: 'read_work',
          outcome: 'failed',
          summary: '駅ちかの出勤ページを読み取れませんでした（画面の作りが変わった可能性があります）',
          detail: { reason: 'parse_error', bytes: input.body.length, flowId },
        },
      ],
      '出勤ページを解釈できなかった: ' + (e as Error).message.slice(0, 200),
    );
  }

  const problems = checkWorkPage(page);
  if (problems.length > 0) {
    // ★ problems の文面には駅ちかのURLが混ざる。監査の detail には件数だけ入れる
    //   （valueLooksSecret がURLを落とすので、入れても落ちる。落ちるものを入れない）
    return stop(
      [
        {
          event: 'read_work',
          outcome: 'failed',
          summary: '駅ちかの出勤ページを読み取れませんでした（画面の作りが変わった可能性があります）',
          detail: { reason: 'page_broken', problems: problems.length, flowId },
        },
      ],
      '出勤ページが壊れて見える: ' + problems.join(' / ').slice(0, 300),
    );
  }

  // ★★ ここまで来て初めて「ログインできた」と言える
  const audits: FlowAudit[] = [
    {
      event: 'login',
      outcome: 'ok',
      detail: { flowId },
    },
    {
      event: 'read_work',
      outcome: 'ok',
      // ★ people は defaultAuditSummary が「（在籍N人）」に使う
      detail: { people: page.girls.length, days: page.dateLabels.length, flowId },
    },
  ];

  switch (ctx.intent) {
    case 'connect_test':
      return {
        kind: 'done',
        audits,
        note: '接続テストに成功した（ログイン＋出勤ページの読み取りまで。書き換えはしていない）',
      };
    default: {
      // ★★ intent を増やしたらここがコンパイルエラーになる。
      //   「足したのに繋いでいない」を静かに通さないための見張り（第40便 §4 と同じ形）
      const never: never = ctx.intent;
      return stop(audits, '扱い方の決まっていない intent: ' + String(never));
    }
  }
}
