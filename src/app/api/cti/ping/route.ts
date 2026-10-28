import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { findCtiDeviceByToken } from '@/app/lib/crm/cti';

// ── フクエスCRM 着信ポップ：受付の Android アプリの生存確認（第1685便・2026-10-28）──
//   POST /api/cti/ping   (Authorization: Bearer <端末のトークン>)
//   body(JSON): { appVersion?: "1.0.3", model?: "Pixel 7a", android?: "15" }
//   ★ アプリ起動時と 15 分ごと。/admin と CRM の設定画面で「アプリが動いているか（最後の確認 ◯分前）」を見るため。
//   ★ 返事は { ok: true, name } だけ（端末の画面に「接続中・受付1」と出すための名前。台帳の情報は返さない）。
//   ★ QR を読んだ直後の「つながったか」の確認もこれ（401 ならトークンが違う・止まっている）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function bearer(req: Request): string {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : '';
}
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  const svc = createServiceClient();
  const device = await findCtiDeviceByToken(svc, token);
  if (!device) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });

  let body: Record<string, unknown> = {};
  try { const v = await req.json(); if (v && typeof v === 'object') body = v as Record<string, unknown>; } catch { /* 空でよい */ }

  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (body.appVersion != null) patch.app_version = str(body.appVersion, 40);
  if (body.model != null) patch.device_model = str(body.model, 80);
  if (body.android != null) patch.android_version = str(body.android, 20);
  const { error } = await svc.from('crm_cti_devices').update(patch).eq('id', device.id);
  if (error) console.error('[cti] ping を記録できなかった', device.id, error.message);

  return NextResponse.json({ ok: true, name: device.name }, { headers: NO_STORE });
}
