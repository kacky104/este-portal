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

import {
  parseWorkPage,
  checkWorkPage,
  encodePayload,
  buildPayload,
  assertWithinInputVars,
  decodeGirlWork,
  verifyAfterWrite,
  type GirlWork,
  type WorkPage,
} from './ekichikaWorkParse';
import { parseEkichikaGirls, girlsPageUsable, type EkichikaGirlsPage } from './ekichikaGirlsParse';
import { parseEkichikaMailList, mailListUsable, type EkichikaMailListPage } from './ekichikaMailListParse';
// ★ 写メ日記（第94便）。★ 駅ちかの既存の段には一切触れず、段名を分けて足す
import {
  parseEkichikaDiaryList,
  parseEkichikaDiaryDetail,
  diaryListUsable,
  diaryDetailUsable,
  type EkichikaDiaryListPage,
  type EkichikaDiaryDetail,
} from './ekichikaDiaryParse';
import { mergeCookies } from './relayJob';
import { RELAY_USER_AGENT } from './relayUserAgent';
// ★ エステラブ（第78便）。★ 駅ちかの段には一切触れず、別の段名で足す
import { buildEsuloveTherapistListRequest, judgeEsuloveLogin, ESULOVE_THERAPIST_URL } from './esuloveRequests';
import { parseEsuloveTherapists, duplicateNames, type EsuloveTherapistRow } from './esuloveTherapistParse';
import type { AuditDetail, MediaAuditEvent, MediaAuditOutcome } from './mediaAudit';

/** 駅ちかのログインフォーム（設計メモ §17-9・2026-08-27 実測）。 */
export const EKICHIKA_LOGIN_URL = 'https://ranking-deli.jp/admin/login';
/** 出勤管理。★ 末尾の番号なしが一覧、番号つきが更新用の action（§17-2） */
export const EKICHIKA_WORK_URL = 'https://ranking-deli.jp/admin/girlswork/';
/** 女の子一覧（管理画面）。★ 読むだけ。ここから castId と名前が取れる（第50便） */
export const EKICHIKA_GIRLS_URL = 'https://ranking-deli.jp/admin/girls/';
/** 投稿用メールアドレス一覧（管理画面）。★ 読むだけ。写メ日記の転送先がここに載る（第53便） */
export const EKICHIKA_MAILLIST_URL = 'https://ranking-deli.jp/admin/maillist/';

/**
 * 写メ日記の一覧（第94便・2026-09-01 実測）。
 * ★ ページ送りは `/admin/maildiary/2`、`/3` …（★ 末尾のスラッシュは付かない形で出ている）
 */
export const EKICHIKA_DIARY_LIST_URL = 'https://ranking-deli.jp/admin/maildiary/';

/** 一覧のNページ目。★ 1ページ目は番号を付けない（別のURLにしない）。 */
export function ekichikaDiaryListUrl(pageNumber: number): string {
  const n = Math.floor(Number(pageNumber));
  if (!Number.isFinite(n) || n <= 1) return EKICHIKA_DIARY_LIST_URL;
  return EKICHIKA_DIARY_LIST_URL + String(n);
}

/**
 * 写メ日記1件の編集ページ。★ **読むだけ**。ここへ POST は投げない。
 * ★ 日記IDは相手から受け取った値。★ 数字以外が来たら組み立てない（URLを作らせない）。
 */
export function ekichikaDiaryDetailUrl(diaryId: string): string {
  const id = String(diaryId ?? '');
  if (!/^\d+$/.test(id)) throw new Error('日記IDが数字ではない: ' + id);
  return EKICHIKA_DIARY_LIST_URL + 'edit/' + id + '/';
}
export const EKICHIKA_ORIGIN = 'https://ranking-deli.jp';

/**
 * relay-selftest と同じものを使う。★ 片方だけ変えない。
 * ★ 実体は relayUserAgent.ts（第78便）。★ ここからも今までどおり import できるよう再エクスポートする。
 *   ★ 移した理由: esuloveRequests.ts がこれを使うので、ここに置くと循環参照になる。
 */
export { RELAY_USER_AGENT } from './relayUserAgent';

/** フロー文脈の版。★ 形を変えるときは上げる。走っている途中のジョブは版違いで止まる（黙って壊れない）。 */
// ★ 第46便で文脈の形が変わった（承認の指紋・送った内容を持ち回すため）ので 1 → 2。
//   走っている途中のジョブは版違いで止まる。**黙って古い形のまま進めない。**
export const RELAY_FLOW_VERSION = 2;

/**
 * このフローが何をしに来たか。
 * ★ 増やすときは advanceFlow の switch がコンパイルエラーになる（末尾の never で見張っている）。
 */
export type RelayFlowIntent =
  /** ログイン＋出勤の読み取りまで。★ 駅ちかを書き換えない */
  | 'connect_test'
  /**
   * ★★★ 試し打ち（第43便）。読んだうえで「送るとこうなる」を組み立てて終わる。
   *   ★ **送らない。** 設計メモ §11-3「切り替え直後の1回目は必ず試し打ち → 人が承認」。
   */
  | 'work_dryrun'
  /**
   * ★★★ 承認された内容を実際に書く（第46便）。**駅ちかを書き換える唯一の intent。**
   *   login → read_work →（読み直して計画）→ write_work → verify_work
   *   ★ 承認の時点と送る時点で内容が変わっていたら **送らない**（指紋を突き合わせる）。
   */
  | 'work_push'
  /**
   * ★★★ 自動反映（第48便・設計メモ 追記14）。**人が見ずに書く。**
   *   login → read_work →（読み直して計画）→ write_work → verify_work
   *   ★ 指紋は使わない。人が見た内容が存在しないので、照合しても何も検証していない（§53）。
   *   ★★ 代わりに blockers を厳しくする（workPlan の unattended: true / §56）。
   *   ★ 立てられるのは link_mode='write_auto' の枠だけ。それには
   *     【いまの向きになってから1回でも反映が成功していること】が要る（§54）。
   */
  | 'work_auto'
  /**
   * ★★★ 媒体側の名簿を読むだけ（第50便・設計メモ 追記18 §81の1）。
   *   login → read_girls → 終わり。★ **駅ちかへ何も書かない。**
   *   ★ connect_test と同じ「読むだけ」の仲間だが、読む先が違う（出勤ページではなく女の子一覧）。
   *   ★ 向きが write の枠でも使える。取り込みの周とは別に、明示的に1回読むものだから。
   */
  | 'roster_read'
  /**
   * ★★ 投稿用メールアドレスの取り込み（第53便・設計メモ 追記26 §123）。
   *   login → read_maillist → 終わり。★ **駅ちかへは何も書かない。**
   *   ★ 2つに分かれているのは第43便の作法（試し打ち → 本番）:
   *     mail_dryrun … 何件入れるつもりかを数えるだけ。フクエスのDBも書き換えない
   *     mail_apply  … 実際に therapist_diary_forward を更新する
   *   ★ 駅ちかへの通信はどちらも同じ（読むだけ）。違うのはフクエス側を書くかどうか。
   */
  | 'mail_dryrun'
  | 'mail_apply'
  /**
   * ★★★ 写メ日記の取り込み（第94便・設計メモ_写メ日記の取り込みの口）。
   *   login → read_diary_list →（DBを見て開くものを決める）→ read_diary_detail ×N → 終わり。
   *   ★★ **駅ちかへは何も書かない。** 読むだけ。
   *   ★ 新しい口（/api/import/diary）を作らずここに寄せた理由:
   *     管理画面に入る道は中継フローだけ。★ 口を分けると **ログインの段が2系統になる**。
   *     ★ 片方だけ直す日が必ず来る。
   */
  | 'diary_read';

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

  // ── ここから下は intent='work_push' のときだけ入る（第46便）──
  /**
   * ★★★ 人が画面で見て承認した計画の指紋（workPlan.planFingerprint）。
   *   送る直前に読み直して作った計画の指紋と比べ、**違ったら送らない。**
   *   ★ 指紋だけを持つので文脈が太らない。
   */
  approvedFingerprint?: string;
  /** ★ 送った内容（encodeGirlWork の詰めた文字列）。verify_work で照合するのに要る */
  sentPacked?: string;
  /** 送った人数。★ 切り捨て（max_input_vars）の主症状はここに出る */
  sentCount?: number;
  /** 送信前の日付見出し。送信の前後で日がずれていないかを見る */
  expectedDateLabels?: string[];
  /** 変更した件数（監査ログの文面に使う） */
  changeCount?: number;

  // ── ここから下は intent='diary_read' のときだけ入る（第94便）──
  /** いま読みに行っている一覧のページ番号（1始まり）。★ ページ送りで遡るときに使う */
  diaryPage?: number;
  /**
   * ★★★ いま開きに行っている日記ID。
   *   ★ 応答を読むときに **パーサへ渡して突き合わせる**。★ 別の日記が返っていたら止めるため。
   */
  diaryId?: string;
};

export type FlowAudit = {
  event: MediaAuditEvent;
  outcome: MediaAuditOutcome;
  /** 省略すると defaultAuditSummary が店舗向けの1行を組み立てる */
  summary?: string;
  detail?: AuditDetail;
};

export type FlowNextRequest = {
  purpose:
    | 'read_work' | 'write_work' | 'verify_work' | 'read_girls' | 'read_maillist'
    // ★ 写メ日記の段（第94便）。★ 読むだけ
    | 'read_diary_list' | 'read_diary_detail'
    // ★ エステラブの段（第78便）。★ 名前を分けることで、駅ちかの段の判定に一切触れない
    | 'esulove_therapists';
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body: string;
  context: RelayFlowContext;
};

export type FlowOutcome =
  | { kind: 'next'; next: FlowNextRequest; audits: FlowAudit[]; note: string }
  | { kind: 'done'; audits: FlowAudit[]; note: string }
  | { kind: 'stop'; audits: FlowAudit[]; note: string }
  /**
   * ★★★ 読めた。ここから先は【DBを読まないと決められない】（第43便）。
   *   フクエスの出勤は DB にあり、このファイルは DB を触らない約束なので、
   *   ページを持ったまま呼び出し側へ返す。★ 判断そのものは workPlan.ts（これも純粋関数）が持つ。
   *   ★ ここで「次のジョブ」を返さないのが大事: **返さない＝駅ちかへ何も飛ばない。**
   */
  | { kind: 'plan_work'; page: WorkPage; audits: FlowAudit[]; note: string }
  /**
   * ★ 媒体側の名簿を読めた（第50便）。plan_work と同じ理由でここでは保存しない
   *   （このファイルは DB を触らない約束）。呼び出し側が写しを1件だけ上書きで残す。
   *   ★ ここで「次のジョブ」を返さない＝**駅ちかへ何も飛ばない。**
   */
  | { kind: 'roster'; page: EkichikaGirlsPage; audits: FlowAudit[]; note: string }
  /**
   * ★ 投稿用メールアドレス一覧を読めた（第53便）。roster と同じ理由でここでは保存しない。
   *   ★★ page.rows には【秘密値（アドレス）】が入っている。
   *     ★ 監査ログにも note にも値を出さないこと。件数とドメインだけ。
   */
  | { kind: 'maillist'; page: EkichikaMailListPage; audits: FlowAudit[]; note: string }
  /**
   * ★ 写メ日記の一覧を読めた（第94便）。maillist と同じ理由でここでは保存しない。
   *   ★★★ ここで「次のジョブ」を返さないのが大事。
   *     どの日記を開くかは **salon_diary_imports を読まないと決められない**（§369・§375）。
   *     ★ 判断そのものは ekichikaDiaryParse.selectDiariesToFetch が持っている（純粋関数）。
   */
  | {
      kind: 'diary_list';
      page: EkichikaDiaryListPage;
      /** 何ページ目を読んだか（1始まり）。★ 遡るときに呼び出し側が使う */
      pageNumber: number;
      audits: FlowAudit[];
      note: string;
    }
  /**
   * ★ 写メ日記を1件開いた（第94便）。
   *
   * ★★★ **読めなかったときも、この kind で返す（stop にしない）。**
   *   ★ 1件おかしいだけで、その店の取り込みが永久に止まるのを避けるため。
   *     ★ stop にすると、次の周も同じ日記で止まり、以降ずっと1件も入らなくなる。
   *   ★ 呼び出し側は **必ず diaryDetailUsable(detail) を見ること**。
   *     読めなかったものは `skipped:unreadable` として記録し、§375 のとおり1日1回だけ開き直す。
   *   ★ ログインが切れた・ページの形が変わった等、**全件に効く**failure は stop で返す。
   */
  | {
      kind: 'diary_detail';
      detail: EkichikaDiaryDetail;
      /** 開きに行った日記ID。★ 記録を書く相手を取り違えないため、返り値にも入れる */
      diaryId: string;
      audits: FlowAudit[];
      note: string;
    }
  /**
   * ★ エステラブの名簿を読めた（第78便）。roster と同じ理由でここでは保存しない。
   *   ★ ここで「次のジョブ」を返さない＝**エステラブへ何も飛ばない。**
   *   ★ warnings は必ず呼び出し側が人に見せること（黙って捨てない）。
   */
  | { kind: 'esulove_roster'; rows: EsuloveTherapistRow[]; warnings: string[]; audits: FlowAudit[]; note: string };

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
 * ★★★ 送信ボタンの value（2026-08-28 実機確認）。
 *   空で送ると「ボタンを押していない」扱いになり、ログイン画面がそのまま返る。
 *   ★ 実際にそれで3回失敗した。**空に戻さないこと。**
 */
export const EKICHIKA_LOGIN_SUBMIT_VALUE = 'ログイン';

/**
 * ログインの POST を組み立てる。
 *
 * ★★★ 2026-08-28 の訂正 — 送るのは【2点】。設計メモ §17-9 の「3点」は誤りだった。
 *   実機のログイン画面を読んだ結果:
 *     <form> の中にあるのは email / password / submit の3つだけ。
 *     ★ `shopid` は hidden で存在するが **<form> の外（body直下）** にあり、
 *       ブラウザは送っていない（値も空）。
 *   ★ 誤りの原因: HTML を検索して `name="shopid"` を見つけただけで
 *     「フォームの項目」と判断した。**送られるかどうかは form の中にあるかで決まる。**
 *   → こちらが余計に shopid を送っていた。ブラウザと同じものだけ送る。
 *
 * ★ shopId は引数に残してあるが**送らない**（DBには保管し続ける。画面に出して
 *   「どのアカウントを登録したか」を店舗が確かめるために使う）。
 */
export function buildLoginRequest(cred: {
  shopId?: string;
  loginId: string;
  password: string;
}): { method: 'POST'; url: string; headers: Record<string, string>; body: string } {
  if (!cred.loginId || !cred.password) {
    throw new Error('ログインに要る2点（ログインID / パスワード）のどちらかが空');
  }
  // ★ 並びもブラウザと同じにする（email → password → submit）
  const body = encodePayload([
    ['email', cred.loginId],
    ['password', cred.password],
    ['submit', EKICHIKA_LOGIN_SUBMIT_VALUE],
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

/**
 * ★★★ 出勤の書き込み（第46便）。**このプロジェクトで唯一、相手を書き換えるリクエスト。**
 *
 * ★ 宛先は【読んだページの form action】をそのまま使う（.../girlswork/<番号>/）。
 *   こちらで組み立てない。番号なしの検索フォームへ投げると静かに何も起きない（§17-2）。
 *   ★ parseWorkPage / checkWorkPage が action の形を検査済み。
 *
 * ★★ assertWithinInputVars をここでも通す。計画の時点でも数えているが、
 *   **送る直前にもう一度数える。** 超えた分は相手に黙って捨てられ、全件上書きなので出勤が消える。
 */
export function buildWriteWorkRequest(
  page: WorkPage,
  sent: GirlWork[],
  cookie: string,
): { url: string; method: 'POST'; headers: Record<string, string>; body: string } {
  const fields = buildPayload(page, sent);
  assertWithinInputVars(fields);
  return {
    url: page.action,
    method: 'POST',
    headers: {
      'user-agent': RELAY_USER_AGENT,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      origin: EKICHIKA_ORIGIN,
      referer: EKICHIKA_WORK_URL,
      cookie,
    },
    body: encodePayload(fields),
  };
}

// ────────────────────────── ログイン画面かどうか ──────────────────────────

/**
 * 返ってきたHTMLが【ログイン画面】か。
 *
 * ★★★ 2026-08-28 の訂正 — 最初の実装は【誤検知していた】。
 *   （誤）`name="password"` と `name="shopid"` が両方あればログイン画面
 *   → **ログイン済みの出勤ページも両方を満たす**:
 *       ・`shopid` は <form> の外にあるページ共通のテンプレート ＝ 全ページに入っている
 *       ・`name="password"` は管理画面に埋め込まれた求人サイトの自動ログインフォーム（設計メモ §17-6）
 *   → 実際に「ログインは302で成功しているのに、ログイン失敗と記録する」事故になった。
 *
 * ★★★ 教訓（同じ日に2回踏んだ）: **HTMLに文字列が在るかどうかで構造を判断しない。**
 *   朝の `shopid`（<form> の外にあるのに「フォームの項目」と判断した）とまったく同じ形。
 *
 * → いまは【駅ちかのログインへ POST する form があるか】で見る。
 *   ★ 他社ドメイン（cocoa-job など）へ POST する埋め込みフォームは拾わない。
 * ★ そもそもこの判定は**保険**になった。成否はまず「出勤ページとして読めたか」で決める（afterReadWork）。
 */
export function looksLikeEkichikaLoginPage(html: string): boolean {
  const h = String(html ?? '');
  // <form ... action="(https://ranking-deli.jp)?/admin/login" ...>
  const form = /<form[^>]+action=["']?(?:https?:\/\/ranking-deli\.jp)?\/admin\/login\/?["'\s>]/i;
  if (form.test(h)) return true;
  // 念のため題名でも見る（駅ちかランキング|ログイン）
  return /<title>[^<]*\|\s*ログイン\s*<\/title>/i.test(h);
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
    case 'read_girls':
      return afterReadGirls(input, ctx);
    case 'read_maillist':
      return afterReadMailList(input, ctx);
    // ── 写メ日記（第94便）★ 段名で分けている。既存の case には触れていない ──
    case 'read_diary_list':
      return afterReadDiaryList(input, ctx);
    case 'read_diary_detail':
      return afterReadDiaryDetail(input, ctx);
    case 'write_work':
      return afterWriteWork(input, ctx);
    case 'verify_work':
      return afterVerifyWork(input, ctx);
    // ── エステラブ（第78便）★ 段名で分けている。駅ちかの case には触っていない ──
    case 'esulove_login':
      return afterEsuloveLogin(input, ctx);
    case 'esulove_therapists':
      return afterEsuloveTherapists(input, ctx);
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

  // ★★ 何を読みに行くかは intent で決まる（第50便）。
  //   ★ 「ログインの成否は、次に読むページが読めたかで判定する」という作法は変えない。
  //     出勤の用事なら出勤ページ、名簿の用事なら女の子一覧。どちらも「読めた＝ログインできた」。
  if (ctx.intent === 'mail_dryrun' || ctx.intent === 'mail_apply') {
    return {
      kind: 'next',
      next: {
        purpose: 'read_maillist',
        method: 'GET',
        url: EKICHIKA_MAILLIST_URL,
        headers: buildReadWorkRequest(cookie),
        body: '',
        context: { ...ctx, cookie },
      },
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否はメールアドレス一覧が読めるかどうかで判定する',
    };
  }

  if (ctx.intent === 'diary_read') {
    return {
      kind: 'next',
      next: buildReadDiaryListRequest({ ...ctx, cookie }, 1),
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否は写メ日記の一覧が読めるかどうかで判定する',
    };
  }

  if (ctx.intent === 'roster_read') {
    return {
      kind: 'next',
      next: {
        purpose: 'read_girls',
        method: 'GET',
        url: EKICHIKA_GIRLS_URL,
        // ★ ヘッダは出勤ページを読むときと同じでよい（GET・Cookie・Referer だけ）
        headers: buildReadWorkRequest(cookie),
        body: '',
        context: { ...ctx, cookie },
      },
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否は女の子一覧が読めるかどうかで判定する',
    };
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
 * 女の子一覧の応答（第50便）。★ afterReadWork とまったく同じ順序の作法で判定する。
 *
 * ★★★ 順序が大事。**まず「一覧として読めるか」を試す。**
 *   読めた ＝ ログインできている。ログイン画面らしさの判定（誤検知しうるもの）を先に置かない。
 *   ★ 2026-08-28 に踏んだ形（302で成功しているのに失敗と記録した）を繰り返さない。
 */
function afterReadGirls(
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
        'ログイン後の女の子一覧がログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [
        {
          event: 'read_girls',
          outcome: 'failed',
          summary: '駅ちかの女の子一覧を開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', flowId },
        },
      ],
      '女の子一覧が想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_girls',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      '女の子一覧の応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaGirls(input.body);

  if (girlsPageUsable(page)) {
    // ★★ ここまで来て初めて「ログインできた」と言える
    return {
      kind: 'roster',
      page,
      audits: [
        { event: 'login', outcome: 'ok', detail: { flowId } },
        {
          event: 'read_girls',
          outcome: 'ok',
          // ★ people は defaultAuditSummary が「（在籍N人）」に使う
          detail: { people: page.rows.length, flowId },
        },
      ],
      note: '女の子一覧を読めた（' + page.rows.length + '名）。★ 駅ちかへは何も書いていない',
    };
  }

  // ★ 読めなかった。ここで初めて「ログイン画面が返ったのか」を疑う
  if (looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId },
        },
      ],
      'ログイン後の女の子一覧としてログイン画面が返った＝ログインできていない',
    );
  }

  // ★ ログイン画面でもない＝読めたはずのページが読めていない。画面の作りが変わった疑い
  //   ★★ problems の本文には名前が混ざりうる。detail には件数だけ入れる（第44便の作法）
  return stop(
    [
      {
        event: 'read_girls',
        outcome: 'failed',
        summary: '駅ちかの女の子一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: page.rows.length === 0 ? 'parse_error' : 'page_broken',
          problems: page.problems.length,
          people: page.rows.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    '女の子一覧が読めない: ' + page.problems.join(' / ').slice(0, 300),
  );
}

/**
 * メールアドレス一覧の応答（第53便）。★ afterReadGirls と同じ順序の作法。
 *
 * ★★★ page.rows には【秘密値（投稿用アドレス）】が入る。
 *   ★ 監査ログにも note にも【値を出さない】。件数だけ。
 *   ★ 失敗の理由（problems）にもアドレスは混ざらない作りにしてある（パーサ側で castId しか出さない）。
 */
function afterReadMailList(
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
        'ログイン後のメールアドレス一覧がログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [
        {
          event: 'read_maillist',
          outcome: 'failed',
          summary: '駅ちかのメールアドレス一覧を開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', flowId },
        },
      ],
      'メールアドレス一覧が想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_maillist',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      'メールアドレス一覧の応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaMailList(input.body);

  if (mailListUsable(page)) {
    return {
      kind: 'maillist',
      page,
      audits: [
        { event: 'login', outcome: 'ok', detail: { flowId } },
        {
          event: 'read_maillist',
          outcome: 'ok',
          // ★ 件数だけ。★ アドレスも名前も入れない
          // ★★ applied を入れない。入れないことが「読み取りの段」の目印になっている
          //   （mediaAudit.defaultAuditSummary が applied の有無で文言を分けている）
          detail: { people: page.rows.length, flowId },
        },
      ],
      note: 'メールアドレス一覧を読めた（' + page.rows.length + '名）。★ 駅ちかへは何も書いていない',
    };
  }

  if (looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId },
        },
      ],
      'ログイン後のメールアドレス一覧としてログイン画面が返った＝ログインできていない',
    );
  }

  return stop(
    [
      {
        event: 'read_maillist',
        outcome: 'failed',
        summary:
          '駅ちかのメールアドレス一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: page.rows.length === 0 ? 'parse_error' : 'page_broken',
          problems: page.problems.length,
          people: page.rows.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    'メールアドレス一覧が読めない: ' + page.problems.join(' / ').slice(0, 300),
  );
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

  // ★★★ 順序が大事。**まず「出勤ページとして読めるか」を試す。**
  //   読めた ＝ ログインできている。これがいちばん確かな証拠で、
  //   ログイン画面らしさの判定（誤検知しうるもの）を先に置いてはいけない。
  //   ★ 2026-08-28: 先に置いていたせいで「302で成功しているのに失敗と記録」した。
  let page: ReturnType<typeof parseWorkPage> | null = null;
  let parseError = '';
  try {
    page = parseWorkPage(input.body);
  } catch (e) {
    parseError = (e as Error).message.slice(0, 200);
  }

  const problems = page ? checkWorkPage(page) : ['読み取れなかった: ' + parseError];

  if (page && problems.length === 0) {
    // ★★ ここまで来て初めて「ログインできた」と言える
    const audits: FlowAudit[] = [
      { event: 'login', outcome: 'ok', detail: { flowId } },
      {
        event: 'read_work',
        outcome: 'ok',
        // ★ people は defaultAuditSummary が「（在籍N人）」に使う
        detail: { people: page.girls.length, days: page.dateLabels.length, flowId },
      },
    ];
    return finishRead(audits, ctx, page);
  }

  // ★ 読めなかった。ここで初めて「ログイン画面が返ったのか」を疑う
  if (looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId },
        },
      ],
      'ログイン後の出勤ページとしてログイン画面が返った＝ログインできていない',
    );
  }

  // ★ ログイン画面でもない＝読めたはずのページが読めていない。画面の作りが変わった疑い
  return stop(
    [
      {
        event: 'read_work',
        outcome: 'failed',
        summary: '駅ちかの出勤ページを読み取れませんでした（画面の作りが変わった可能性があります）',
        // ★ problems の文面には駅ちかのURLが混ざる。detail には件数だけ入れる
        detail: {
          reason: page ? 'page_broken' : 'parse_error',
          problems: problems.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    '出勤ページが読めない: ' + problems.join(' / ').slice(0, 300),
  );
}

/** 読み取りまで成功したあと、intent ごとに次を決める。 */
function finishRead(audits: FlowAudit[], ctx: RelayFlowContext, page: WorkPage): FlowOutcome {

  switch (ctx.intent) {
    case 'connect_test':
      return {
        kind: 'done',
        audits,
        note: '接続テストに成功した（ログイン＋出勤ページの読み取りまで。書き換えはしていない）',
      };
    case 'work_dryrun':
      return {
        kind: 'plan_work',
        page,
        audits,
        note: '出勤ページを読めた。★ ここでフクエスの出勤と突き合わせる（送らない）',
      };
    case 'work_push':
      // ★ 送る側も、まず同じ形で計画を立て直す。**承認の時点ではなく、いま読んだページで組む。**
      //   指紋が承認時と違えば呼び出し側が止める（設計メモ §11-3）。
      return {
        kind: 'plan_work',
        page,
        audits,
        note: '出勤ページを読めた。★ 承認された内容と一致するか確かめてから送る',
      };
    case 'mail_dryrun':
    case 'mail_apply':
      // ★ ここへは来ない（メールの用事は出勤ページを読みに行かない）。★ 網羅は外さない
      return stop(audits, 'メールアドレスの取り込みは出勤ページを使わない（ここへは来ないはず）');
    case 'roster_read':
      // ★★ ここへは来ない（roster_read は出勤ページを読みに行かない）。
      //   ★ だが switch は網羅させる。網羅を外すと「足したのに繋いでいない」が静かに通る。
      return stop(audits, '名簿の読み取りは出勤ページを使わない（ここへは来ないはず）');
    case 'diary_read':
      // ★ ここへは来ない（写メ日記は出勤ページを読みに行かない）。★ 網羅は外さない
      //   ★★ この見張りが、いま実際に働いた: diary_read を足した時点でコンパイルが止まった（第94便）
      return stop(audits, '写メ日記の取り込みは出勤ページを使わない（ここへは来ないはず）');
    case 'work_auto':
      // ★★★ 自動反映（第48便）。組み立てから送信までを1回のフローで閉じる。
      //   ★ 指紋は突き合わせない（人が見た内容が無い・§53）。担保は厳しい方の blockers。
      return {
        kind: 'plan_work',
        page,
        audits,
        note: '出勤ページを読めた。★ 自動反映：厳しい方の見張りを通ったら送る',
      };
    default: {
      // ★★ intent を増やしたらここがコンパイルエラーになる。
      //   「足したのに繋いでいない」を静かに通さないための見張り（第40便 §4 と同じ形）
      const never: never = ctx.intent;
      return stop(audits, '扱い方の決まっていない intent: ' + String(never));
    }
  }
}

// ────────────────────────── 書き込みの応答 ──────────────────────────

/**
 * 出勤を書いたあとの応答（第46便）。
 *
 * ★★★ ここでは【成否を判定しない】。ログインのときとまったく同じ理由（このファイル冒頭）。
 *   駅ちかが更新に成功したとき何を返すか（302か200か・本文に何が出るか）は**未確認**。
 *   推測で「成功」と書くと、書けていないのに「更新しました」という監査ログが残る。
 *   → ★ **読み直して突き合わせた結果を、書き込みの成否そのものとする。**
 *
 * ★★ 失敗しても投げ直さない。全件上書きのフォームを再送するのは危険度が高い。
 *   人が画面を見て、もう一度承認するところからやり直す。
 */
function afterWriteWork(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 400) {
    return stop(
      [
        {
          event: 'write_work',
          outcome: 'failed',
          summary:
            '駅ちかの出勤を更新できませんでした（応答 ' + input.status + '）。' +
            '更新されたかどうかは確認が必要です',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      '書き込みの応答が ' + input.status + ' だった',
    );
  }

  // ★ ログイン画面へ戻された＝セッションが切れた。書けていない可能性が高いが、
  //   ★★ 「書けていない」と言い切らない。読み直して確かめる術がこの段では無い。
  const location = String(input.headers['location'] ?? '');
  if (input.status >= 300 && input.status < 400 && location.includes('/admin/login')) {
    return stop(
      [
        {
          event: 'write_work',
          outcome: 'failed',
          summary:
            '駅ちかの出勤を更新中にログイン画面へ戻されました。更新されたかどうかは確認が必要です',
          detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
        },
      ],
      '書き込み中にログイン画面へ戻された',
    );
  }

  // ★ ここで「成功」と書かない。次の段（読み直し）だけが成否を知っている。
  return {
    kind: 'next',
    next: {
      purpose: 'verify_work',
      method: 'GET',
      url: EKICHIKA_WORK_URL,
      headers: buildReadWorkRequest(ctx.cookie),
      body: '',
      context: ctx,
    },
    audits: [],
    note: '書き込みの応答を受け取った。★ 成否は読み直して突き合わせてから判定する',
  };
}

/**
 * 書いたあとに読み直したページ（第46便）。★ ここが【書き込みの成否そのもの】。
 *
 * 見ているのは3系統（verifyAfterWrite）:
 *   1. 人数        … 切り捨て（max_input_vars）の主症状
 *   2. セルの中身  … 1件ずつ
 *   3. 日別出勤人数… 画面側が自分で数えた値＝こちらの計算と独立した第2の目
 */
function afterVerifyWork(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const changed = ctx.changeCount ?? 0;

  const unknown = (reason: string, note: string): FlowOutcome =>
    stop(
      [
        {
          event: 'verify_work',
          outcome: 'failed',
          // ★★ 「更新できませんでした」と書かない。**確かめられなかった**が正確
          summary:
            '★ 駅ちかの出勤を更新後に読み直せませんでした。更新されたかどうかは確認が必要です',
          detail: { reason, flowId },
        },
      ],
      note,
    );

  if (input.status !== 200) return unknown('http_error', '読み直しの応答が ' + input.status + ' だった');

  let after: WorkPage | null = null;
  try {
    after = parseWorkPage(input.body);
  } catch {
    return unknown('parse_error', '読み直したページを解析できなかった');
  }
  if (checkWorkPage(after).length > 0) return unknown('page_broken', '読み直したページが読めない形だった');

  let sent: GirlWork[];
  try {
    sent = decodeGirlWork(ctx.sentPacked ?? '');
  } catch {
    return unknown('sent_broken', '送った内容を復元できなかった');
  }
  if (sent.length === 0) return unknown('sent_missing', '送った内容が文脈に残っていない');

  const v = verifyAfterWrite(sent, after, { expectedDateLabels: ctx.expectedDateLabels });

  if (v.ok) {
    // ★★ ここで初めて「更新した」と言える。write_work の 'ok' もこの瞬間に書く。
    return {
      kind: 'done',
      audits: [
        { event: 'write_work', outcome: 'ok', detail: { changed, people: sent.length, flowId } },
        { event: 'verify_work', outcome: 'ok', detail: { people: after.girls.length, flowId } },
      ],
      note: '書き込みと照合が終わった（変更' + changed + '件・' + sent.length + '名）',
    };
  }

  // ★★★ 一致しなかった。**ここは黙ってはいけない場所。**
  //   「送ったつもり」を作らないために、店舗に見える文言も強くしてある（mediaAudit）。
  return stop(
    [
      { event: 'write_work', outcome: 'ok', detail: { changed, people: sent.length, flowId } },
      {
        event: 'verify_work',
        outcome: 'failed',
        detail: { problems: v.problems.length, people: after.girls.length, flowId },
      },
    ],
    '書き込み後の照合が一致しない: ' + v.problems.map((p) => p.kind + ' ' + p.detail).join(' / ').slice(0, 300),
  );
}

// ══════════════════════════════════════════════════════════════════
// エステラブの段（第78便）
//
// ★★★ 駅ちかの段（login / read_work / …）には一切触れていない。
//   段の名前を分けることで、既存の判定に手を入れずに足せる。
//   ★ フロー文脈の形も変えていないので RELAY_FLOW_VERSION も据え置き。
//     → **走っている途中の駅ちかのジョブは、この便で止まらない。**
//
// ★★★ この2段でやるのは【ログインして名簿を読む】まで。**1文字も書き換えない。**
//   ★ 出勤を書く段（esulove_write_work）は、突き合わせ（mediaMatch）を挟んでから足す。
// ══════════════════════════════════════════════════════════════════

/**
 * エステラブのログインの応答。
 * ★ ここでは監査ログを書かない。まだ成否が分からないから（駅ちかの afterLogin と同じ作法）。
 */
function afterEsuloveLogin(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 400) {
    return stop(
      [{ event: 'login', outcome: 'failed', detail: { httpStatus: input.status, reason: 'http_error', flowId } }],
      'エステラブのログインの応答が ' + input.status + ' だった',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  if (!cookie) {
    // ★ 解釈の余地なく失敗。セッションが無ければ次の GET は必ずログイン画面になる
    return stop(
      [{
        event: 'login',
        outcome: 'failed',
        summary:
          'エステラブにログインできませんでした（セッションが返りませんでした）。' +
          'ログインID・パスワードをご確認ください',
        detail: { httpStatus: input.status, reason: 'no_cookie', flowId },
      }],
      'エステラブのログインで Cookie が返らなかった',
    );
  }

  // ★★ エステラブは失敗しても 200 を返す作り。★ 本文でログイン画面かどうかを見る
  const judged = judgeEsuloveLogin(input.body);
  if (judged !== null && !judged.ok) {
    return stop(
      [{
        event: 'login',
        outcome: 'failed',
        summary:
          'エステラブにログインできませんでした（ログイン画面が返りました）。' +
          'ログインID・パスワードをご確認ください',
        detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
      }],
      'エステラブのログイン後にログイン画面が返った',
    );
  }
  // ★ judged === null は「見分けがつかない」。★ ここで止めない——次の一覧の応答で分かる。
  //   止めると、画面の作りが少し変わっただけで連携が全部止まる。★ 判断は材料が揃う段でする。

  const next = buildEsuloveTherapistListRequest(cookie);
  return {
    kind: 'next',
    audits: [],
    note: 'エステラブにログインできた（' + (judged === null ? '確証は次の段で' : '確認済み') + '）',
    next: {
      purpose: 'esulove_therapists',
      method: next.method,
      url: next.url,
      headers: next.headers,
      body: '',
      context: { ...ctx, cookie },
    },
  };
}

/**
 * エステラブのセラピスト一覧の応答。
 * ★★ 読めたら【次を積まない】。★ ここでエステラブとのやりとりは終わり。何も書き換えていない。
 */
function afterEsuloveTherapists(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [{
          event: 'login',
          outcome: 'failed',
          summary:
            'エステラブにログインできませんでした（ログイン画面へ戻されました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
        }],
        'ログイン後のセラピスト一覧がログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [{
        event: 'read_girls',
        outcome: 'failed',
        summary: 'エステラブのセラピスト一覧を開けませんでした（別の場所へ転送されました）',
        detail: { httpStatus: input.status, reason: 'redirected', flowId },
      }],
      'セラピスト一覧が ' + input.status + ' で転送された（' + ESULOVE_THERAPIST_URL + '）',
    );
  }

  if (input.status >= 400) {
    return stop(
      [{
        event: 'read_girls',
        outcome: 'failed',
        summary: 'エステラブのセラピスト一覧を開けませんでした',
        detail: { httpStatus: input.status, reason: 'http_error', flowId },
      }],
      'セラピスト一覧の応答が ' + input.status + ' だった',
    );
  }

  const parsed = parseEsuloveTherapists(input.body);
  if (parsed.rows.length === 0) {
    // ★★ 0人 と 読めなかった を混ぜない。★ ここへ来るのは「読めなかった」ほう
    //   （ログインできていない／画面の作りが変わった）。★ 「0人でした」と言わない
    return stop(
      [{
        event: 'read_girls',
        outcome: 'failed',
        summary: 'エステラブのセラピスト一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: { httpStatus: input.status, reason: 'parse_empty', flowId },
      }],
      'セラピスト一覧を1人も読み取れなかった: ' + (parsed.warnings[0] ?? '理由不明'),
    );
  }

  const dup = duplicateNames(parsed.rows);
  return {
    kind: 'esulove_roster',
    rows: parsed.rows,
    warnings: parsed.warnings,
    audits: [{
      event: 'read_girls',
      outcome: 'ok',
      // ★ 名前を監査ログに入れない。★ 件数だけ（mediaAudit の scrubAuditDetail と同じ考え）
      summary:
        'エステラブのセラピストを ' + parsed.rows.length + '人 読み取りました' +
        (dup.length > 0 ? '（★ 同じ名前が ' + dup.length + '組 あります）' : ''),
      detail: {
        count: parsed.rows.length,
        duplicates: dup.length,
        warnings: parsed.warnings.length,
        flowId,
      },
    }],
    note:
      'エステラブの名簿を ' + parsed.rows.length + '人 読めた' +
      (dup.length > 0 ? ' / ★ 同名 ' + dup.length + '組' : '') +
      (parsed.warnings.length > 0 ? ' / ★ 気になること ' + parsed.warnings.length + '件' : ''),
  };
}

// ────────────────────────── 写メ日記（第94便）──────────────────────────
//
// ★★★ この段は【読むだけ】。★ 駅ちかへ POST は1本も投げない。
// ★★ どの日記を開くかは、ここでは決めない。★ salon_diary_imports を読まないと決められないため、
//   一覧を読めたら呼び出し側へ返す（plan_work / maillist と同じ形）。

/** 一覧のNページ目を読む GET を組み立てる。★ 何ページ目かは文脈に残す。 */
export function buildReadDiaryListRequest(ctx: RelayFlowContext, pageNumber: number): FlowNextRequest {
  const n = Number.isFinite(pageNumber) && pageNumber > 1 ? Math.floor(pageNumber) : 1;
  return {
    purpose: 'read_diary_list',
    method: 'GET',
    url: ekichikaDiaryListUrl(n),
    headers: buildReadWorkRequest(ctx.cookie),
    body: '',
    // ★ diaryId は前の段の残りが混ざらないよう、ここで必ず消す
    context: { ...ctx, diaryPage: n, diaryId: undefined },
  };
}

/**
 * 日記1件を開く GET を組み立てる。
 * ★★★ 開きに行った日記IDを【文脈に残す】。★ 応答をパーサに渡すとき、突き合わせに使う。
 *   ★ 残さないと「別の日記が返ってきた」を見つけられない（＝Aさんの日記がBさんの名前で載る）。
 */
export function buildReadDiaryDetailRequest(ctx: RelayFlowContext, diaryId: string): FlowNextRequest {
  const url = ekichikaDiaryDetailUrl(diaryId); // ★ 数字でなければここで例外
  return {
    purpose: 'read_diary_detail',
    method: 'GET',
    url,
    headers: buildReadWorkRequest(ctx.cookie),
    body: '',
    context: { ...ctx, diaryId: String(diaryId) },
  };
}

/**
 * ログインが切れていないかを見る（写メ日記の段で共通）。
 * ★ 転送でログイン画面へ戻された／本文がログイン画面だった、を1か所にまとめる。
 * ★ null なら「ログインは生きている」。
 */
function diaryLoginLost(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
  what: string,
): FlowOutcome | null {
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
            detail: { httpStatus: input.status, reason: 'back_to_login', flowId: ctx.flowId },
          },
        ],
        what + 'がログイン画面へ戻された＝ログインできていない',
      );
    }
    return null;
  }
  if (input.status === 200 && looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId: ctx.flowId },
        },
      ],
      what + 'としてログイン画面が返った＝ログインできていない',
    );
  }
  return null;
}

/**
 * 一覧の応答。
 * ★★ 読めなければ **止める**。★ 一覧が読めない＝この店では1件も進められない（全件に効く failure）。
 */
function afterReadDiaryList(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const pageNumber = Number.isFinite(ctx.diaryPage) && (ctx.diaryPage ?? 0) > 0 ? Number(ctx.diaryPage) : 1;

  const lost = diaryLoginLost(input, ctx, '写メ日記の一覧');
  if (lost) return lost;

  if (input.status >= 300 && input.status < 400) {
    return stop(
      [
        {
          event: 'read_diary_list',
          outcome: 'failed',
          summary: '駅ちかの写メ日記の一覧を開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', page: pageNumber, flowId },
        },
      ],
      '写メ日記の一覧が想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_diary_list',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', page: pageNumber, flowId },
        },
      ],
      '写メ日記の一覧の応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaDiaryList(input.body);

  if (diaryListUsable(page)) {
    return {
      kind: 'diary_list',
      page,
      pageNumber,
      audits: [
        // ★ 一覧が読めた＝ログインできた（この作法は出勤・名簿と同じ）
        { event: 'login', outcome: 'ok', detail: { flowId } },
        {
          event: 'read_diary_list',
          outcome: 'ok',
          // ★ 件数とページ番号だけ。★ 日記の中身も名前も入れない
          detail: { diaries: page.rows.length, page: pageNumber, flowId },
        },
      ],
      note:
        '写メ日記の一覧を読めた（' + pageNumber + 'ページ目・' + page.rows.length + '件）。' +
        '★ 駅ちかへは何も書いていない。★ どれを開くかは呼び出し側が決める',
    };
  }

  return stop(
    [
      {
        event: 'read_diary_list',
        outcome: 'failed',
        summary: '駅ちかの写メ日記の一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: page.rows.length === 0 ? 'parse_error' : 'page_broken',
          problems: page.problems.length,
          diaries: page.rows.length,
          page: pageNumber,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    '写メ日記の一覧を読み取れなかった: ' + (page.problems[0] ?? '理由なし'),
  );
}

/**
 * 日記1件の応答。
 *
 * ★★★ 読めなかったときも 'diary_detail' で返す（stop にしない）。理由は FlowOutcome の説明のとおり。
 *   ★ 呼び出し側は必ず diaryDetailUsable() を見て、読めていないものは
 *     `skipped:unreadable` として記録すること（§375 のとおり1日1回だけ開き直る）。
 */
function afterReadDiaryDetail(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const diaryId = String(ctx.diaryId ?? '');

  if (!diaryId) {
    // ★ どの日記を開いたのか分からない応答は、記録の書き先も決められない。★ 進めない
    return stop(
      [{ event: 'read_diary_detail', outcome: 'failed', detail: { reason: 'no_diary_id', flowId } }],
      '開きに行った日記IDが文脈に無い（buildReadDiaryDetailRequest を通していない）',
    );
  }

  const lost = diaryLoginLost(input, ctx, '写メ日記');
  if (lost) return lost;

  if (input.status !== 200) {
    // ★★ 1件のHTTP失敗で店ごと止めない。★ その日記だけ見送って、次の周へ回す
    const detail = parseEkichikaDiaryDetail('', diaryId);
    return {
      kind: 'diary_detail',
      detail,
      diaryId,
      audits: [
        {
          event: 'read_diary_detail',
          outcome: 'failed',
          summary: '駅ちかの写メ日記を1件開けませんでした',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      note: '日記 ' + diaryId + ' の応答が ' + input.status + ' だった。★ この1件だけ見送る',
    };
  }

  // ★★★ 開きに行った日記IDを必ず渡す（取り違えを見つけるため）
  const detail = parseEkichikaDiaryDetail(input.body, diaryId);

  if (diaryDetailUsable(detail)) {
    return {
      kind: 'diary_detail',
      detail,
      diaryId,
      audits: [
        {
          event: 'read_diary_detail',
          outcome: 'ok',
          // ★ 中身は入れない。★ 公開か・写真があるか、までにとどめる
          detail: {
            hasImage: detail.imageUrl !== null,
            isPublic: detail.isPublic === true,
            flowId,
          },
        },
      ],
      note:
        '日記 ' + diaryId + ' を読めた（' + (detail.isPublic ? '公開' : '非公開') + '・写真' +
        (detail.imageUrl ? 'あり' : 'なし') + '）。★ 駅ちかへは何も書いていない',
    };
  }

  return {
    kind: 'diary_detail',
    detail,
    diaryId,
    audits: [
      {
        event: 'read_diary_detail',
        outcome: 'failed',
        summary: '駅ちかの写メ日記を1件読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: 'parse_error',
          problems: detail.problems.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    note: '日記 ' + diaryId + ' を読み取れなかった: ' + (detail.problems[0] ?? '理由なし'),
  };
}
