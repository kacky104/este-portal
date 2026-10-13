import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { jstTodayYmd } from '@/app/lib/salonStats';
import { autoRemindCore } from '@/app/lib/billing/issue';
import { planInvoiceRemind } from '@/lib/invoiceAutoRemind';
import { monthLabel } from '@/lib/billing';

// ── 請求書の自動催促（第1433便・2026-10-13・カッキーさん）──────────────────
//   GET /api/cron/invoice-remind  (Authorization: Bearer <CRON_SECRET>)
//
// ★ Vercel の定期実行（vercel.json の crons・毎日 01:00 UTC ＝ 10:00 日本時間）から動く。
// ★ 期限の翌日に1回目（メール＋マイページの赤い帯）、1回目から5日後に2回目（メール）。決め方は lib/invoiceAutoRemind.ts。
// ★ 入金待ち（issued）で期限を過ぎたものだけ読む。入金済みにすれば止まる（帯も消える）。
// ★ 送ったら・送れなかったら、運営（カッキーさん）にまとめて1通知らせる。何も無い日は知らせない。
// ★ ?dry=1 を付けると、送る予定を返すだけ（メールを出さない・DB に書かない）。
// ★ 列が無い（追加SQL_第1433便がまだ）ときは何もしない。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const today = jstTodayYmd();
  const svc = createServiceClient();

  const { data, error } = await svc
    .from('invoices')
    .select('id, salon_id, status, recipient_name, billing_month, invoice_no, total, due_date, auto_remind1_at, auto_remind2_at')
    .eq('status', 'issued')
    .lt('due_date', today);
  if (error) {
    if (error.code === '42703' || /auto_remind/.test(error.message)) {
      return NextResponse.json({ ok: true, note: '列 auto_remind1_at が無い（追加SQL_第1433便がまだ）。何もしていない' });
    }
    console.error('[invoice-remind] 読めなかった', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const plans = (data ?? [])
    .map((r) => ({ r, kind: planInvoiceRemind({
      status: String(r.status), due_date: (r.due_date as string | null) ?? null,
      auto_remind1_at: (r.auto_remind1_at as string | null) ?? null, auto_remind2_at: (r.auto_remind2_at as string | null) ?? null,
    }, today) }))
    .filter((p): p is { r: typeof p.r; kind: 'first' | 'second' } => p.kind !== null);

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, today, plans: plans.map((p) => ({ id: p.r.id, salon_id: p.r.salon_id, due_date: p.r.due_date, kind: p.kind })) });
  }

  const lines: string[] = [];
  let failed = 0;
  for (const p of plans) {
    const r = p.r;
    const label = `${r.recipient_name}（${monthLabel(String(r.billing_month))}分・${r.invoice_no ?? ''}・期限 ${r.due_date}）`;
    const res = await autoRemindCore({
      id: Number(r.id), salon_id: Number(r.salon_id), recipient_name: String(r.recipient_name ?? ''),
      billing_month: String(r.billing_month), invoice_no: (r.invoice_no as string | null) ?? null,
      total: Number(r.total), due_date: String(r.due_date),
    }, p.kind);
    const what = p.kind === 'first' ? '1回目（メール＋赤い帯）' : '2回目（メール）';
    if (res.ok) lines.push(`・${what} 送信: ${label} → ${res.to}`);
    else { failed++; lines.push(`・${what} 失敗: ${label} … ${res.error}`); }
  }

  if (lines.length > 0) {
    await notifyAdmin(
      `【フクエス】請求書の自動催促 ${today}（${plans.length - failed}件送信${failed ? `・${failed}件失敗` : ''}）`,
      [...lines, '', '入金を確認したら、管理画面の請求書で「入金済み」にしてください（帯とメールが止まります）。'],
    );
  }
  return NextResponse.json({ ok: true, today, sent: plans.length - failed, failed });
}
