import { NextResponse } from 'next/server';
import { startRelayFlow } from '@/app/lib/media/relayFlow';

// ── 出勤の連携フローを1つ始める（第109便・運営だけの口）───────────────────────
//   POST /api/admin/work-flow  (Authorization: Bearer <CRON_SECRET>)
//   body(form): salonId=6  provider=esutama  slot=1  intent=connect_test|roster_read|work_dryrun|work_push
//
// ★★★ この口がすること: 中継ジョブ（最初の段）を1件積むだけ。★ 実際に投げるのは VPS の周。
// ★★ intent の既定は work_dryrun（試し打ち）。★ work_push は【人が結果を見てから】打つ。
// ★ 店舗の画面（LoginBoard）にまだ無い媒体（エステ魂）を、運営が確かめるための口。
//   ★ 駅ちかの承認（media_work_plans の指紋）は通らないので、駅ちかには使わない（provider を制限）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROVIDERS = ['esutama'] as const;
const INTENTS = ['connect_test', 'roster_read', 'work_dryrun', 'work_push'] as const;

async function readBody(req: Request): Promise<Record<string, string>> {
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  const o: Record<string, string> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try { const v = JSON.parse(text); if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) o[k] = String(x); } catch { /* 空 */ }
    return o;
  }
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const salonId = Number(body.salonId);
  const provider = String(body.provider ?? '');
  const slot = Number.isFinite(Number(body.slot)) && Number(body.slot) > 0 ? Number(body.slot) : 1;
  const intent = String(body.intent ?? 'work_dryrun');

  if (!Number.isFinite(salonId) || salonId <= 0) return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!(PROVIDERS as readonly string[]).includes(provider)) return NextResponse.json({ ok: false, error: 'provider はこの口では ' + PROVIDERS.join('/') + ' だけ' }, { status: 400 });
  if (!(INTENTS as readonly string[]).includes(intent)) return NextResponse.json({ ok: false, error: 'intent は ' + INTENTS.join('/') + ' のどれか' }, { status: 400 });

  const r = await startRelayFlow({
    salonId, provider, slot,
    intent: intent as (typeof INTENTS)[number],
    actor: 'admin:work-flow',
  });
  return NextResponse.json({ ...r, salonId, provider, slot, intent });
}
