import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { callbackUrl, nextAttemptAt, verifyTwilioSignature, type CallKind } from '@/app/lib/booking/bookingCall';

// ── 予約の電話通知：Twilio から「電話の結果」を受け取る口（第1702便・2026-10-30）──────────
//   URL: https://fukues.com/api/webhooks/twilio-voice（発信のときに StatusCallback として渡す・Twilio Console の設定は不要）
//   ★ 署名（X-Twilio-Signature）が合わなければ 403。検証に使う URL は発信時に渡したものと同じ文字列（callbackUrl()）。
//     （Vercel の内側の req.url はプロキシで変わることがあるので使わない）
//   ★ 受けるのは completed イベントだけ（CallStatus = completed／busy／no-answer／failed／canceled）。
//   ★ 出ない・話中・失敗 で、店舗様が再発信をオンにしていて、まだ1回目なら 3分後の予定を入れる（cron /api/cron/booking-call がかける）。
//     留守電に入った回は completed なので、かけ直さない。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['queued', 'initiated', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled']);

export async function POST(req: Request) {
  const raw = await req.text();
  const form = new URLSearchParams(raw);
  const params: Record<string, string> = {};
  for (const [k, v] of form) params[k] = v;

  if (!verifyTwilioSignature(callbackUrl(), params, req.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const sid = params.CallSid ?? '';
  const status = params.CallStatus ?? '';
  if (!/^CA[0-9a-f]{32}$/.test(sid) || !STATUSES.has(status)) return NextResponse.json({ ok: true, note: 'ignored' });

  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from('booking_calls')
    .select('id, salon_id, kind, attempt')
    .eq('call_sid', sid)
    .maybeSingle();
  if (error) {
    console.error('[twilio-voice] 記録を読めなかった', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });   // Twilio が送り直す
  }
  if (!row) return NextResponse.json({ ok: true, note: 'unknown call' });

  let retryEnabled = false;
  if (status === 'busy' || status === 'no-answer' || status === 'failed') {
    const { data: s } = await svc.from('salon_call_settings').select('booking_call_retry').eq('salon_id', row.salon_id).maybeSingle();
    retryEnabled = !!s?.booking_call_retry;
  }
  const duration = Number(params.CallDuration);
  const { error: upErr } = await svc
    .from('booking_calls')
    .update({
      status,
      duration_sec: Number.isFinite(duration) && duration >= 0 ? Math.floor(duration) : null,
      error: params.ErrorCode ? `Twilio ${params.ErrorCode}` : null,
      next_attempt_at: nextAttemptAt({ kind: row.kind as CallKind, status, attempt: Number(row.attempt), retryEnabled }),
    })
    .eq('id', row.id);
  if (upErr) {
    console.error('[twilio-voice] 記録を更新できなかった', upErr.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
