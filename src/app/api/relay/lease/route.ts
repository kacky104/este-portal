import { NextResponse } from 'next/server';
import { leaseRelayJob, DEFAULT_LEASE_SECONDS } from '@/app/lib/media/relayQueue';

// ── 中継ジョブの引き取り（第38便・論点② C-2）──────────────────────────
//   POST /api/relay/lease  (Authorization: Bearer <CRON_SECRET>)
//   body: { leaseSeconds?: number }
//
// ★★★ 向きに意味がある。**VPS から叩きに来る**（引き取り型）。
//   VPS に HTTP サーバーを立てて Vercel から叩く形（押し込み型）にすると、
//   VPS を公開サーバーにすることになる。いま VPS は外向きの curl しかしていないので、
//   その作法を崩さない。代償はレイテンシだけで、出勤の更新は1日数回なので困らない。
//
// ★★ ここは復号した本物のリクエスト（Cookie・パスワードを含む）を返す。
//   VPS が投げるのだから避けられない。守っているのは TLS と CRON_SECRET。
//   だからこそ VPS 側にも allowlist を置き、終わったジョブの中身は消す。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { leaseSeconds?: unknown } = {};
  try { body = (await req.json()) as { leaseSeconds?: unknown }; }
  catch { /* body なしでも動く */ }

  const n = Number(body.leaseSeconds);
  const leaseSeconds = Number.isFinite(n) && n > 0 && n <= 600 ? n : DEFAULT_LEASE_SECONDS;

  try {
    const { job, note } = await leaseRelayJob(leaseSeconds);
    // ★ 0件のときも理由を返す（第35便の反省6・「0を報告するときは0の理由が読み取れる形に」）
    return NextResponse.json({ ok: true, job, note, leaseSeconds });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
