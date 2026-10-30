import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { placeBookingCall, voiceEnabled } from '@/app/lib/booking/bookingCall';

// ── 予約の電話通知：再発信（第1702便・2026-10-30）────────────────────────────
//   GET /api/cron/booking-call  (Authorization: Bearer <CRON_SECRET>)・vercel.json で1分ごと
//   ★ booking_calls.next_attempt_at が来た行を拾い、次の回をかける（予約がまだ 'new' のときだけ・placeBookingCall 側で確かめる）。
//   ★ 二重にかけないよう、next_attempt_at を空にできた行だけかける（取り合いに勝った方だけ）。
//   ★ TWILIO_VOICE_ENABLED が無ければ何もしない。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!voiceEnabled()) return NextResponse.json({ ok: true, note: 'disabled' });

  const svc = createServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await svc
    .from('booking_calls')
    .select('id, salon_id, booking_id, attempt')
    .lte('next_attempt_at', nowIso)
    .not('next_attempt_at', 'is', null)
    .order('next_attempt_at', { ascending: true })
    .limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results: Array<{ id: number; result: string }> = [];
  for (const r of data ?? []) {
    const { data: claimed } = await svc
      .from('booking_calls')
      .update({ next_attempt_at: null })
      .eq('id', r.id)
      .not('next_attempt_at', 'is', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;
    const res = await placeBookingCall({
      svc,
      salonId: Number(r.salon_id),
      kind: 'booking',
      bookingId: r.booking_id,
      attempt: Number(r.attempt) + 1,
    });
    results.push({ id: Number(r.id), result: res.ok ? 'called' : res.reason });
  }
  return NextResponse.json({ ok: true, picked: results.length, results });
}
