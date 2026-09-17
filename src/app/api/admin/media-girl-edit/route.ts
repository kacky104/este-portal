import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { buildGirlEditValues } from '@/app/lib/media/girlEditPlan';

// ── 駅ちかの女の子プロフィールを更新する（第415便・運営だけの口）─────────────────────
//   POST /api/admin/media-girl-edit  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, therapistId, slot?: 1, relay?: boolean, apply?: boolean }
//
// ★★★ 3段の試し方（★ 迷ったら送らない）
//   何も付けない         … DB から作った「送る材料」を返すだけ（★ 中継も動かない）
//   relay=true           … 中継が駅ちかの編集ページを**読むだけ**。★ 「何が変わるか」が監査（event=edit_girl・【試し打ち】）に出る
//   relay=true&apply=true … ★ 実際に送る。★ 送ったあと編集ページを読み直して照合する
//
// ★ 決めごと（src/lib/ekichikaGirlEdit.ts）: 空の欄は触らない／上限を超える欄は送らない／名前は送らない
// ★ 送り先サイトで駅ちかを「送らない」にしている方は断る（第408便）
// ★★ 店舗様の画面のボタンは、実弾が通ってから（第234〜260便と同じ段取り）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') ?? '';
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  if (ct.includes('application/json')) {
    try { const v = JSON.parse(text); return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}; } catch { return {}; }
  }
  const o: Record<string, unknown> = {};
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  for (const k of ['apply', 'relay']) if (o[k] === 'true') o[k] = true;
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const salonId = Number(body.salonId);
  const therapistId = Number(body.therapistId);
  const slot = Number.isFinite(Number(body.slot)) && Number(body.slot) > 0 ? Number(body.slot) : 1;
  const relay = body.relay === true;
  const apply = relay && body.apply === true;
  if (!Number.isFinite(salonId) || salonId <= 0) return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!Number.isFinite(therapistId) || therapistId <= 0) return NextResponse.json({ ok: false, error: 'therapistId が要る' }, { status: 400 });

  const svc = createServiceClient();
  const built = await buildGirlEditValues(svc, { salonId, therapistId, slot });
  if (!built.ok) return NextResponse.json({ ok: false, error: built.error }, { status: built.status });

  if (!relay) {
    return NextResponse.json({ ok: true, relay: false, applied: false, ...built.data, note: '材料だけ。★ 中継は動いていません。★ relay=true で編集ページを読んで「何が変わるか」を記録します' });
  }
  const r = await startRelayFlow({
    salonId, provider: 'ekichika', slot,
    intent: 'girl_edit',
    actor: apply ? 'admin:girl-edit' : 'admin:girl-edit-dryrun',
    girlEdit: { castId: built.data.castId, name: built.data.name, values: built.data.values, apply },
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, relay: true, applied: apply, castId: built.data.castId, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=edit_girl）で見えます' + (apply ? '' : '（試し打ち・送っていません）'),
  });
}
