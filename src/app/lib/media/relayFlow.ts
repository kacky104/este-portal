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
import { openContext, unpackBody, type RelayResponse } from '@/lib/relayJob';
import { decryptSecret } from '@/lib/mediaCredentials';
import {
  advanceFlow,
  buildLoginRequest,
  buildWriteWorkRequest,
  newFlowContext,
  type FlowAudit,
  type FlowNextRequest,
  type RelayFlowContext,
  type RelayFlowIntent,
} from '@/lib/relayFlow';
import { loadCastIds } from '@/lib/mediaCastIds';
import { addDaysISO, buildWorkPlan, planFingerprint, summarizePlan, type FukuesShift } from '@/lib/workPlan';
import { WORK_DAYS, encodeGirlWork, type WorkPage } from '@/lib/ekichikaWorkParse';

/** いまフローを組み立てられる媒体。★ 増やすときは buildLoginRequest 側も要る */
const SUPPORTED_PROVIDERS = ['ekichika'] as const;

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

  const login = buildLoginRequest({
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
  };

  const r = await enqueueRelayJob({
    salonId: params.salonId,
    provider: params.provider,
    slot: params.slot,
    purpose: 'login',
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
  if (outcome.kind === 'plan_work') {
    const r = await planWork(params, outcome.page, context);
    audits.push(...r.audits);
    note = outcome.note + ' → ' + r.note;
    next = r.next ?? null;
  }

  await writeAudits(params, audits, context);

  // ★ 接続テストの結果を、店舗が画面で見られる形にも残す（last_verified_at / last_error）
  // ★★ 計画の段は 'done' として扱う。**ログインと読み取りは実際に成功している**ので、
  //   認証情報は健全。計画が止まったことは last_error（＝認証の話）ではなく監査ログに残す。
  //   ここを 'stop' にすると「ログイン情報がおかしい」と読める文が店舗の画面に出てしまう。
  const settle: 'next' | 'done' | 'stop' = next
    ? 'next'
    : outcome.kind === 'plan_work'
      ? 'done'
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
 * ★★★ 試し打ちの本体（第43便）。
 *   駅ちかから読んだページ ＋ フクエスの出勤 → 「送るとこうなる」を組み立てるだけ。
 *   ★ 送らない。積まない。**この関数の出口に駅ちかへの通信は無い。**
 *
 * ★ 7日窓の起点は【こちらの今日（Asia/Tokyo）】。
 *   駅ちか側の先頭がこことずれていたら buildWorkPlan が date_shifted で止める。
 */
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
