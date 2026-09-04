// 中継フローの実行（第41便）。★ このファイルはサーバー専用（service_role で DB を触る）。
//
//   startRelayFlow()    … フローを始める（login を1件積む）
//   advanceRelayFlow()  … 閉じたジョブの応答を見て、次を積む／監査に残す／止める
//
// ★★★ 判断そのものは src/lib/relayFlow.ts（純粋関数）が持つ。
//   ここは「決まったことを実行する」だけ。DBとネットワークの都合を判断に混ぜない。
//   ★ この分担を崩すと、状態遷移がテストできなくなる。
//
// ★★★ 失敗しても積み直さない。
//   ログイン失敗を投げ直すと相手のアカウントが凍る（設計メモ §17-1）。
//   'stop' が返ったらそこで終わり。人が直すまで再開しない。

import { createServiceClient } from '@/app/lib/supabase/service';
import { recordMediaAudit } from '@/app/lib/media/mediaAudit';
import { defaultAuditSummary } from '@/lib/mediaAudit';
import { enqueueRelayJob } from '@/app/lib/media/relayQueue';
import { stampDiaryListed } from '@/app/lib/media/diaryWatch';
import { openContext, unpackBody, type RelayResponse } from '@/lib/relayJob';
import { decryptSecret } from '@/lib/mediaCredentials';
import {
  advanceFlow,
  buildLoginRequest,
  buildWriteWorkRequest,
  buildReadDiaryListRequest,
  buildReadDiaryDetailRequest,
  newFlowContext,
  type FlowAudit,
  type FlowNextRequest,
  type RelayFlowContext,
  type RelayFlowIntent,
  type DiaryQueueItem,
} from '@/lib/relayFlow';
// ★ 写メ日記（第95便）。★ 判断は純粋関数側にある。ここは決まったことを実行するだけ
import {
  selectDiariesToFetch,
  planDiaryPaging,
  diaryDetailUsable,
  DIARY_MAX_PAGES,
  type EkichikaDiaryListPage,
  type EkichikaDiaryDetail,
  type KnownDiary,
} from '@/lib/ekichikaDiaryParse';
import { loadCastIds } from '@/lib/mediaCastIds';
import { addDaysISO, buildWorkPlan, planFingerprint, summarizePlan, type FukuesShift } from '@/lib/workPlan';
import { WORK_DAYS, encodeGirlWork, type WorkPage } from '@/lib/ekichikaWorkParse';
import type { EkichikaGirlsPage } from '@/lib/ekichikaGirlsParse';
import type { EkichikaMailListPage } from '@/lib/ekichikaMailListParse';
// ★ エステラブ（第80便）。★ 送るのは次便。ここでは「ログイン → 名簿 → 計画」まで
import { buildEsuloveLoginRequest } from '@/lib/esuloveRequests';
// ★ エステ魂（第109便）
import { buildEsutamaLoginPageRequest, buildEsutamaLoginRequest, buildEsutamaWorkReadRequest } from '@/lib/esutamaRequests';
import { planEsutamaWork } from '@/lib/esutamaPlan';
import { esutamaWindowDates, esutamaTodayISO, esutamaApprovedFromDiff } from '@/lib/esutamaFlow';
import type { EsutamaRosterRow } from '@/lib/esutamaParse';
import type { EsutamaPlanSummary } from '@/lib/relayFlow';
import { planEsuloveWork } from '@/lib/esulovePlan';
// ★ エステ魂の写メ日記（第133便）。★ 判断は純粋関数側。ここは DB から材料を集めて渡すだけ
import {
  planEsutamaDiaries, tallyDiaryPlan, diaryPlanSummary, pickOneToSend, checkSalonDiarySource,
  type DiaryCandidate,
} from '@/lib/esutamaDiaryPlan';
import { toConsentState } from '@/lib/therapistMediaConsent';
import { buildEsutamaDiaryTokenStep } from '@/lib/esutamaDiaryFlow';
import type { EsuloveTherapistRow } from '@/lib/esuloveTherapistParse';

/**
 * いまフローを組み立てられる媒体。
 * ★ 増やすときは、下の「最初の段」の分岐も一緒に直すこと。
 * ★ 2026-08-31（第80便）でエステラブを追加。★ ただしエステラブは
 *   【ログイン → 名簿を読む → 送るとこうなるを組み立てる】まで。**まだ送らない。**
 */
// ★ 2026-09-02（第109便）でエステ魂を追加。★ ログイン → 名簿 → 出勤表（人ごと）→ 保存 → 照合。
const SUPPORTED_PROVIDERS = ['ekichika', 'esulove', 'esutama'] as const;

/**
 * 媒体ごとの「最初の段」。
 * ★★ 段の名前を分けているので、判定はここ1か所で済む（第78便 §310）。
 * ★ 知らない媒体はここへ来ない（SUPPORTED_PROVIDERS で弾いてある）。
 */
function firstStep(
  provider: string,
  cred: { shopId: string; loginId: string; password: string },
): { purpose: 'login' | 'esulove_login' | 'esutama_login_page'; method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: string } {
  if (provider === 'esutama') {
    // ★ エステ魂は先にログイン画面を GET して csrf と Cookie を拾う（第109便）。★ 認証情報はまだ使わない
    const r = buildEsutamaLoginPageRequest();
    return { purpose: 'esutama_login_page', method: 'GET', url: r.url, headers: r.headers, body: '' };
  }
  if (provider === 'esulove') {
    const r = buildEsuloveLoginRequest({ loginId: cred.loginId, password: cred.password });
    return { purpose: 'esulove_login', method: 'POST', url: r.url, headers: r.headers, body: r.body ?? '' };
  }
  const r = buildLoginRequest({ shopId: cred.shopId, loginId: cred.loginId, password: cred.password });
  return { purpose: 'login', method: 'POST', url: r.url, headers: r.headers, body: r.body };
}

export type StartFlowResult =
  | { ok: true; jobId: string; flowId: string; note: string }
  | { ok: false; reason: 'busy' | 'no_credential' | 'disabled' | 'unsupported'; note: string };

/**
 * フローを始める。★ login を1件積むだけ。実際に投げるのは VPS の周。
 *
 * ★★ 認証情報はここで復号する。VPS へは「このリクエストを投げて」という形でしか渡らない
 *   （その中身も暗号化されている）。VPS は最後まで中身を理解しない。
 */
export async function startRelayFlow(params: {
  salonId: number;
  provider: string;
  slot: number;
  intent: RelayFlowIntent;
  /**
   * ★ 人が画面で見て承認した計画の指紋（intent='work_push' のときだけ）。
   *   送る直前に読み直して作った計画と突き合わせ、違ったら送らない。
   */
  approvedFingerprint?: string;
  /**
   * intent='diary_read' で【初回の遡り】をするときだけ。
   * ★ 渡さなければ通常運転＝一覧の1ページ目だけを見る（§371）。
   * ★★★ ここで**受け取っていないと、呼び出し側が渡しても静かに落ちる**。
   *   ★ 型の上は通ってしまう（余分な項目は素通りする）。★ 受け取り〜文脈に入れるまでを1組にしてある。
   */
  diarySince?: string | null;
  diaryPagesLeft?: number;
  /**
   * intent='photo_push' のときだけ（第107便）。★ 写真の在処・枠・切り抜きの範囲。
   * ★★ ここで受け取っていないと、呼び出し側が渡しても静かに落ちる（diarySince と同じ作法）。
   */
  photo?: {
    girlId: string;
    slot: number;
    file: { bucket: string; path: string; filename: string; contentType: string; width: number; height: number };
    mainRect?: { x: number; y: number; w: number; h: number };
    thumbRect?: { x: number; y: number; w: number; h: number };
  };
  /**
   * intent='diary_push' のときだけ（第133便）。★ **送る相手は1人だけ。**
   * ★★ ここで受け取っていないと、呼び出し側が渡しても静かに落ちる（diarySince と同じ作法）。
   * ★★★ therapistId が入っていなければ、一覧を読んだあと**何も送らずに終わる**。
   *   ★ これが実弾の安全装置。★ 「全員に送る」という状態を作らない。
   */
  diary?: {
    /** フクエス側の therapist_id */
    therapistId: number;
    /** 送る日記（diary_posts.id・uuid）。★ 省略すると【未送信のうち一番新しい1件】 */
    diaryId?: string;
  };
  /** 'shop:<auth_user_id>' など。監査ログに残す */
  actor?: string;
}): Promise<StartFlowResult> {
  if (!SUPPORTED_PROVIDERS.includes(params.provider as (typeof SUPPORTED_PROVIDERS)[number])) {
    return { ok: false, reason: 'unsupported', note: 'この媒体の自動連携はまだありません' };
  }

  const supabase = createServiceClient();
  const { data: cred, error } = await supabase
    .from('salon_media_credentials')
    .select('shop_id, login_id, password_enc, is_enabled')
    .eq('salon_id', params.salonId)
    .eq('provider', params.provider)
    .eq('slot', params.slot)
    .maybeSingle();

  if (error) throw new Error('ログイン情報を読めなかった: ' + error.message);
  if (!cred) return { ok: false, reason: 'no_credential', note: 'ログイン情報が登録されていません' };

  // ★★ 連携の向きが 'none'（連携しない）の枠では、認証情報を使わない（第45便）。
  //   ★ 行が無いときは止めない。向きがまだ決まっていないだけで、
  //     「連携しない」と決めた状態とは別物（そこを一緒にすると、設定前の店が何もできなくなる）。
  const { data: src } = await supabase
    .from('salon_import_sources')
    .select('link_mode')
    .eq('salon_id', params.salonId)
    .eq('provider', params.provider)
    .eq('slot', params.slot)
    .maybeSingle();
  if (src && String((src as { link_mode?: string }).link_mode) === 'none') {
    return { ok: false, reason: 'disabled', note: 'この枠は「連携しない」に設定されています' };
  }
  if (cred.is_enabled !== true) {
    // ★ 停止中の連携を、こちらの都合で勝手に動かさない
    return { ok: false, reason: 'disabled', note: 'この連携は停止中です。再開してからお試しください' };
  }

  const password = decryptSecret(cred.password_enc as string, {
    salonId: params.salonId,
    provider: params.provider,
    slot: params.slot,
  });

  const login = firstStep(params.provider, {
    shopId: String(cred.shop_id ?? ''),
    loginId: String(cred.login_id ?? ''),
    password,
  });

  const context: RelayFlowContext = {
    ...newFlowContext({
      flowId: crypto.randomUUID(),
      intent: params.intent,
      startedAt: new Date().toISOString(),
    }),
    ...(params.approvedFingerprint !== undefined
      ? { approvedFingerprint: params.approvedFingerprint }
      : {}),
    // ★ 初回の遡り（第95便）。★ 渡されたときだけ入れる
    ...(params.diarySince ? { diarySince: params.diarySince } : {}),
    ...(Number.isFinite(params.diaryPagesLeft)
      ? { diaryPagesLeft: Number(params.diaryPagesLeft) }
      : {}),
    // ★ 写真の送信（第107便）。★ 渡されたときだけ入れる
    ...(params.photo
      ? {
          photoGirlId: params.photo.girlId,
          photoSlot: params.photo.slot,
          photoFile: params.photo.file,
          ...(params.photo.mainRect ? { photoMainRect: params.photo.mainRect } : {}),
          ...(params.photo.thumbRect ? { photoThumbRect: params.photo.thumbRect } : {}),
          photoStage: 'upload' as const,
        }
      : {}),
    // ★ エステ魂の写メ日記（第133便）。★ 渡されたときだけ入れる
    ...(params.diary
      ? {
          esutamaDiaryTherapistId: params.diary.therapistId,
          ...(params.diary.diaryId ? { esutamaDiaryPostId: params.diary.diaryId } : {}),
        }
      : {}),
  };
  // ★★★ 実弾なのに相手が指定されていないのは、呼び出し側の間違い。★ 黙って始めない
  if (params.intent === 'diary_push' && !params.diary) {
    throw new Error('diary_push には diary（therapistId）が要る');
  }
  if (params.intent === 'photo_push' && !params.photo) {
    throw new Error('photo_push には photo（girlId / slot / file）が要る');
  }

  const r = await enqueueRelayJob({
    salonId: params.salonId,
    provider: params.provider,
    slot: params.slot,
    purpose: login.purpose,
    method: login.method,
    url: login.url,
    headers: login.headers,
    body: login.body,
    context,
  });

  if (!r.ok) return { ok: false, reason: 'busy', note: r.detail };
  return {
    ok: true,
    jobId: r.jobId,
    flowId: context.flowId,
    note: '受け付けました。数分お待ちください（中継役が1分ごとに引き取ります）',
  };
}

/**
 * 閉じたジョブの応答を見て、フローを1段進める。
 * ★ 呼び出し元は completeRelayJob()。例外はそちらで拾って握るので、ここでは素直に投げてよい。
 */
export async function advanceRelayFlow(params: {
  jobId: string;
  salonId: number;
  provider: string;
  slot: number;
  purpose: string;
  contextEnc: string;
  response: RelayResponse;
}): Promise<{ note: string }> {
  const context = openContext<RelayFlowContext>(params.contextEnc, params.jobId);

  // ★ 本文は要る段だけ展開する。出勤ページは実測2.3MB あるので、login では触らない
  const needsBody = params.purpose !== 'login';
  const body = needsBody ? unpackBody(params.response.bodyPacked) : '';

  const outcome = advanceFlow({
    purpose: params.purpose,
    status: params.response.status,
    headers: params.response.headers,
    body,
    context,
  });

  const audits: FlowAudit[] = [...outcome.audits];
  let note = outcome.note;
  let next: FlowNextRequest | null = outcome.kind === 'next' ? outcome.next : null;

  // ★★★ 読めたあと、DB を読んで計画を立てる（第43便＝試し打ち／第46便＝送信）。
  //   純粋関数側（advanceFlow）は「読めた。あとは突き合わせ」までしか言わない。
  //   ★ 試し打ちのときは次を積まない ＝ 駅ちかへ何も飛ばない。
  //   ★ 送信のときだけ、承認の指紋が一致していれば write_work を積む。
  // ★★★ 名簿を読めた（第50便）。写しを1件だけ上書きで残す。
  //   ★ 次を積まない ＝ ここで駅ちかとのやりとりは終わり。**何も書き換えていない。**
  if (outcome.kind === 'roster') {
    const r = await saveRoster(params, outcome.page, context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
  }

  // ★★★ 投稿用メールアドレスを読めた（第53便）。
  //   ★ 次を積まない ＝ 駅ちかとのやりとりはここで終わり。何も書き換えていない。
  //   ★ フクエス側を書くかどうかは intent で決まる（mail_dryrun は数えるだけ）。
  if (outcome.kind === 'maillist') {
    const r = await saveMailList(params, outcome.page, context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
  }

  if (outcome.kind === 'plan_work') {
    const r = await planWork(params, outcome.page, context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
    next = r.next ?? null;
  }

  // ★★ エステラブの名簿を読めた（第78便）。★ この便では【保存しない】。
  //   ★ 読めたことと、同名が居るかを note に出すだけ。次を積まないので何も書き換えていない。
  //   ★ warnings は黙って捨てない（記録に残す）。
  // ★★★ 写メ日記の一覧を読めた（第95便）。
  //   ★ どれを開くかは DB（salon_diary_imports）を読まないと決められない。
  //     ★ 判断そのものは selectDiariesToFetch / planDiaryPaging（純粋関数）が持つ。
  if (outcome.kind === 'diary_list') {
    const r = await planDiaryList(params, outcome.page, outcome.pageNumber, context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
    next = r.next ?? null;
  }

  // ★★★ 写メ日記を1件開いた（第95便）。★ ここで初めてフクエス側に書く。
  //   ★ 読めなかった1件も、記録だけ残して次へ進む（店ごと止めない）。
  if (outcome.kind === 'diary_detail') {
    const r = await saveDiaryDetail(params, outcome.detail, outcome.diaryId, context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
    next = r.next ?? null;
  }

  if (outcome.kind === 'esulove_roster') {
    if (outcome.warnings.length > 0) {
      console.warn('[relay] エステラブ名簿の気になること:', outcome.warnings.join(' / '));
    }
    const r = await planEsulove(params, outcome.rows, context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
    // ★★ 次は積まない。★ この便では【送らない】。駅ちかで踏んだ順番（第43便 試し打ち → 第46便 送信）と同じ
  }

  // ★★★ エステ魂のログイン画面を読めた（第109便）。★ ここで初めて認証情報を復号してログイン POST を組む。
  //   ★ 純粋関数側は csrf と Cookie しか持っていない。パスワードは文脈に入れない（この関数の中だけ）。
  if (outcome.kind === 'esutama_login_needed') {
    const r = await buildEsutamaLoginStep(params, outcome.csrf, outcome.context);
    if ('stop' in r) {
      audits.push(...r.stop.audits);
      note = outcome.note + ' → ' + r.stop.note;
    } else {
      next = r.next;
    }
  }

  // ★★★ エステ魂の名簿を読めた（第109便）。写しを残し、intent に応じて出勤表の段へ進む。
  //   ★ connect_test / roster_read はここで終わり（何も書き換えていない）。
  if (outcome.kind === 'esutama_roster') {
    if (outcome.warnings.length > 0) console.warn('[relay] エステ魂名簿の気になること:', outcome.warnings.join(' / '));
    const snap = await saveEsutamaRoster(params, outcome.rows, outcome.context);
    note = outcome.note + ' → ' + snap.note;
    if (context.intent === 'work_dryrun' || context.intent === 'work_push' || context.intent === 'work_auto') {
      const r = await planEsutama(params, outcome.rows, outcome.context);
      audits.push(...r.audits);
      note = note + ' → ' + r.note;
      next = r.next ?? null;
    }
  }

  // ★★★ 魂セラピスト一覧を読めた（第133便）。★ ここで初めて【誰のどの日記を送るか】が決まる。
  //   ★ 判断は純粋関数（esutamaDiaryPlan）。ここは DB から材料を集めて渡すだけ。
  //   ★★ diary_dryrun はここで終わり＝**代理ログインもしない・1文字も書かない。**
  if (outcome.kind === 'esutama_therapists') {
    const r = await planEsutamaDiary(params, outcome.rows, outcome.ctk, outcome.context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
    next = r.next ?? null;
  }

  // ★★★ エステ魂の流れが終わった（第110便）。店舗の画面「出勤を送る」に出す計画を残す。
  //   ★ 試し打ちなら「これから送る内容」、送ったあとなら「送らずに残った内容」。駅ちかの media_work_plans と同じ表。
  if (outcome.kind === 'done' && outcome.esutamaPlan) {
    const r = await saveEsutamaPlan(params, outcome.esutamaPlan, context);
    note = note + ' → ' + r.note;
  }

  // ★★★ 送れずに終わったら、送った印を消す（第133便）。
  //   ★ 印は送る【前】に立ててある（消せない相手に二度送らないため）。
  //   ★★ 消さないと、その日記は【二度と送れない】ままになる。★ 静かな取りこぼしを作らない。
  //   ★ 判定は「印を立てた」かつ「投稿の POST が通っていない」。★ 文脈に diaryId があるだけでは消さない。
  if (!next && context.esutamaDiaryMarked === true && context.esutamaDiaryPosted !== true) {
    const r = await clearDiaryMark(params, context);
    audits.push(...r.audits);
    note = note + ' → ' + r.note;
  }

  await writeAudits(params, audits, context);

  // ★ 接続テストの結果を、店舗が画面で見られる形にも残す（last_verified_at / last_error）
  // ★★ 計画の段は 'done' として扱う。**ログインと読み取りは実際に成功している**ので、
  //   認証情報は健全。計画が止まったことは last_error（＝認証の話）ではなく監査ログに残す。
  //   ここを 'stop' にすると「ログイン情報がおかしい」と読める文が店舗の画面に出てしまう。
  //   ★ 名簿の読み取りも 'done'。ログインと読み取りは実際に成功しているので認証情報は健全。
  //   ★ 写メ日記の段も 'done'（第94便）。★ 一覧が読めた＝ログインは実際に成功している。
  //     ★★ 日記1件が読めなかった周も認証情報は健全なので、ここを 'stop' にしない
  //       （店舗の画面に「ログイン情報がおかしい」と読める文を出さない）。
  //   ★ 写真の段（第107便）で止まった（枠が使用中・駅ちかが断った等）も、ログインは成功している。
  //     ★ 監査に理由は残す。★ last_error（認証の話）には書かない
  const photoStoppedButLoggedIn =
    outcome.kind === 'stop' &&
    context.intent === 'photo_push' &&
    outcome.audits.length > 0 &&
    outcome.audits.every((a) => a.event !== 'login');
  // ★ エステ魂のログイン POST を組めなかった（認証情報が読めない等）は stop（認証の話なので店舗に見せる）
  const esutamaLoginFailed = outcome.kind === 'esutama_login_needed' && !next;
  const settle: 'next' | 'done' | 'stop' = next
    ? 'next'
    : esutamaLoginFailed
      ? 'stop'
    : outcome.kind === 'plan_work' || outcome.kind === 'roster' || outcome.kind === 'maillist'
        || outcome.kind === 'esulove_roster'
        // ★ エステ魂（第109便）: 名簿が読めた＝ログインは成功している。計画で止まっても認証の話ではない
        || outcome.kind === 'esutama_roster'
        // ★ エステ魂の魂セラピスト一覧が読めた（第130便）。★ 同じ理由で認証の話ではない
        || outcome.kind === 'esutama_therapists'
        || outcome.kind === 'diary_list' || outcome.kind === 'diary_detail'
        || photoStoppedButLoggedIn
      ? 'done'
      : outcome.kind === 'esutama_login_needed'
        ? 'stop'   // ★ 上の esutamaLoginFailed で拾っている。型を閉じるためだけ
        : outcome.kind;
  await stampCredential(params, settle, audits);

  if (!next) return { note };
  const r = await enqueueRelayJob({
    salonId: params.salonId,
    provider: params.provider,
    slot: params.slot,
    purpose: next.purpose,
    method: next.method,
    url: next.url,
    headers: next.headers,
    body: next.body,
    ...(next.multipart !== undefined ? { multipart: next.multipart } : {}),
    context: next.context,
  });

  if (!r.ok) {
    // ★ ここへ来るのは、いま閉じたジョブがまだ走っている扱いのとき＝起きないはず。
    //   起きたら黙らない（枠が塞がったまま止まる形になる）
    console.error('[relay] 次の段を積めなかった', params.jobId, next.purpose, r.detail);
    return { note: '次の段（' + next.purpose + '）を積めなかった: ' + r.detail };
  }
  return { note: outcome.note + ' → 次に ' + next.purpose + ' を積んだ' };
}

/**
 * ★★ 投稿用メールアドレスを取り込む（第53便・設計メモ 追記26）。
 *
 * ★★★ この関数の出口に駅ちかへの通信は無い。★ 読んだものをフクエス側に写すだけ。
 *
 * ★★★ アドレスは秘密値。★ 監査ログにも note にも【値を出さない】。件数とドメインだけ。
 *
 * ★★ 2段（第43便の作法）:
 *   mail_dryrun … 何件入れるつもりかを数えるだけ。★ 1行も書かない
 *   mail_apply  … 実際に therapist_diary_forward を更新する
 *
 * ★★ 上書きの方針は【常に上書き】（カッキーさんの決定・2026-08-29）。
 *   アドレスの正本は駅ちか側。空き枠だけ埋める形だと、駅ちかで再発行されたとき
 *   古いまま送り続ける＝【静かに失敗する形】を自分で作ることになる。
 *
 * ★ ガラケー欄（@s.…）は【保存しない】。フクエスは Resend で送るので使わない。
 *   ★ 使わない秘密値を保管する場所を増やさない（第38便の作法）。
 *   ★ ただしパーサは読む（74=37×2 の突き合わせに要るため）。
 */
async function saveMailList(
  params: { salonId: number; provider: string; slot: number },
  page: EkichikaMailListPage,
  ctx: RelayFlowContext,
): Promise<{ audits: FlowAudit[]; note: string }> {
  const apply = ctx.intent === 'mail_apply';
  const supabase = createServiceClient();

  // 1. その店の在籍と castId（★ 名前ではなく castId で結びつける）
  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, import_cast_id')
    .eq('salon_id', params.salonId);
  if (thErr) {
    return { audits: [], note: '★ 読めたが在籍を引けなかった: ' + thErr.message.slice(0, 120) };
  }
  const { maps, error: castErr } = await loadCastIds(supabase, {
    therapists: (therapists ?? []) as Array<{ id: number; import_cast_id?: string | null }>,
    provider: params.provider,
    slot: params.slot,
  });
  if (castErr) return { audits: [], note: '★ 読めたが媒体側の番号を引けなかった: ' + castErr };

  // 2. いま入っている転送先（★ 値の比較に要る。★ 値はここから外へ出さない）
  const ids = (therapists ?? []).map((t) => Number(t.id));
  const { data: current } = ids.length
    ? await supabase
        .from('therapist_diary_forward')
        .select('therapist_id, address')
        .eq('provider', params.provider)
        .eq('slot', params.slot)
        .in('therapist_id', ids)
    : { data: [] as Array<{ therapist_id: number; address: string }> };
  const now = new Map<number, string>();
  for (const r of current ?? []) now.set(Number(r.therapist_id), String(r.address));

  // 3. 数える
  let matched = 0, unmatched = 0, willCreate = 0, willUpdate = 0, unchanged = 0;
  const rows: Array<{ therapist_id: number; provider: string; slot: number; address: string }> = [];
  for (const r of page.rows) {
    const tid = maps.byCastId.get(r.castId);
    if (tid === undefined) { unmatched++; continue; }
    matched++;
    const before = now.get(tid);
    if (before === undefined) willCreate++;
    else if (before !== r.address) willUpdate++;
    else { unchanged++; continue; }        // ★ 同じ値は書かない（updated_at を無駄に動かさない）
    rows.push({ therapist_id: tid, provider: params.provider, slot: params.slot, address: r.address });
  }

  const counts = {
    found: page.rows.length,
    matched,
    unmatched,
    created: willCreate,
    updated: willUpdate,
    unchanged,
  };

  if (!apply) {
    // ★ 試し打ち。1行も書かない
    return {
      audits: [{ event: 'read_maillist', outcome: 'ok', detail: { ...counts, applied: false, flowId: ctx.flowId } }],
      note:
        '試し打ち: ' + matched + '名を結びつけ、新規 ' + willCreate + '名・更新 ' + willUpdate +
        '名・変更なし ' + unchanged + '名。★ まだ登録していません',
    };
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('therapist_diary_forward')
      .upsert(rows, { onConflict: 'therapist_id,provider,slot' });
    if (error) {
      console.error('[relay] 投稿用アドレスを登録できなかった', params.salonId, error.message);
      return {
        audits: [{ event: 'read_maillist', outcome: 'failed', detail: { ...counts, applied: true, flowId: ctx.flowId } }],
        note: '★ 読めたが登録できなかった: ' + error.message.slice(0, 120),
      };
    }
  }

  return {
    audits: [{ event: 'read_maillist', outcome: 'ok', detail: { ...counts, applied: true, flowId: ctx.flowId } }],
    note:
      '登録しました: 新規 ' + willCreate + '名・更新 ' + willUpdate + '名・変更なし ' + unchanged +
      '名' + (unmatched > 0 ? '（★ 結びつかなかった ' + unmatched + '名）' : ''),
  };
}

/**
 * ★★ 媒体側の名簿の写しを残す（第50便）。
 *
 * ★★★ この関数の出口に駅ちかへの通信は無い。**読んだものを置くだけ。**
 * ★ 店舗×媒体×枠につき最新1件を上書き（media_work_plans と同じ考え方）。
 *   名前が並ぶ表を貯めない。履歴が要るのは「何をしたか」＝監査ログのほう。
 * ★ 0人は保存しない。★ そもそも girlsPageUsable が 0人を通さないので、ここへは来ない。
 *   来たときに黙って空を書くと、画面が「駅ちかに誰もいない」と読める形になる。
 */
// ══════════════════════════════════════════════════════════════════
// ★ エステ魂（第109便）
// ══════════════════════════════════════════════════════════════════

/**
 * ★★★ エステ魂のログイン POST を組む。**ここだけが認証情報を復号する（startRelayFlow 以外で唯一）。**
 *   ★ 純粋関数側（esutamaFlow）には csrf と Cookie しか無い。パスワードは文脈に入れない。
 */
async function buildEsutamaLoginStep(
  params: { salonId: number; provider: string; slot: number },
  csrf: string,
  ctx: RelayFlowContext,
): Promise<{ next: FlowNextRequest } | { stop: { audits: FlowAudit[]; note: string } }> {
  const supabase = createServiceClient();
  const { data: cred, error } = await supabase
    .from('salon_media_credentials')
    .select('login_id, password_enc, is_enabled')
    .eq('salon_id', params.salonId)
    .eq('provider', params.provider)
    .eq('slot', params.slot)
    .maybeSingle();
  if (error || !cred) {
    return { stop: { audits: [{ event: 'login', outcome: 'failed', summary: 'エステ魂のログイン情報を読めませんでした', detail: { reason: 'credential_read_failed', flowId: ctx.flowId } }], note: 'ログイン情報を読めなかった: ' + (error?.message ?? '行が無い') } };
  }
  if (cred.is_enabled !== true) {
    return { stop: { audits: [{ event: 'login', outcome: 'stopped', summary: 'この連携は停止中のため、ログインしませんでした', detail: { reason: 'disabled', flowId: ctx.flowId } }], note: '停止中' } };
  }
  const password = decryptSecret(cred.password_enc as string, { salonId: params.salonId, provider: params.provider, slot: params.slot });
  const r = buildEsutamaLoginRequest({ loginId: String(cred.login_id ?? ''), password }, csrf, ctx.cookie);
  return {
    next: {
      purpose: 'esutama_login', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '',
      // ★ csrf は POST を組んだら文脈から消す（持ち回らない）
      context: { ...ctx, esutamaCsrf: undefined },
    },
  };
}

/** エステ魂の名簿の写しを残す（駅ちかの saveRoster と同じ表・同じ形）。★ 名簿画面（mediaRoster）がこれを読む */
async function saveEsutamaRoster(
  params: { salonId: number; provider: string; slot: number },
  rows: EsutamaRosterRow[],
  ctx: RelayFlowContext,
): Promise<{ note: string }> {
  if (rows.length === 0) return { note: '★ 0名だったので写しを残さなかった' };
  const supabase = createServiceClient();
  const { error } = await supabase.from('media_roster_snapshots').upsert(
    {
      salon_id: params.salonId,
      provider: params.provider,
      slot: params.slot,
      flow_id: ctx.flowId,
      read_at: new Date().toISOString(),
      total: rows.length,
      entries: rows.map((r) => ({ castId: r.castId, name: r.name })),
    },
    { onConflict: 'salon_id,provider,slot' },
  );
  if (error) {
    console.error('[relay] エステ魂の名簿の写しを保存できなかった', params.salonId, error.message);
    return { note: '★ 読めたが写しを保存できなかった: ' + error.message.slice(0, 120) };
  }
  return { note: rows.length + '名の写しを残した' };
}

/**
 * ★★★ エステ魂: 名簿とフクエスの出勤を突き合わせ、人ごとの計画を文脈に入れて 1人目の出勤表 GET を積む。
 *   ★ 判断は src/lib/esutamaPlan.ts（純粋関数・自己点検あり）。ここは DB を読んで渡すだけ。
 *   ★ 送るかどうか（試し打ち／送信）は intent。段の中（esutamaFlow）が見る。
 */
async function planEsutama(
  params: { salonId: number; provider: string; slot: number },
  rosterRows: EsutamaRosterRow[],
  ctx: RelayFlowContext,
): Promise<{ audits: FlowAudit[]; note: string; next?: FlowNextRequest }> {
  const flowId = ctx.flowId;
  const supabase = createServiceClient();
  const todayISO = esutamaTodayISO(ctx, Date.now());
  const windowDates = esutamaWindowDates(todayISO);

  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, name, import_cast_id')
    .eq('salon_id', params.salonId)
    .eq('is_active', true);
  if (thErr) {
    return { audits: [{ event: 'plan_work', outcome: 'failed', summary: 'エステ魂へ送る内容を組み立てられませんでした（フクエス側の読み取りに失敗）', detail: { reason: 'therapists_read_failed', flowId } }], note: 'セラピストを読めなかった: ' + thErr.message };
  }
  const rows = (therapists ?? []) as Array<{ id: number; name: string | null; import_cast_id?: string | null }>;
  const people = rows.map((t) => ({ therapistId: t.id, name: String(t.name ?? '') })).filter((t) => t.name.length > 0);

  // ★ 名簿画面で結んだ番号（therapist_media_ids）。あれば名前で探さない
  const { maps, error: castErr } = await loadCastIds(supabase, { therapists: rows, provider: params.provider, slot: params.slot });
  if (castErr) {
    return { audits: [{ event: 'plan_work', outcome: 'failed', summary: 'エステ魂へ送る内容を組み立てられませんでした（媒体の番号を読めませんでした）', detail: { reason: 'cast_ids_read_failed', flowId } }], note: '媒体IDを読めなかった: ' + castErr };
  }
  const links: Array<{ therapistId: number; castId: string }> = [];
  for (const [tid, cid] of maps.castIdOf) if (cid) links.push({ therapistId: tid, castId: cid });

  const ids = people.map((t) => t.therapistId);
  const { data: sched, error: schErr } = ids.length
    ? await supabase
        .from('therapist_schedules')
        .select('therapist_id, schedule_date, is_active, start_time, end_time')
        .in('therapist_id', ids)
        .gte('schedule_date', windowDates[0])
        .lte('schedule_date', windowDates[windowDates.length - 1])
    : { data: [] as unknown[], error: null };
  if (schErr) {
    return { audits: [{ event: 'plan_work', outcome: 'failed', summary: 'エステ魂へ送る内容を組み立てられませんでした（出勤の読み取りに失敗）', detail: { reason: 'schedules_read_failed', flowId } }], note: '出勤を読めなかった: ' + schErr.message };
  }
  const shifts = ((sched ?? []) as Array<Record<string, unknown>>).map((r) => ({
    therapistId: r['therapist_id'] as number,
    dateISO: String(r['schedule_date']),
    active: r['is_active'] === true,
    start: typeof r['start_time'] === 'string' ? r['start_time'].slice(0, 5) : null,
    end: typeof r['end_time'] === 'string' ? r['end_time'].slice(0, 5) : null,
  }));

  const plan = planEsutamaWork({
    roster: rosterRows.map((r) => ({ castId: r.castId, name: r.name })),
    therapists: people,
    shifts,
    windowDates,
    links,
  });

  const planAudit: FlowAudit = {
    event: 'plan_work',
    outcome: plan.ok ? 'ok' : 'stopped',
    summary: plan.summary + (plan.blocked.length ? '。送らない人: ' + plan.blocked.map((b) => b.message).join(' / ').slice(0, 160) : ''),
    detail: { people: plan.people.length, blocked: plan.blocked.length, notes: plan.notes.length, roster: rosterRows.length, targets: people.length, flowId },
  };
  if (plan.notes.length > 0) console.warn('[relay] エステ魂の計画の注記:', plan.notes.join(' / '));
  if (!plan.ok) return { audits: [planAudit], note: plan.summary };

  // ★★★ 店舗が画面から送る（work_push ＋ 指紋）とき: 保存してある計画と同じか（第110便）。
  //   ★ 違えば1人も送らない。★ 同じなら人ごとの鍵を文脈に入れ、読み直した結果と突き合わせる（esutamaFlow）。
  //   ★ approvedFingerprint が無いのは運営の口（work-flow）。★ 照合しない（undefined のまま）。
  let approved: Record<string, string> | undefined;
  if (ctx.intent === 'work_push' && ctx.approvedFingerprint !== undefined) {
    const { data: row } = await supabase
      .from('media_work_plans')
      .select('fingerprint, diff')
      .eq('salon_id', params.salonId).eq('provider', params.provider).eq('slot', params.slot)
      .maybeSingle();
    const saved = String(row?.fingerprint ?? '');
    if (!row || !saved || saved !== ctx.approvedFingerprint) {
      return {
        audits: [planAudit, {
          event: 'write_work', outcome: 'stopped',
          summary: '内容が新しくなっているため送りませんでした。画面を開き直して「反映内容を確認」からやり直してください',
          detail: { reason: 'fingerprint_mismatch', flowId },
        }],
        note: '承認した計画と保存してある計画が違うので送らない',
      };
    }
    approved = esutamaApprovedFromDiff((row.diff as Array<{ girlId?: string; dayIndex: number; after: string }> | null) ?? []);
  }

  // ★ 1人目の出勤表を読みに行く。★ 以降は段の中（esutamaFlow）が人を進める
  const first = plan.people[0];
  const req = buildEsutamaWorkReadRequest(ctx.cookie, first.castId);
  return {
    audits: [planAudit],
    note: plan.summary,
    next: {
      purpose: 'esutama_work_read', method: req.method, url: req.url, headers: req.headers, body: '',
      context: {
        ...ctx, esutamaPeople: plan.people, esutamaIndex: 0, esutamaChanged: 0, esutamaSaved: 0,
        esutamaWindow: windowDates, esutamaDiffs: [],
        esutamaBlocked: plan.blocked.map((b) => b.message), esutamaNotes: plan.notes,
        ...(approved !== undefined ? { esutamaApproved: approved } : {}),
      },
    },
  };
}

/** 'YYYY-MM-DD' → '9/4(金)'。★ 店舗の画面の日付見出し（駅ちかの見出しと同じ読み） */
function esutamaDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getUTCDay()];
  return Number(m[2]) + '/' + Number(m[3]) + '(' + w + ')';
}

/**
 * ★ エステ魂の計画を media_work_plans に残す（第110便）。★ 店舗×媒体×枠で1件（上書き）。
 *   ★ 駅ちかの planWork と同じ表・同じ形（diff の girlId に castId を入れる）。画面（WorkSend）はそのまま読める。
 */
async function saveEsutamaPlan(
  params: { salonId: number; provider: string; slot: number },
  plan: EsutamaPlanSummary,
  ctx: RelayFlowContext,
): Promise<{ note: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('media_work_plans').upsert(
    {
      salon_id: params.salonId,
      provider: params.provider,
      slot: params.slot,
      flow_id: ctx.flowId,
      created_at: new Date().toISOString(),
      sendable: plan.sendable,
      targets: plan.people,
      active_shifts: plan.diffs.filter((d) => d.after !== '─').length,
      change_count: plan.diffs.length,
      field_count: 0,
      fingerprint: plan.fingerprint,
      date_labels: plan.window.map(esutamaDateLabel),
      counts_before: [],
      counts_after: [],
      diff: plan.diffs.map((d) => ({ girlId: d.castId, name: d.name, dayIndex: d.dayIndex, before: d.before, after: d.after })),
      blockers: plan.blocked.map((m) => ({ kind: 'unmapped_therapist', detail: m })),
      notes: plan.notes.map((n) => ({ kind: 'time_snapped', detail: n })),
    },
    { onConflict: 'salon_id,provider,slot' },
  );
  if (error) {
    console.error('[relay] エステ魂の計画を保存できなかった', params.salonId, error.message);
    return { note: '★ 計画を保存できなかった: ' + error.message.slice(0, 120) };
  }
  return { note: '計画を残した（変更' + plan.diffs.length + '件・送れる=' + plan.sendable + '）' };
}

async function saveRoster(
  params: { salonId: number; provider: string; slot: number },
  page: EkichikaGirlsPage,
  ctx: RelayFlowContext,
): Promise<{ audits: FlowAudit[]; note: string }> {
  if (page.rows.length === 0) {
    return { audits: [], note: '★ 0名だったので写しを残さなかった（読み取り失敗として扱う）' };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('media_roster_snapshots').upsert(
    {
      salon_id: params.salonId,
      provider: params.provider,
      slot: params.slot,
      flow_id: ctx.flowId,
      read_at: new Date().toISOString(),
      total: page.rows.length,
      entries: page.rows.map((r) => ({ castId: r.castId, name: r.name, workState: r.workState })),
    },
    { onConflict: 'salon_id,provider,slot' },
  );

  if (error) {
    // ★ 読めたことは事実。保存に失敗したことは黙らないが、失敗として扱わない
    //   （駅ちか側には何も起きていないので、店舗の認証情報の話ではない）
    console.error('[relay] 名簿の写しを保存できなかった', params.salonId, error.message);
    return { audits: [], note: '★ 読めたが写しを保存できなかった: ' + error.message.slice(0, 120) };
  }

  return { audits: [], note: page.rows.length + '名の写しを残した' };
}

/**
 * ★★★ 試し打ちの本体（第43便）。
 *   駅ちかから読んだページ ＋ フクエスの出勤 → 「送るとこうなる」を組み立てるだけ。
 *   ★ 送らない。積まない。**この関数の出口に駅ちかへの通信は無い。**
 *
 * ★ 7日窓の起点は【こちらの今日（Asia/Tokyo）】。
 *   駅ちか側の先頭がこことずれていたら buildWorkPlan が date_shifted で止める。
 */
/**
 * ★★★ エステラブの名簿を読めたあと、フクエスの出勤と突き合わせて「送るとこうなる」を組み立てる（第80便）。
 *
 * ★★ この便では **1件も送らない**。組み立てて、監査ログに残すだけ。
 *   駅ちかで踏んだ順番（第43便 試し打ち → 第46便 送信）を、エステラブでも踏む。
 *   ★ 先に「何が送られるか」を人が見られる状態を作る。
 *
 * ★ 判断そのものは src/lib/esulovePlan.ts（純粋関数・自己点検あり）が持つ。
 *   ここは【DBを読んで渡し、結果を記録する】だけ。
 */
async function planEsulove(
  params: { salonId: number; provider: string; slot: number },
  rosterRows: EsuloveTherapistRow[],
  ctx: RelayFlowContext,
): Promise<{ audits: FlowAudit[]; note: string }> {
  const flowId = ctx.flowId;
  const supabase = createServiceClient();
  const todayISO = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // Asia/Tokyo

  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, name')
    .eq('salon_id', params.salonId)
    .eq('is_active', true);
  if (thErr) {
    return {
      audits: [{
        event: 'plan_work',
        outcome: 'failed',
        summary: 'エステラブへ送る内容を組み立てられませんでした（フクエス側の読み取りに失敗）',
        detail: { reason: 'therapists_read_failed', flowId },
      }],
      note: 'セラピストを読めなかった: ' + thErr.message,
    };
  }

  const people = ((therapists ?? []) as Array<{ id: number; name: string | null }>)
    .map((t) => ({ therapistId: t.id, name: String(t.name ?? '') }))
    .filter((t) => t.name.length > 0);

  const ids = people.map((t) => t.therapistId);
  const lastISO = addDaysISO(todayISO, WORK_DAYS - 1);
  const { data: sched, error: schErr } = ids.length
    ? await supabase
        .from('therapist_schedules')
        .select('therapist_id, schedule_date, is_active, start_time, end_time')
        .in('therapist_id', ids)
        .gte('schedule_date', todayISO)
        .lte('schedule_date', lastISO)
    : { data: [] as unknown[], error: null };
  if (schErr) {
    return {
      audits: [{
        event: 'plan_work',
        outcome: 'failed',
        summary: 'エステラブへ送る内容を組み立てられませんでした（出勤の読み取りに失敗）',
        detail: { reason: 'schedules_read_failed', flowId },
      }],
      note: '出勤を読めなかった: ' + schErr.message,
    };
  }

  const shifts = ((sched ?? []) as Array<Record<string, unknown>>).map((r) => ({
    therapistId: r['therapist_id'] as number,
    dateISO: String(r['schedule_date']),
    active: r['is_active'] === true,
    start: typeof r['start_time'] === 'string' ? r['start_time'].slice(0, 5) : null,
    end: typeof r['end_time'] === 'string' ? r['end_time'].slice(0, 5) : null,
  }));

  const plan = planEsuloveWork({
    roster: rosterRows.map((r) => ({ castId: r.castId, name: r.name })),
    therapists: people,
    shifts,
  });

  // ★ 監査ログには件数と1行だけ。★ 名前を入れない（scrubAuditDetail と同じ考え）
  return {
    audits: [{
      event: 'plan_work',
      // ★★ 送らないので 'ok' とは言わない。★ 組み立てただけ＝ 'stopped'（判断して止めた）。
      //   ★ 'ok' にすると、店舗の画面で「反映できました」と読める文になる。
      outcome: 'stopped',
      summary: 'エステラブへの反映内容を組み立てました（まだ送っていません）。' + plan.summary,
      detail: {
        rows: plan.rows.length,
        blocked: plan.blocked.length,
        notes: plan.notes.length,
        roster: rosterRows.length,
        targets: people.length,
        flowId,
      },
    }],
    note: plan.summary,
  };
}

async function planWork(
  params: { salonId: number; provider: string; slot: number },
  page: WorkPage,
  ctx: RelayFlowContext,
): Promise<{ audits: FlowAudit[]; note: string; next?: FlowNextRequest }> {
  const flowId = ctx.flowId;
  // ★ 送る intent は2つ（第48便）。work_auto は人が見ずに送る。
  const pushing = ctx.intent === 'work_push' || ctx.intent === 'work_auto';
  //   ★★ 無人かどうかで見張りの強さが変わる（設計メモ §56）。緩くはならない
  const unattended = ctx.intent === 'work_auto';
  const supabase = createServiceClient();
  const todayISO = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // Asia/Tokyo

  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, import_cast_id')
    .eq('salon_id', params.salonId);
  if (thErr) {
    return {
      audits: [{
        event: 'plan_work',
        outcome: 'failed',
        summary: '反映する内容を組み立てられませんでした（フクエス側の読み取りに失敗）',
        detail: { reason: 'therapists_read_failed' },
      }],
      note: 'セラピストを読めなかった: ' + thErr.message,
    };
  }

  const rows = (therapists ?? []) as Array<{ id: number; import_cast_id?: string | null }>;
  const { maps, error: castErr } = await loadCastIds(supabase, {
    therapists: rows,
    provider: params.provider,
    slot: params.slot,
  });
  if (castErr) {
    return {
      audits: [{
        event: 'plan_work',
        outcome: 'failed',
        summary: '反映する内容を組み立てられませんでした（媒体の番号を読めませんでした）',
        detail: { reason: 'cast_ids_read_failed' },
      }],
      note: '媒体IDを読めなかった: ' + castErr,
    };
  }

  // ★ null を落として「番号が分かっている子」だけにする。
  //   null のまま渡すと「番号がある」と誤解する形になる（型で防ぐ）。
  const castIdOf = new Map<number, string>();
  for (const [tid, cid] of maps.castIdOf) if (cid) castIdOf.set(tid, cid);

  const ids = rows.map((t) => t.id);
  const lastISO = addDaysISO(todayISO, WORK_DAYS - 1);
  const { data: sched, error: schErr } = ids.length
    ? await supabase
        .from('therapist_schedules')
        .select('therapist_id, schedule_date, is_active, start_time, end_time')
        .in('therapist_id', ids)
        .gte('schedule_date', todayISO)
        .lte('schedule_date', lastISO)
    : { data: [] as unknown[], error: null };
  if (schErr) {
    return {
      audits: [{
        event: 'plan_work',
        outcome: 'failed',
        summary: '反映する内容を組み立てられませんでした（出勤の読み取りに失敗）',
        detail: { reason: 'schedules_read_failed' },
      }],
      note: '出勤を読めなかった: ' + schErr.message,
    };
  }

  const shifts: FukuesShift[] = ((sched ?? []) as Array<Record<string, unknown>>).map((r) => ({
    therapistId: r['therapist_id'] as number,
    dateISO: String(r['schedule_date']),
    active: r['is_active'] === true,
    start: typeof r['start_time'] === 'string' ? r['start_time'].slice(0, 5) : null,
    end: typeof r['end_time'] === 'string' ? r['end_time'].slice(0, 5) : null,
  }));

  const plan = buildWorkPlan({ page, todayISO, shifts, castIdOf, unattended });
  const s = summarizePlan(plan);

  // ★★★ 計画そのものを保存する（第44便）。件数だけでは人は承認できない。
  //   ★ 店舗×媒体×枠で1件だけ持つ（上書き）。送っていない計画を貯めない。
  //   ★ ここが失敗しても本筋（監査ログ）は止めない。ただし黙らない。
  const { error: planErr } = await supabase.from('media_work_plans').upsert(
    {
      salon_id: params.salonId,
      provider: params.provider,
      slot: params.slot,
      flow_id: flowId,
      created_at: new Date().toISOString(),
      sendable: plan.ok,
      targets: plan.targets,
      active_shifts: plan.activeShifts,
      change_count: plan.changes.length,
      field_count: plan.fieldCount,
      // ★ 承認ボタンはこの値を「承認した内容」として持ち回す（第46便）
      fingerprint: planFingerprint(plan),
      date_labels: plan.dateLabels,
      counts_before: plan.countsBefore,
      counts_after: plan.countsAfter,
      diff: plan.diff,
      blockers: plan.blockers,
      notes: plan.notes,
    },
    { onConflict: 'salon_id,provider,slot' },
  );
  if (planErr) console.error('[relay] 反映内容を保存できなかった', planErr.message);

  const planAudit: FlowAudit = {
    event: 'plan_work',
    // ★ 止めたことは 'failed'（こちらの不具合）ではなく 'stopped'（判断して止めた）
    outcome: plan.ok ? 'ok' : 'stopped',
    summary: s.summary,
    detail: s.detail,
  };

  // ── ここまで試し打ちと共通。以下は送る側だけ（第46便）──────────────────
  if (!pushing) {
    return {
      audits: [planAudit],
      note:
        '試し打ちを組み立てた（送っていない）: 変更' +
        plan.changes.length +
        '件 / 送信項目' +
        plan.fieldCount +
        '件 / 止めた理由' +
        plan.blockers.length +
        '件',
    };
  }

  // ★★★ 承認された内容と、いま組み立てた内容が同じか。
  //   違えば **送らない**。人が見て承認したのは前の内容であって、いまの内容ではない。
  //
  // ★★ 自動反映（work_auto）はここを通らない（第48便・設計メモ §53）。
  //   人が見た内容が存在しないので、いま組んだ計画と照合しても【必ず一致する】＝何も検証していない。
  //   ★ 通ることが分かっている検査は、検査ではなく飾りになる。だから置かない。
  //   ★ そのぶんの担保は上の buildWorkPlan(unattended: true) が持っている。
  const fingerprint = planFingerprint(plan);
  if (!unattended && fingerprint !== (ctx.approvedFingerprint ?? '')) {
    return {
      audits: [
        {
          event: 'plan_work',
          outcome: 'stopped',
          summary:
            'ご確認いただいた内容から変わっていたため、送らずに止めました。' +
            'いまの内容をもう一度ご確認ください',
          detail: { reason: 'plan_changed', changes: plan.changes.length },
        },
      ],
      note: '承認時と指紋が違うので送らない',
    };
  }

  // ★ 止める理由があるなら送らない（0件・急減・上限超えなど）。
  if (!plan.ok) {
    return { audits: [planAudit], note: '止める理由があるので送らない' };
  }

  // ★ 送るものが無いなら送らない。全件上書きのフォームを、意味なく投げない。
  if (plan.changes.length === 0) {
    return { audits: [planAudit], note: '変更が無いので送らない' };
  }

  // ★★ ここまで来て初めて書き込みを組み立てる。
  //   assertWithinInputVars は buildWriteWorkRequest の中でもう一度通る。
  let write: ReturnType<typeof buildWriteWorkRequest>;
  try {
    write = buildWriteWorkRequest(page, plan.sent, ctx.cookie);
  } catch (e) {
    return {
      audits: [
        {
          event: 'write_work',
          outcome: 'stopped',
          summary: '駅ちかへ送る内容を組み立てられなかったため、送りませんでした',
          detail: { reason: 'build_failed' },
        },
      ],
      note: '書き込みを組み立てられなかった: ' + (e as Error).message.slice(0, 200),
    };
  }

  // ★ 承認して送るので、画面に残っていた計画は消す。
  //   ★★ 残すと「送ったあとの画面に、送る前の差分が出ている」ことになる。
  await supabase
    .from('media_work_plans')
    .delete()
    .eq('salon_id', params.salonId)
    .eq('provider', params.provider)
    .eq('slot', params.slot);

  return {
    audits: [],   // ★ 送る前に監査ログを書かない。成否は照合してから（afterVerifyWork）
    note: '承認された内容と一致したので送る（変更' + plan.changes.length + '件）',
    next: {
      purpose: 'write_work',
      method: write.method,
      url: write.url,
      headers: write.headers,
      body: write.body,
      context: {
        ...ctx,
        sentPacked: encodeGirlWork(plan.sent),
        sentCount: plan.sent.length,
        expectedDateLabels: plan.dateLabels,
        changeCount: plan.changes.length,
      },
    },
  };
}

async function writeAudits(
  params: { salonId: number; provider: string; slot: number; jobId: string },
  audits: FlowAudit[],
  context: RelayFlowContext,
): Promise<void> {
  for (const a of audits) {
    await recordMediaAudit({
      salonId: params.salonId,
      provider: params.provider,
      slot: params.slot,
      event: a.event,
      outcome: a.outcome,
      ...(a.summary ? { summary: a.summary } : {}),
      detail: { ...(a.detail ?? {}), intent: context.intent },
      actor: 'system',
      jobId: params.jobId,
    });
  }
}

/**
 * 認証情報の行に「最後にうまくいった時刻」「直近の失敗理由」を残す。
 * ★ 失敗しても is_enabled は触らない。店舗の設定をこちらの判断で書き換えない。
 * ★ last_error に平文の秘密を入れないこと（画面に出る）。ここに入れるのは
 *   純粋関数が組み立てた店舗向けの1行だけ。
 */
async function stampCredential(
  params: { salonId: number; provider: string; slot: number },
  kind: 'next' | 'done' | 'stop',
  audits: FlowAudit[],
): Promise<void> {
  if (kind === 'next') return; // まだ途中。何も確定していない

  const supabase = createServiceClient();
  const patch =
    kind === 'done'
      ? { last_verified_at: new Date().toISOString(), last_error: null }
      : { last_error: shopFacingReason(params, audits) };

  const { error } = await supabase
    .from('salon_media_credentials')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('salon_id', params.salonId)
    .eq('provider', params.provider)
    .eq('slot', params.slot);

  // ★ ここが失敗しても本筋は止めない。ただし黙らない
  if (error) console.error('[relay] 認証情報の状態を更新できなかった', error.message);
}

/**
 * 店舗の画面に出す1行を選ぶ。
 * ★★ 内部の note（原因追跡用）を使わないこと。あそこには駅ちかのURLや
 *   パーサの生のメッセージが混ざる。★ last_error は店舗が読む場所。
 */
function shopFacingReason(
  params: { provider: string; slot: number },
  audits: FlowAudit[],
): string {
  const failed = [...audits].reverse().find((a) => a.outcome !== 'ok');
  if (!failed) return '処理を最後まで進められませんでした';
  return (
    failed.summary ??
    defaultAuditSummary({
      event: failed.event,
      outcome: failed.outcome,
      provider: params.provider,
      slot: params.slot,
      detail: failed.detail ?? null,
    })
  ).slice(0, 300);
}

// ────────────────────────── 写メ日記の反映（第95便）──────────────────────────
//
// ★★★ ここが「読むだけ」から「フクエス側に書く」へ変わる場所。★ 駅ちかへは相変わらず何も書かない。
//
// ★★ 記録（salon_diary_imports）の意味を、ここでも崩さない:
//   行が無い          … まだ取り込んでいない  → 次の周で取りに行く
//   imported          … 取り込んだ（post が null なら店舗様が消した）→ ★ 二度と開かない
//   skipped:private   … 駅ちかで非公開        → 1日1回だけ開き直す（§375）
//   skipped:no_match  … 当たるセラピストが居ない → 1日1回だけ開き直す
//   skipped:unreadable… 読み取れなかった1件    → 1日1回だけ開き直す（★ 第94便で足した）

/** 写メ日記の上限。★ メール受信の口（resend-inbound）と同じ値にそろえる。別の上限を作らない。 */
const DIARY_MAX_TITLE_LEN = 100;
const DIARY_MAX_CONTENT_LEN = 5000;
const DIARY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DIARY_BUCKET = 'diary-images';
const DIARY_IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type DiaryStep = { audits: FlowAudit[]; note: string; next?: FlowNextRequest | null };

/** 記録の1行を書く（無ければ作る）。★ 主キーは 店舗×媒体×枠×日記ID。 */
async function markDiary(
  params: { salonId: number; provider: string; slot: number },
  input: {
    diaryId: string;
    status: string;
    therapistId?: number | null;
    diaryPostId?: string | null;
    postedAt?: string | null;
  },
): Promise<string | null> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from('salon_diary_imports').upsert(
    {
      salon_id: params.salonId,
      provider: params.provider,
      slot: params.slot,
      external_diary_id: input.diaryId,
      status: input.status,
      therapist_id: input.therapistId ?? null,
      diary_post_id: input.diaryPostId ?? null,
      posted_at: input.postedAt ?? null,
      // ★ 最後に見に行った時刻。★ 見送った行は、ここから24時間で開き直す（§375）
      checked_at: now,
      // ★★ imported_at は【取り込んだ時刻】。★ 見送りの周で上書きしない（§376・混ぜない）。
      //   ★ 見送りの行では「その行を作った時刻」が既定で入るだけ。★ 開き直すたびに動かさない
      ...(input.status === 'imported' ? { imported_at: now } : {}),
    },
    { onConflict: 'salon_id,provider,slot,external_diary_id' },
  );
  return error ? error.message : null;
}

/** 次の1件を積む。★ 残りが無ければ null（＝そこでフローは終わり）。 */
function nextDiaryJob(ctx: RelayFlowContext): FlowNextRequest | null {
  const queue = Array.isArray(ctx.diaryQueue) ? ctx.diaryQueue : [];
  const head = queue[0];
  if (!head) return null;
  const rest = queue.slice(1);
  return buildReadDiaryDetailRequest({ ...ctx, diaryQueue: rest }, head.id, head.postedAt);
}

/**
 * 一覧を読めた。★ どれを開くかを決める。
 *
 * ★★★ ここで DB を読む理由: 「もう取り込んだか」「いつ見たか」は DB にしか無い（§369・§375）。
 * ★★ 通常運転（diarySince なし）は **1ページ目だけ**。★ 遡るのは初回だけ（§371）。
 */
async function planDiaryList(
  params: { salonId: number; provider: string; slot: number },
  page: EkichikaDiaryListPage,
  pageNumber: number,
  ctx: RelayFlowContext,
): Promise<DiaryStep> {
  const supabase = createServiceClient();

  // ★★★ 一覧を読めた（第100便）。★★ 新着が無くても、ここで必ず心拍を刻む。
  //   ★ 「取り込めたときだけ刻む」形にすると salon_diary_imports と同じものになり、
  //     「新着が無かった」と「巡回が止まっている」が また見分けられなくなる。
  await stampDiaryListed(
    { salonId: params.salonId, provider: params.provider, slot: params.slot },
    pageNumber + 'ページ目・' + page.rows.length + '件',
  );

  // 1. この店の記録を読む（★ 取り込み済み・見送り済みの一覧）
  const { data: rows, error } = await supabase
    .from('salon_diary_imports')
    .select('external_diary_id, status, checked_at')
    .eq('salon_id', params.salonId)
    .eq('provider', params.provider)
    .eq('slot', params.slot);
  if (error) {
    // ★★ 記録が読めないまま進むと、取り込み済みをもう一度入れてしまう。★ ここは止める
    return {
      audits: [
        {
          event: 'read_diary_list',
          outcome: 'failed',
          summary: '写メ日記の取り込み記録を読めませんでした。二重取り込みを避けるため中止しました',
          detail: { reason: 'known_read_error', page: pageNumber, flowId: ctx.flowId },
        },
      ],
      note: '★ 取り込み済みの記録を読めなかったので進めない: ' + error.message.slice(0, 120),
      next: null,
    };
  }

  const known: KnownDiary[] = (rows ?? []).map((r) => ({
    diaryId: String((r as { external_diary_id: string }).external_diary_id),
    status: String((r as { status?: string }).status ?? 'imported'),
    checkedAt: ((r as { checked_at?: string | null }).checked_at ?? null) as string | null,
  }));

  // 2. 開くものを決める（★ 判断は純粋関数）
  const plan = selectDiariesToFetch(page, {
    known,
    since: ctx.diarySince ?? null,
    now: new Date().toISOString(),
  });

  const queue: DiaryQueueItem[] = [
    ...(Array.isArray(ctx.diaryQueue) ? ctx.diaryQueue : []),
    ...plan.fetch.map((r) => ({ id: r.diaryId, postedAt: r.postedAt })),
  ];

  // 3. まだ遡るか（★ 初回だけ。★ 止める条件は3つとも純粋関数の中）
  const pagesLeft = Number.isFinite(ctx.diaryPagesLeft) ? Number(ctx.diaryPagesLeft) : 0;
  const paging = ctx.diarySince
    ? planDiaryPaging({
        pageNumber,
        pageNumbers: page.pageNumbers,
        skippedOldCount: plan.skippedOld.length,
        pagesLeft,
      })
    : { next: null, reason: '通常運転なので1ページ目だけ読む（§371）' };

  const base: RelayFlowContext = { ...ctx, diaryQueue: queue };

  if (paging.next !== null) {
    return {
      audits: [],
      note:
        pageNumber + 'ページ目で ' + plan.fetch.length + '件を積んだ（開く予定 ' + queue.length +
        '件）。★ ' + paging.reason,
      next: buildReadDiaryListRequest({ ...base, diaryPagesLeft: pagesLeft - 1 }, paging.next),
    };
  }

  const next = nextDiaryJob(base);
  if (!next) {
    return {
      audits: [],
      note:
        '新しい写メ日記はありませんでした（取り込み済み ' + plan.skippedDone.length +
        '件・待ち ' + plan.skippedWaiting.length + '件・期間外 ' + plan.skippedOld.length +
        '件）。★ ' + paging.reason,
      next: null,
    };
  }
  return {
    audits: [],
    note:
      '開く写メ日記は ' + queue.length + '件' +
      (plan.deferred.length > 0 ? '（★ あと ' + plan.deferred.length + '件は次の周へ）' : '') +
      '。★ ' + paging.reason,
    next,
  };
}

/**
 * 写真を取ってきて diary-images に保存する。
 *
 * ★★★ 取れなくても **日記そのものは入れる**。★ 写真の失敗で本文まで落とさない。
 * ★★ 到達性は 2026-09-01 時点で **未測定**（測ろうとしたが、こちら側の事情で測れなかった）。
 *   ★ だから「落とせた／落とせなかった」を必ず note に残す。★ 1店1日流せば本番の記録で分かる。
 */
async function fetchDiaryImage(
  url: string,
  therapistId: number,
  diaryId: string,
): Promise<{ publicUrl: string | null; note: string }> {
  try {
    const res = await fetch(url, {
      // ★ 相手のS3。★ Cookie も認証も付けない（公開URL）
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!res.ok) return { publicUrl: null, note: '写真を取れなかった（' + res.status + '）' };

    const contentType = String(res.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
    const ext = DIARY_IMAGE_EXT[contentType];
    if (!ext) return { publicUrl: null, note: '写真の種類が想定外（' + (contentType || '不明') + '）' };

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return { publicUrl: null, note: '写真が空だった' };
    if (buf.byteLength > DIARY_MAX_IMAGE_BYTES) {
      return { publicUrl: null, note: '写真が大きすぎた（' + buf.byteLength + 'バイト）' };
    }

    const supabase = createServiceClient();
    // ★ 同じ日記を入れ直しても同じ場所になる名前にする（★ 二重取り込みは記録側で防ぐが、名前でも重ねない）
    const path = therapistId + '/ekichika_' + diaryId + '.' + ext;
    const { error: upErr } = await supabase.storage
      .from(DIARY_BUCKET)
      .upload(path, buf, { contentType, upsert: true });
    if (upErr) return { publicUrl: null, note: '写真を保存できなかった: ' + upErr.message.slice(0, 80) };

    const { data } = supabase.storage.from(DIARY_BUCKET).getPublicUrl(path);
    return { publicUrl: data.publicUrl, note: '写真1枚' };
  } catch (e) {
    // ★★ ここが「フクエスから直接落とせるか」の答えが出る場所。★ 握りつぶさない
    return { publicUrl: null, note: '写真を取りに行けなかった: ' + String((e as Error).message).slice(0, 80) };
  }
}

/**
 * 日記1件を反映する。
 *
 * ★★★ どの道を通っても【記録を1行残してから次へ進む】。
 *   ★ 記録を残さずに次へ行くと、次の周で同じ日記をまた開く（永久に同じ所で足踏みする）。
 */
async function saveDiaryDetail(
  params: { salonId: number; provider: string; slot: number },
  detail: EkichikaDiaryDetail,
  diaryId: string,
  ctx: RelayFlowContext,
): Promise<DiaryStep> {
  const postedAt = ctx.diaryPostedAt ?? null;
  const next = nextDiaryJob(ctx);
  const done = (note: string, audits: FlowAudit[] = []): DiaryStep => ({ audits, note, next });

  // ① 読めなかった1件（★ 第94便の決めごと。★ 店ごと止めない）
  if (!diaryDetailUsable(detail)) {
    const err = await markDiary(params, { diaryId, status: 'skipped:unreadable', postedAt });
    return done(
      '日記 ' + diaryId + ' は読み取れなかったので見送った（1日後にもう一度開く）' +
        (err ? '。★ 記録も残せなかった: ' + err.slice(0, 80) : ''),
    );
  }

  // ② 駅ちかで非公開（★ こちらで公開しない・設計メモ §6②）
  if (detail.isPublic !== true) {
    const err = await markDiary(params, { diaryId, status: 'skipped:private', postedAt });
    return done(
      '日記 ' + diaryId + ' は駅ちかで非公開なので取り込まなかった（1日後にもう一度見る）' +
        (err ? '。★ 記録を残せなかった: ' + err.slice(0, 80) : ''),
    );
  }

  // ③ 誰の日記か（★ castId だけで照合する・§367。★ 名前では照合しない）
  const supabase = createServiceClient();
  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, import_cast_id')
    .eq('salon_id', params.salonId);
  if (thErr) return done('★ 在籍を引けなかったので日記 ' + diaryId + ' は保留: ' + thErr.message.slice(0, 80));

  const { maps, error: castErr } = await loadCastIds(supabase, {
    therapists: (therapists ?? []) as Array<{ id: number; import_cast_id?: string | null }>,
    provider: params.provider,
    slot: params.slot,
  });
  if (castErr) return done('★ 媒体側の番号を引けなかったので日記 ' + diaryId + ' は保留: ' + castErr.slice(0, 80));

  const therapistId = detail.castId ? maps.byCastId.get(detail.castId) ?? null : null;
  if (!therapistId) {
    const err = await markDiary(params, { diaryId, status: 'skipped:no_match', postedAt });
    return done(
      '日記 ' + diaryId + ' に当たるセラピストがフクエスに居ない（1日後にもう一度見る）' +
        (err ? '。★ 記録を残せなかった: ' + err.slice(0, 80) : ''),
    );
  }

  // ④ 写真（★ 取れなくても本文は入れる）
  let images: string[] = [];
  let imageNote = '写真なし';
  if (detail.imageUrl) {
    const img = await fetchDiaryImage(detail.imageUrl, therapistId, diaryId);
    imageNote = img.note;
    if (img.publicUrl) images = [img.publicUrl];
  }

  // ⑤ 日記そのもの
  const title = (detail.title ?? '').slice(0, DIARY_MAX_TITLE_LEN) || null;
  const content = detail.bodyText.slice(0, DIARY_MAX_CONTENT_LEN);
  const { data: inserted, error: insErr } = await supabase
    .from('diary_posts')
    .insert({
      therapist_id: therapistId,
      salon_id: params.salonId,
      images,
      title,
      content,
      // ★★ 並び順は【駅ちかに載った日時】にそろえる。★ 取り込んだ日時で並べると、
      //   初回の40日ぶんを流した日に、40日ぶんが全部「今日」の日記として並んでしまう。
      ...(postedAt ? { created_at: postedAt } : {}),
    })
    .select('id')
    .single();
  if (insErr) {
    // ★★ 記録は残さない。★ 入っていないのに「取り込んだ」と書くと、二度と取りに行かなくなる
    return done('★ 日記 ' + diaryId + ' を保存できなかった（次の周でもう一度）: ' + insErr.message.slice(0, 80));
  }

  const diaryPostId = String((inserted as { id: string }).id);
  const err = await markDiary(params, {
    diaryId,
    status: 'imported',
    therapistId,
    diaryPostId,
    postedAt,
  });
  if (err) {
    // ★★★ 日記は入ったが記録が残らなかった＝次の周でもう1件入る（二重）。★ 黙らない
    console.error('[diary] 取り込みの記録を残せなかった', params.salonId, diaryId, err);
  }

  return done(
    '日記 ' + diaryId + ' を取り込んだ（' + imageNote + '）' +
      (err ? '。★★ 記録を残せなかった（次の周で二重になるおそれ）: ' + err.slice(0, 80) : ''),
    [
      {
        event: 'read_diary_detail',
        outcome: 'ok',
        summary: '駅ちかの写メ日記を1件フクエスに取り込みました',
        detail: { hasImage: images.length > 0, imported: true, flowId: ctx.flowId },
      },
    ],
  );
}

/** 初回の遡りを始めるときの文脈（★ 呼び出し側が使う）。 */
export function diaryBackfillContext(input: {
  since: string;
  maxPages?: number;
}): Pick<RelayFlowContext, 'diarySince' | 'diaryPagesLeft'> {
  const n = Number(input.maxPages);
  return {
    diarySince: input.since,
    diaryPagesLeft: Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), DIARY_MAX_PAGES) : DIARY_MAX_PAGES,
  };
}

// ────────────────────── エステ魂の写メ日記（第133便・2026-09-04） ──────────────────────

/**
 * ★ 何件ぶんの日記を見に行くか。★ 店ぶんまとめて新しい順に読む。
 *   ★ ここを無制限にすると、日記の多い店で毎周ずっしり読むことになる。
 */
const DIARY_SCAN_LIMIT = 200;

/**
 * ★★★ 自動で選ぶときの上限（日）。★ 古い記事を今日の日付で出さない。
 *   ★ 連携を始めた日に、何年も前の日記が本人のアカウントから出たら事故。
 *   ★★ 運営の口が diaryId を名指ししたときは【この上限を通さない】（人が選んだものなので）。
 */
const DIARY_MAX_AGE_DAYS = 14;

/**
 * ★★★ 誰のどの日記をエステ魂へ送るかを決める（第133便）。
 *
 * ★ 判断そのものは src/lib/esutamaDiaryPlan.ts（純粋関数）が持つ。
 *   ここは DB から材料を集めて渡し、決まったことを実行するだけ。
 *
 * ★★★ diary_dryrun … ここで終わり。**代理ログインもしない・1文字も書かない。**
 * ★★★ diary_push   … **1人だけ。** ★ 送る前に印を立て、token 発行の段を積む。
 */
async function planEsutamaDiary(
  params: { salonId: number; provider: string; slot: number },
  mediaRows: Array<{ castId: string; name: string; state: string }>,
  ctk: string | null,
  ctx: RelayFlowContext,
): Promise<{ audits: FlowAudit[]; note: string; next?: FlowNextRequest }> {
  const flowId = ctx.flowId;
  const supabase = createServiceClient();
  const push = ctx.intent === 'diary_push';

  // ★ 読めなかったことを「0件」と見せない（引き継ぎメモ 3-5）。★ 必ず理由を返す
  const fail = (reason: string, note: string): { audits: FlowAudit[]; note: string } => ({
    audits: [{
      event: 'plan_diary', outcome: 'failed',
      summary: 'お送りする写メ日記を確認できませんでした（' + note + '）',
      detail: { reason, flowId },
    }],
    note,
  });

  // ⓪ ★★★ 店舗の関門。★ **正本がフクエスの店舗にしか送らない**（第133-3便）
  //   ★ link_mode='none' だけに頼らない。★ 画面で 'write' に変えられたら素通りしてしまう。
  //   ★★ 取り込んだ日記を送り返すと、ベンリー経由の記事と2本並ぶ。★ しかも消せない。
  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('diary_source')
    .eq('id', params.salonId)
    .maybeSingle();
  if (salonErr || !salon) return fail('salon_read_failed', '店舗を読めなかった: ' + (salonErr?.message ?? 'not found'));
  const gate = checkSalonDiarySource(salon.diary_source as string | null);
  if (!gate.ok) {
    return {
      audits: [{
        event: 'plan_diary', outcome: 'stopped',
        summary: gate.message,
        detail: { reason: 'diary_source_not_fukues', source: String(salon.diary_source ?? ''), flowId },
      }],
      note: '★ ' + gate.message,
    };
  }

  // ① 在籍
  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, name, import_cast_id')
    .eq('salon_id', params.salonId)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (thErr) return fail('therapists_read_failed', 'セラピストを読めなかった: ' + thErr.message);
  const trows = (therapists ?? []) as Array<{ id: number; name: string | null; import_cast_id?: string | null }>;
  const ids = trows.map((t) => t.id);

  // ② 名簿の結び（therapist_media_ids）。★ 名前では突き合わせない
  const { maps, error: castErr } = await loadCastIds(supabase, {
    therapists: trows, provider: params.provider, slot: params.slot,
  });
  if (castErr) return fail('cast_ids_read_failed', '名簿の結びを読めなかった: ' + castErr);

  // ③ 了承（★ 読めなかったら「全員未確認」にしない。止める）
  const consentOf = new Map<number, string>();
  if (ids.length > 0) {
    const { data: cs, error: csErr } = await supabase
      .from('therapist_media_consent')
      .select('therapist_id, state')
      .eq('provider', params.provider)
      .eq('kind', 'diary')
      .in('therapist_id', ids);
    if (csErr) return fail('consent_read_failed', '了承の記録を読めなかった: ' + csErr.message);
    for (const r of (cs ?? []) as Array<{ therapist_id: number; state: string | null }>) {
      consentOf.set(Number(r.therapist_id), String(r.state ?? 'unknown'));
    }
  }

  // ④ 日記（新しい順）
  type DiaryRow = { id: string; therapist_id: number; created_at: string | null };
  let diaries: DiaryRow[] = [];
  if (ids.length > 0) {
    const { data: dp, error: dErr } = await supabase
      .from('diary_posts')
      .select('id, therapist_id, created_at')
      .in('therapist_id', ids)
      .order('created_at', { ascending: false })
      .limit(DIARY_SCAN_LIMIT);
    if (dErr) return fail('diary_read_failed', '写メ日記を読めなかった: ' + dErr.message);
    diaries = ((dp ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r['id']), therapist_id: Number(r['therapist_id']),
      created_at: (r['created_at'] as string | null) ?? null,
    }));
  }

  // ⑤ 送った印
  const sentSet = new Set<string>();
  if (diaries.length > 0) {
    const { data: sent, error: sErr } = await supabase
      .from('diary_post_sent')
      .select('diary_id')
      .eq('provider', params.provider)
      .eq('slot', params.slot)
      .in('diary_id', diaries.map((d) => d.id));
    // ★★★ 印を読めないまま送ると【二度送る】。★ 読めなければ必ず止まる
    if (sErr) return fail('sent_read_failed', '送った印を読めなかった: ' + sErr.message);
    for (const r of (sent ?? []) as Array<{ diary_id: string }>) sentSet.add(String(r.diary_id));
  }

  // ⑥ 材料をまとめる
  const cutoff = Date.now() - DIARY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const named = String(ctx.esutamaDiaryPostId ?? '').trim();
  const candidates: DiaryCandidate[] = trows.map((t) => {
    const mine = diaries.filter((d) => d.therapist_id === t.id);
    const unsent = mine
      .filter((d) => !sentSet.has(d.id))
      // ★ 名指しされた1件は上限を通さない（人が選んだもの）。★ それ以外は新しいものだけ
      .filter((d) => d.id === named || (d.created_at ? Date.parse(d.created_at) >= cutoff : false))
      .map((d) => d.id);
    // ★★ 名指しがあれば必ず先頭へ（★ 「一番新しい」より人の指定を優先する）
    const ordered = named && unsent.includes(named) ? [named, ...unsent.filter((x) => x !== named)] : unsent;
    return {
      therapistId: t.id,
      name: String(t.name ?? ''),
      consent: toConsentState(consentOf.get(t.id)),
      castId: maps.castIdOf.get(t.id) ?? null,
      unsentDiaryIds: ordered,
      hasAnyDiary: mine.length > 0,
    };
  });

  const rows = planEsutamaDiaries({
    candidates,
    activeCastIds: mediaRows.map((r) => r.castId),
    listRead: true,
  });
  const tally = tallyDiaryPlan(rows);
  const summary = diaryPlanSummary(tally);

  const planAudit: FlowAudit = {
    event: 'plan_diary',
    outcome: 'ok',
    summary,
    detail: {
      people: tally.母数, sendable: tally.送れる, sent: tally.送信済み, noDiary: tally.日記がまだ,
      notAgreed: tally.了承なし, notStarted: tally.未開始, accountUnknown: tally.利用状況が不明,
      noCastId: tally.名簿未結び, active: mediaRows.length, hasCtk: !!ctk, flowId,
    },
  };

  // ★★★ 下見はここで終わり。★ エステ魂へ何も飛ばない
  if (!push) return { audits: [planAudit], note: summary + '（★ 下見なので何も送っていません）' };

  // ────── ここから実弾（1人だけ）──────

  const wantId = Number(ctx.esutamaDiaryTherapistId ?? 0);
  // ★★★ 相手が指定されていなければ何もしない。★ 「全員に送る」を作らない
  if (!Number.isFinite(wantId) || wantId <= 0) {
    return {
      audits: [planAudit, {
        event: 'push_diary', outcome: 'stopped',
        summary: 'お送りする方が指定されていないため、1通も送りませんでした',
        detail: { reason: 'no_target', flowId },
      }],
      note: summary + ' → ★ 相手が指定されていないので送らない',
    };
  }
  const picked = pickOneToSend(rows, wantId);
  if (!picked.ok) {
    return {
      audits: [planAudit, {
        event: 'push_diary', outcome: 'stopped',
        summary: picked.message, detail: { reason: 'not_sendable', therapistId: wantId, flowId },
      }],
      note: summary + ' → 送らない: ' + picked.message,
    };
  }
  // ★★ ctk が無いと token 発行 POST を組めない。★ 空で投げない
  if (!ctk) {
    return {
      audits: [planAudit, {
        event: 'push_diary', outcome: 'stopped',
        summary: '一覧ページの ctk が見つからなかったため送りませんでした',
        detail: { reason: 'no_ctk', therapistId: wantId, flowId },
      }],
      note: summary + ' → ctk が無いので送らない',
    };
  }

  const row = picked.row;
  const diaryId = String(row.diaryId);
  const castId = String(row.castId ?? '');

  // ⑦ 送る中身を読む
  const { data: dp, error: dpErr } = await supabase
    .from('diary_posts')
    .select('id, therapist_id, title, content, images')
    .eq('id', diaryId)
    .maybeSingle();
  if (dpErr || !dp) {
    return {
      audits: [planAudit, {
        event: 'push_diary', outcome: 'failed',
        summary: '送る写メ日記を読めませんでした', detail: { reason: 'draft_read_failed', therapistId: wantId, flowId },
      }],
      note: summary + ' → 日記を読めなかった',
    };
  }
  // ★★★ 取り違え防止。★ 指定された日記が【その人のもの】であることを必ず確かめる
  if (Number(dp.therapist_id) !== row.therapistId) {
    return {
      audits: [planAudit, {
        event: 'push_diary', outcome: 'stopped',
        summary: '指定された写メ日記が、この方のものではないため送りませんでした',
        detail: { reason: 'therapist_mismatch', therapistId: wantId, flowId },
      }],
      note: summary + ' → 日記の持ち主が違う',
    };
  }
  const title = String((dp.title as string | null) ?? '').trim();
  const content = String((dp.content as string | null) ?? '').trim();
  const images = ((dp.images as string[] | null) ?? []).filter(Boolean).length;
  // ★ 空の記事を本人のアカウントから出さない（★ 純粋関数側でも見ているが、ここで先に止める）
  if (content.length === 0) {
    return {
      audits: [planAudit, {
        event: 'push_diary', outcome: 'stopped',
        summary: '本文が空のため送りませんでした', detail: { reason: 'empty_content', therapistId: wantId, flowId },
      }],
      note: summary + ' → 本文が空なので送らない',
    };
  }

  // ⑧ ★★★ 送る【前】に印を立てる。★ 主キーが二度送りを弾く（第132便）
  const { error: insErr } = await supabase.from('diary_post_sent').insert({
    diary_id: diaryId,
    provider: params.provider,
    slot: params.slot,
    therapist_id: row.therapistId,
    external_cast_id: castId,
  });
  if (insErr) {
    // ★ 23505 = 主キー衝突 ＝ すでに送ってある。★ 故障ではない
    const dup = String((insErr as { code?: string }).code ?? '') === '23505';
    return {
      audits: [planAudit, {
        event: dup ? 'push_diary' : 'diary_mark_set',
        outcome: 'stopped',
        summary: dup
          ? 'この写メ日記はすでにお送りしているため、送りませんでした'
          : '二度送りを防ぐ印を付けられなかったため、送りませんでした',
        detail: { reason: dup ? 'already_sent' : 'mark_failed', therapistId: wantId, flowId },
      }],
      note: summary + (dup ? ' → もう送ってある' : ' → 印を立てられなかった: ' + insErr.message),
    };
  }

  const markAudit: FlowAudit = {
    event: 'diary_mark_set', outcome: 'ok',
    summary: row.name + 'さんの写メ日記に、二度送りを防ぐ印を付けました',
    detail: { therapistId: row.therapistId, castId, flowId },
  };

  // ⑨ token 発行の段を積む。★ ここから相手に状態を作らせる
  const nextCtx: RelayFlowContext = {
    ...ctx,
    esutamaDiaryCastId: castId,
    esutamaDiaryCastName: row.name,
    esutamaDiaryPostId: diaryId,
    esutamaDiaryDraft: { title, content },
    esutamaDiaryMarked: true,
  };
  const step = buildEsutamaDiaryTokenStep(nextCtx, castId, ctk);

  return {
    audits: [planAudit, markAudit],
    note: summary + ' → ' + row.name + 'さんへ1件だけ送ります'
      // ★★ 写真は運ばない。★ 黙って落とさず、必ず書く（第129便で photo_data は空と決めた）
      + (images > 0 ? '（★ 写真' + images + '枚はエステ魂へは送りません）' : ''),
    next: { purpose: step.purpose, method: step.method, url: step.url, headers: step.headers, body: step.body, context: nextCtx },
  };
}

/**
 * ★★★ 送れずに終わったので、送った印を消す（第133便）。
 *
 * ★ 印は送る【前】に立ててある（消せない相手に二度送らないため・第132便）。
 * ★★ 消さないと、その日記は **二度と送れない**。★ 静かな取りこぼしを作らない。
 * ★★★ 消せなかったことも黙らせない。★ 記録に残して、人が気づけるようにする。
 */
async function clearDiaryMark(
  params: { salonId: number; provider: string; slot: number },
  ctx: RelayFlowContext,
): Promise<{ audits: FlowAudit[]; note: string }> {
  const diaryId = String(ctx.esutamaDiaryPostId ?? '').trim();
  if (!diaryId) return { audits: [], note: '' };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('diary_post_sent')
    .delete()
    .eq('diary_id', diaryId)
    .eq('provider', params.provider)
    .eq('slot', params.slot);
  if (error) {
    return {
      audits: [{
        event: 'diary_mark_cleared', outcome: 'failed',
        summary: '送れなかったのに印を外せませんでした。この写メ日記は送信済みの扱いのままです',
        detail: { reason: 'delete_failed', flowId: ctx.flowId },
      }],
      note: '★ 印を消せなかった: ' + error.message,
    };
  }
  return {
    audits: [{
      event: 'diary_mark_cleared', outcome: 'ok',
      summary: '送れなかったため印を外しました（あとでもう一度お送りできます）',
      detail: { flowId: ctx.flowId },
    }],
    note: '印を消した（もう一度送れます）',
  };
}
