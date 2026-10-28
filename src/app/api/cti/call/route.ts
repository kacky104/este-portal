import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ctiDeviceOverLimit, findCtiDeviceByToken, normalizeIncomingPhone, parseHiddenReason, recordCtiCall } from '@/app/lib/crm/cti';

// ── フクエスCRM 着信ポップ：受付の Android アプリが「かかってきた番号」を送ってくる口（第1685便・2026-10-28）──
//   POST /api/cti/call   (Authorization: Bearer <端末のトークン>)
//   body(JSON): { phone: "09012345678" | "+819012345678" | null, hidden: "withheld" | "payphone" | "unknown" | null,
//                rangAt: "2026-10-28T12:34:56+09:00", eventId: "uuid" }
//
// ★★ 守り（設計メモ §3・§7）
//   ・トークンは sha256 で照合（lib/crm/cti.ts）。無効・止まっている端末 → 401（理由は返さない）
//   ・同じ端末の同じ eventId は1行（アプリの再送）。同じ番号 10 秒以内も1行（RINGING を2回投げる機種）
//   ・1 端末 60 件/分を超えたら 429
//   ・返事は { ok: true } だけ。★★ 台帳の情報は一切返さない（端末を落としても顧客情報は漏れない）
//   ・番号が数字にならない（非通知・公衆電話・海外の変な形）ときは phone null・hidden に理由（記録には残す・カッキーさん決定⑦）
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function bearer(req: Request): string {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : '';
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch { return {}; }
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });

  const svc = createServiceClient();
  const device = await findCtiDeviceByToken(svc, token);
  if (!device) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });

  if (await ctiDeviceOverLimit(svc, device.id)) {
    return NextResponse.json({ ok: false, error: 'too many' }, { status: 429, headers: NO_STORE });
  }

  const body = await readJson(req);
  const phone = normalizeIncomingPhone(body.phone);
  const hidden = phone ? null : (parseHiddenReason(body.hidden) ?? 'unknown');

  const r = await recordCtiCall(svc, {
    salonId: device.salon_id,
    deviceId: device.id,
    phone,
    hidden,
    eventId: typeof body.eventId === 'string' ? body.eventId : null,
    rangAt: typeof body.rangAt === 'string' ? body.rangAt : null,
  });
  if (!r.ok) {
    console.error('[cti] 着信を記録できなかった', device.id, r.error);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }

  // 最後の着信の時刻（/admin の「最後の着信 ◯分前」）。失敗しても着信は記録済みなので無視
  await svc.from('crm_cti_devices').update({ last_call_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }).eq('id', device.id);

  // ★★ 返すのはこれだけ
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
