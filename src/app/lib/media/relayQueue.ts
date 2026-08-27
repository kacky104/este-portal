// 中継ジョブの出し入れ（第38便・論点② C-2「引き取り型」）。
//
// ★★★ このファイルはサーバー専用。service_role で media_relay_jobs を触る。
//   クライアントから import しないこと（禁則180 と同じ扱い）。
//
//   [Vercel] enqueueRelayJob() でジョブを1件積む
//      ↓ VPS が /api/relay/lease を叩く（外向き）
//   [VPS]    宛先を allowlist で検査 → 駅ちかへ投げる
//      ↓ VPS が /api/relay/result を叩く（外向き）
//   [Vercel] completeRelayJob() で結果を封じ、★ 次のジョブを積む（状態遷移）
//
// ★ 状態遷移そのもの（login → read → write → verify）は第3弾の本体。
//   このファイルは【運び方】だけを持ち、何を運ぶかは知らない。

import { createServiceClient } from '@/app/lib/supabase/service';
import {
  buildRelayRequest,
  sealRequest,
  openRequest,
  sealResponse,
  type RelayRequest,
  type RelayResponse,
} from '@/lib/relayJob';

/** 何回まで投げ直すか。★ 相手のアカウントが凍る形の事故を避けるため、少なくしてある（§17-1）。 */
export const MAX_ATTEMPTS = 3;

/** 掴んだまま落ちた VPS を待つ時間。過ぎたら別の周が拾い直してよい。 */
export const DEFAULT_LEASE_SECONDS = 120;

export type RelayPurpose = 'login' | 'read_work' | 'write_work' | 'verify_work' | 'selftest';

export type LeasedJob = {
  id: string;
  purpose: string;
  attempts: number;
  request: RelayRequest;
};

type JobRow = {
  id: string;
  purpose: string;
  attempts: number;
  request_enc: string;
  status: string;
};

/**
 * ジョブを1件積む。
 * ★ 同じ (salon_id, provider, slot) で走っているジョブがあると、
 *   部分ユニーク索引に弾かれる。これは異常ではなく【順序を守れている】ということなので、
 *   例外にせず 'busy' を返す。
 */
export async function enqueueRelayJob(params: {
  salonId: number;
  provider: string;
  slot: number;
  purpose: RelayPurpose;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ ok: true; jobId: string } | { ok: false; reason: 'busy'; detail: string }> {
  // ★ 積む前に検査する。DBに入ってから弾くのでは、消し忘れた行が残る
  const request = buildRelayRequest({
    method: params.method,
    url: params.url,
    ...(params.headers ? { headers: params.headers } : {}),
    ...(params.body !== undefined ? { body: params.body } : {}),
  });

  const supabase = createServiceClient();
  const jobId = crypto.randomUUID();

  const { error } = await supabase.from('media_relay_jobs').insert({
    id: jobId,
    salon_id: params.salonId,
    provider: params.provider,
    slot: params.slot,
    purpose: params.purpose,
    status: 'queued',
    request_enc: sealRequest(request, jobId),
  });

  if (error) {
    // 23505 = unique_violation（media_relay_jobs_one_active）
    if (error.code === '23505') {
      return {
        ok: false,
        reason: 'busy',
        detail:
          '同じ店舗・媒体・枠で走っているジョブがあるため積まなかった' +
          '（read→変更→write→再read の順序を守るための仕掛け。異常ではない）',
      };
    }
    throw new Error('ジョブを積めなかった: ' + error.message);
  }
  return { ok: true, jobId };
}

/**
 * VPS が1件引き取る。
 * ★ attempts を版番号にした compare-and-swap で掴む（第37便の再送と同じ作法）。
 *   周が重なっても2つのVPSが同じジョブを投げない。
 * ★ leased のまま leased_until を過ぎたものも対象に戻す（落ちたVPSの取りこぼし回収）。
 */
export async function leaseRelayJob(
  leaseSeconds: number = DEFAULT_LEASE_SECONDS,
): Promise<{ job: LeasedJob | null; note: string }> {
  const supabase = createServiceClient();
  const nowISO = new Date().toISOString();

  for (let tries = 0; tries < 5; tries++) {
    const { data, error } = await supabase
      .from('media_relay_jobs')
      .select('id, purpose, attempts, request_enc, status')
      .or('status.eq.queued,and(status.eq.leased,leased_until.lt.' + nowISO + ')')
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw new Error('ジョブを引けなかった: ' + error.message);
    const row = (data ?? [])[0] as JobRow | undefined;
    if (!row) return { job: null, note: '対象件数:0（積まれているジョブが無い）' };

    const until = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const { data: updated, error: upErr } = await supabase
      .from('media_relay_jobs')
      .update({
        status: 'leased',
        attempts: row.attempts + 1,
        leased_at: new Date().toISOString(),
        leased_until: until,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('attempts', row.attempts) // ★ ここが compare-and-swap
      .select('id')
      .maybeSingle();

    if (upErr) throw new Error('ジョブを掴めなかった: ' + upErr.message);
    if (!updated) continue; // 他の周に先を越された。次の候補へ

    return {
      job: {
        id: row.id,
        purpose: row.purpose,
        attempts: row.attempts + 1,
        // ★ openRequest は復号したあと、もう一度 allowlist を通す
        request: openRequest(row.request_enc, row.id),
      },
      note: '引き取った',
    };
  }
  return { job: null, note: '取り合いが続いたので今回は諦めた（次の周で拾う）' };
}

/**
 * VPS から結果を受け取って閉じる。
 * ★ 中身は封をして（暗号化して）から入れる。http_status と bytes だけ平文で置き、
 *   復号せずに様子が見られるようにする。
 */
export async function completeRelayJob(params: {
  jobId: string;
  response?: RelayResponse;
  error?: string;
}): Promise<{ ok: boolean; note: string }> {
  const supabase = createServiceClient();

  const { data: row, error: selErr } = await supabase
    .from('media_relay_jobs')
    .select('id, status, attempts')
    .eq('id', params.jobId)
    .maybeSingle();

  if (selErr) throw new Error('ジョブを読めなかった: ' + selErr.message);
  if (!row) return { ok: false, note: '知らない jobId' };
  if (row.status !== 'leased') {
    // ★ 二重報告。黙って上書きすると、後から来た古い結果で新しい状態を壊す
    return { ok: false, note: '掴まれていないジョブへの結果報告（status=' + row.status + '）。無視した' };
  }

  if (params.error) {
    const giveUp = row.attempts >= MAX_ATTEMPTS;
    await supabase
      .from('media_relay_jobs')
      .update({
        status: giveUp ? 'failed' : 'queued', // ★ 上限までは積み直す
        error: params.error.slice(0, 500),
        leased_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.jobId);
    return { ok: true, note: giveUp ? '3回失敗したので諦めた' : '失敗。次の周で投げ直す' };
  }

  const res = params.response;
  if (!res) return { ok: false, note: '結果も失敗理由も無い報告' };

  await supabase
    .from('media_relay_jobs')
    .update({
      status: 'done',
      response_enc: sealResponse(res, params.jobId),
      http_status: res.status,
      bytes: res.bodyPacked.length,
      error: null,
      leased_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.jobId);

  // ★★★ ここが状態遷移の場所（第3弾の本体）。
  //   login の結果を見て read_work を積む、read の結果を見て write_work を積む…を書く。
  //   第38便では【運び方】だけを通した。何を運ぶかはまだ知らない。
  //   → 次に足すときは advanceRelayFlow(jobId, res) をここから呼ぶ。

  return { ok: true, note: '結果を受け取った' };
}

/**
 * 終わったジョブの中身を消す。★ 秘密が残り続ける場所を作らない。
 * メタ（誰の・いつ・どの purpose・httpステータス）は監査のため残す。
 */
export async function purgeRelayJobs(olderThanMinutes = 60): Promise<{ purged: number }> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('media_relay_jobs')
    .update({ request_enc: '(purged)', response_enc: null, purged_at: new Date().toISOString() })
    .is('purged_at', null)
    .in('status', ['done', 'failed', 'expired'])
    .lt('updated_at', cutoff)
    .select('id');

  if (error) throw new Error('掃除に失敗: ' + error.message);
  return { purged: (data ?? []).length };
}
