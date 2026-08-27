// 他媒体連携の監査ログ・書き込みと読み出し（第39便）。
//
// ★★★ このファイルはサーバー専用。service_role で salon_media_audit を触る。
//   クライアントから import しないこと（relayQueue.ts と同じ扱い）。
//
// ★★★ 何を記録するか＝【こちらが本当に知っていること】だけ
//   中継の1往復が 200 で返ったことと、ログインできたことは別の話。
//   HTTPの往復が成功しただけで「ログインしました」と書くと、
//   第37便 §2「ログを置いただけで安心しない」を監査ログでやることになる。
//   → login / read_work / write_work / verify_work は、**応答を解釈した側**
//     （advanceRelayFlow）が記録する。ここでは記録しない。
//   → ここで記録するのは、解釈しなくても確実に分かる終端だけ:
//       ・諦めた（relay_gave_up）
//       ・宛先の検査で止めた（relay_rejected）
//       ・掴まれたまま戻らなかった（relay_expired）
//       ・疎通確認（selftest。認証情報を使っていない）

import { createServiceClient } from '@/app/lib/supabase/service';
import {
  scrubAuditDetail,
  defaultAuditSummary,
  MAX_SUMMARY_LENGTH,
  type AuditDetail,
  type MediaAuditEvent,
  type MediaAuditOutcome,
} from '@/lib/mediaAudit';

export type MediaAuditRow = {
  id: number;
  provider: string;
  slot: number;
  event: string;
  outcome: string;
  summary: string;
  detail: AuditDetail | null;
  actor: string;
  jobId: string | null;
  createdAt: string;
};

/**
 * 監査ログを1行足す。
 *
 * ★★ 記録に失敗しても、本来の処理は止めない。ただし【黙らない】。
 *   監査が書けないことを理由に出勤の更新が落ちると、被害のほうが大きい。
 *   かといって握りつぶすと「記録が無い」＝「何もしていない」と見分けがつかなくなる。
 *   → 例外は投げず、必ず console.error に残す（Vercel のログに出る）。
 *   ★ 戻り値の ok を見れば呼び出し側でも分かるようにしてある。
 */
export async function recordMediaAudit(params: {
  salonId: number;
  provider: string;
  slot: number;
  event: MediaAuditEvent;
  outcome: MediaAuditOutcome;
  /** 省略すると event/outcome から店舗向けの日本語1行を組み立てる */
  summary?: string;
  detail?: AuditDetail | null;
  /** 'system'（cron）/ 'shop:<auth_user_id>' / 'admin:<auth_user_id>' */
  actor?: string;
  jobId?: string | null;
}): Promise<{ ok: boolean; note: string }> {
  const { detail, dropped } = scrubAuditDetail(params.detail);

  // ★ 落としたことを記録に残す。「入れたつもりの値が無い」を後から追えるように
  const finalDetail: AuditDetail | null =
    dropped.length > 0
      ? { ...(detail ?? {}), _droppedKeys: dropped.join(',').slice(0, 120) }
      : detail;

  const summary = (
    params.summary ??
    defaultAuditSummary({
      event: params.event,
      outcome: params.outcome,
      provider: params.provider,
      slot: params.slot,
      detail: finalDetail,
    })
  ).slice(0, MAX_SUMMARY_LENGTH);

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('salon_media_audit').insert({
      salon_id: params.salonId,
      provider: params.provider,
      slot: params.slot,
      event: params.event,
      outcome: params.outcome,
      summary,
      detail: finalDetail,
      actor: params.actor ?? 'system',
      job_id: params.jobId ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    // ★ 投げない・黙らない
    console.error(
      '[mediaAudit] 監査ログを書けなかった',
      JSON.stringify({
        salonId: params.salonId,
        provider: params.provider,
        slot: params.slot,
        event: params.event,
        outcome: params.outcome,
        reason: (e as Error).message.slice(0, 200),
      }),
    );
    return { ok: false, note: '監査ログを書けなかった（本来の処理は続行した）' };
  }

  if (dropped.length > 0) {
    // ★ 秘密になりうるものが detail に渡された。落としてはいるが、渡した側を直すべき
    console.error(
      '[mediaAudit] detail から落としたキーがある（呼び出し側を直すこと）',
      dropped.join(','),
    );
  }

  return { ok: true, note: '記録した' };
}

/**
 * 店舗の画面に出すための読み出し。
 * ★★ salonId は【呼び出し側がログインしている店舗のもの】であること。
 *   この関数は service_role で読むので、salonId をそのまま渡すと他店の記録も読める。
 *   URLパラメータやフォーム値をここへ直接渡さないこと。
 */
export async function listMediaAudit(params: {
  salonId: number;
  limit?: number;
  provider?: string;
  slot?: number;
}): Promise<MediaAuditRow[]> {
  const supabase = createServiceClient();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  let q = supabase
    .from('salon_media_audit')
    .select('id, provider, slot, event, outcome, summary, detail, actor, job_id, created_at')
    .eq('salon_id', params.salonId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.provider) q = q.eq('provider', params.provider);
  if (params.slot !== undefined) q = q.eq('slot', params.slot);

  const { data, error } = await q;
  if (error) throw new Error('監査ログを読めなかった: ' + error.message);

  return (data ?? []).map((r) => ({
    id: r.id as number,
    provider: r.provider as string,
    slot: r.slot as number,
    event: r.event as string,
    outcome: r.outcome as string,
    summary: r.summary as string,
    detail: (r.detail ?? null) as AuditDetail | null,
    actor: r.actor as string,
    jobId: (r.job_id ?? null) as string | null,
    createdAt: r.created_at as string,
  }));
}
