import { NextResponse } from 'next/server';
import { completeRelayJob } from '@/app/lib/media/relayQueue';
import { filterResponseHeaders, MAX_RESPONSE_BODY_BYTES } from '@/lib/relayJob';

// ── 中継ジョブの結果を受け取る（第38便・論点② C-2）──────────────────
//   POST /api/relay/result  (Authorization: Bearer <CRON_SECRET>)
//   body: { jobId, status?, headers?, bodyPacked?, error? }
//         bodyPacked … gzip して base64 にした本文（出勤ページは実測2.3MB）
//
// ★★★ ここが状態遷移の場所になる。
//   いまは結果を封じて閉じるだけだが、第3弾では
//   「login の結果を見て read_work を積む」「read の結果を見て write_work を積む」を
//   completeRelayJob() の中から呼ぶ。**次のジョブを積むのはフクエス側**。
//   VPS は最後まで中身を理解しない。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: {
    jobId?: unknown;
    status?: unknown;
    headers?: unknown;
    bodyPacked?: unknown;
    error?: unknown;
  };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: 'JSONとして読めない' }, { status: 400 }); }

  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  if (!jobId) return NextResponse.json({ ok: false, error: 'jobId が無い' }, { status: 400 });

  try {
    if (typeof body.error === 'string' && body.error) {
      const r = await completeRelayJob({ jobId, error: body.error });
      return NextResponse.json({ ok: r.ok, note: r.note });
    }

    const status = Number(body.status);
    if (!Number.isFinite(status) || status < 100 || status > 599) {
      return NextResponse.json({ ok: false, error: 'status が HTTP ステータスとして読めない' }, { status: 400 });
    }
    const bodyPacked = typeof body.bodyPacked === 'string' ? body.bodyPacked : '';
    if (bodyPacked.length > MAX_RESPONSE_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: '本文が大きすぎる' }, { status: 413 });
    }

    const headers = filterResponseHeaders(
      (body.headers ?? {}) as Record<string, string | string[]>,
    );

    const r = await completeRelayJob({ jobId, response: { status, headers, bodyPacked } });
    return NextResponse.json({ ok: r.ok, note: r.note });
  } catch (e) {
    // ★ 例外文に秘密が混ざらないよう、relayQueue 側で作った文言をそのまま返す
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
