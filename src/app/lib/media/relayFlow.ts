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
  newFlowContext,
  type FlowAudit,
  type RelayFlowContext,
  type RelayFlowIntent,
} from '@/lib/relayFlow';
import { loadCastIds } from '@/lib/mediaCastIds';
import { addDaysISO, buildWorkPlan, summarizePlan, type FukuesShift } from '@/lib/workPlan';
import { WORK_DAYS, type WorkPage } from '@/lib/ekichikaWorkParse';

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

  const context = newFlowContext({
    flowId: crypto.randomUUID(),
    intent: params.intent,
    startedAt: new Date().toISOString(),
  });

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

  // ★★★ 試し打ち（第43便）。ここで初めて DB を読む。
  //   純粋関数側（advanceFlow）は「読めた。あとは突き合わせ」までしか言わない。
  //   ★ この枝は **次のジョブを積まない** ＝ 駅ちかへ何も飛ばない。
  if (outcome.kind === 'plan_work') {
    const r = await planWorkDryRun(params, outcome.page, context.flowId);
    audits.push(r.audit);
    note = outcome.note + ' → ' + r.note;
  }

  await writeAudits(params, audits, context);

  // ★ 接続テストの結果を、店舗が画面で見られる形にも残す（last_verified_at / last_error）
  // ★★ 試し打ちは 'done' として扱う。**ログインと読み取りは実際に成功している**ので、
  //   認証情報は健全。計画が止まったことは last_error（＝認証の話）ではなく監査ログに残す。
  //   ここを 'stop' にすると「ログイン情報がおかしい」と読める文が店舗の画面に出てしまう。
  await stampCredential(params, outcome.kind === 'plan_work' ? 'done' : outcome.kind, audits);

  if (outcome.kind !== 'next') return { note };

  const next = outcome.next;
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
async function planWorkDryRun(
  params: { salonId: number; provider: string; slot: number },
  page: WorkPage,
  flowId: string,
): Promise<{ audit: FlowAudit; note: string }> {
  const supabase = createServiceClient();
  const todayISO = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // Asia/Tokyo

  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, import_cast_id')
    .eq('salon_id', params.salonId);
  if (thErr) {
    return {
      audit: {
        event: 'plan_work',
        outcome: 'failed',
        summary: '反映する内容を組み立てられませんでした（フクエス側の読み取りに失敗）',
        detail: { reason: 'therapists_read_failed' },
      },
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
      audit: {
        event: 'plan_work',
        outcome: 'failed',
        summary: '反映する内容を組み立てられませんでした（媒体の番号を読めませんでした）',
        detail: { reason: 'cast_ids_read_failed' },
      },
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
      audit: {
        event: 'plan_work',
        outcome: 'failed',
        summary: '反映する内容を組み立てられませんでした（出勤の読み取りに失敗）',
        detail: { reason: 'schedules_read_failed' },
      },
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

  const plan = buildWorkPlan({ page, todayISO, shifts, castIdOf });
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

  return {
    audit: {
      event: 'plan_work',
      // ★ 止めたことは 'failed'（こちらの不具合）ではなく 'stopped'（判断して止めた）
      outcome: plan.ok ? 'ok' : 'stopped',
      summary: s.summary,
      detail: s.detail,
    },
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
