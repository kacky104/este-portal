import { createServiceClient } from '@/app/lib/supabase/service';
import { calcTotals, dueDateOf, isMonth, lineAmount, linesForMonth, type ContractLine } from '@/lib/billing';

// 月の請求書の下書きをまとめて作る（第816便）。★ 管理画面（requireAdmin のあと）と cron（CRON_SECRET）から呼ぶ。
// ★ 'use server' の外に置く＝ブラウザから直接は呼べない。

// ── 月の下書きをまとめて作る（cron からも呼ぶ）──────────
//   ★ 契約の行がその月に1本以上ある店だけ。★ 取り消し以外の請求書がもうある店は飛ばす（二重に作らない）
export async function createDraftsCore(month: string): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  if (!isMonth(month)) return { ok: false, error: '月の形が正しくありません' };
  const svc = createServiceClient();
  const [st, sa, pr, li, iv] = await Promise.all([
    svc.from('billing_settings').select('tax_rate_pct, due_day').eq('id', 1).maybeSingle(),
    svc.from('salons').select('id, name'),
    svc.from('salon_billing_profiles').select('salon_id, recipient_name, payment_method'),
    svc.from('salon_billing_lines').select('salon_id, label, unit_price, quantity, start_month, end_month, sort_order'),
    svc.from('invoices').select('salon_id, status').eq('billing_month', month),
  ]);
  const e = st.error ?? sa.error ?? pr.error ?? li.error ?? iv.error;
  if (e) return { ok: false, error: e.message };
  const taxRate = (st.data?.tax_rate_pct as number | undefined) ?? 10;
  const dueDay = (st.data?.due_day as number | undefined) ?? 25;
  const names = new Map((sa.data ?? []).map((s) => [s.id as number, s.name as string]));
  const profiles = new Map((pr.data ?? []).map((p) => [p.salon_id as number, p]));
  const taken = new Set((iv.data ?? []).filter((r) => r.status !== 'void').map((r) => r.salon_id as number));
  const bySalon = new Map<number, (ContractLine & { salon_id: number })[]>();
  for (const l of (li.data ?? []) as (ContractLine & { salon_id: number })[]) {
    const arr = bySalon.get(l.salon_id) ?? []; arr.push(l); bySalon.set(l.salon_id, arr);
  }
  let created = 0, skipped = 0;
  for (const [salonId, all] of bySalon) {
    const lines = linesForMonth(all, month);
    if (lines.length === 0) continue;
    if (taken.has(salonId)) { skipped++; continue; }
    const prof = profiles.get(salonId);
    const t = calcTotals(lines, taxRate);
    const { data: inv, error: ie } = await svc.from('invoices').insert({
      salon_id: salonId, billing_month: month, status: 'draft',
      recipient_name: (prof?.recipient_name as string | null) || names.get(salonId) || '',
      payment_method: prof?.payment_method === 'cash' ? 'cash' : 'transfer',
      due_date: dueDateOf(month, dueDay), subtotal: t.subtotal, tax_amount: t.tax, total: t.total, tax_rate_pct: taxRate,
    }).select('id').single();
    if (ie) { if (ie.code === '23505') { skipped++; continue; } return { ok: false, error: ie.message }; }
    const { error: le } = await svc.from('invoice_lines').insert(lines.map((l, i) => ({
      invoice_id: inv.id, label: l.label, unit_price: l.unit_price, quantity: l.quantity, amount: lineAmount(l), sort_order: i,
    })));
    if (le) return { ok: false, error: le.message };
    created++;
  }
  return { ok: true, created, skipped };
}

