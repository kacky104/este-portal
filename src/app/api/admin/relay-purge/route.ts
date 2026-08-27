import { NextResponse } from 'next/server';
import { sweepRelayJobs } from '@/app/lib/media/relayQueue';

// ── 中継ジョブの掃除の周（第38便の残り物・第39便）─────────────────────
//   POST /api/admin/relay-purge  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean, olderThanMinutes?: number, graceMinutes?: number }
//
// ★★★ この周がやることは2つ。順番に意味がある。
//   1. 居座ったジョブを 'expired' に落とす
//        VPS が3回目の lease の直後に落ちると、その行は leased のまま誰にも拾われない。
//        status in ('queued','leased') の部分ユニーク索引に残るので、
//        ★ その店舗×媒体×枠は以後ずっと enqueue が busy になり、書き込みが静かに止まる。
//   2. 終わったジョブの中身を消す（purged_at）
//        request_enc にはパスワード、response_enc にはセッションCookieが入りうる。
//        ★ 秘密が残り続ける場所を作らない。監査のためメタだけ残す。
//
// ★ apply 既定 false（試し打ち）。何件動かすつもりかだけ返す。
//   取り込み・/api/admin/diary-forward-retry と同じ作法。
//
// ★ 返り値の stuckQueued（1時間以上積まれたまま）は【触らない】。
//   VPS が止まっているだけかもしれないので自動では消さない。数だけ見えるようにしてある。
//   ここが増え続けているなら relay.sh の heartbeat を見ること:
//     ssh root@160.251.174.184 "cat /root/relay.heartbeat"
//
// crontab（VPS・1日4回で十分。中継そのものは毎分の relay.sh が回している）:
//   40 */6 * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/relay-purge -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown; olderThanMinutes?: unknown; graceMinutes?: unknown } = {};
  try { body = (await req.json()) as typeof body; }
  catch { /* body なしでも動く（既定＝試し打ち） */ }

  const older = Number(body.olderThanMinutes);
  const grace = Number(body.graceMinutes);

  try {
    const result = await sweepRelayJobs({
      apply: body.apply === true,
      // ★ 極端な値で「全部いま消す」ができないようにする。下限を置く
      ...(Number.isFinite(older) && older >= 10 ? { olderThanMinutes: older } : {}),
      ...(Number.isFinite(grace) && grace >= 5 ? { graceMinutes: grace } : {}),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
